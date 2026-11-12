import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { CalEvent, EventsData } from "../types";
import { parseEventDate } from "./dates.ts";
import {
  buildEventICal,
  buildICal,
  eventFilename,
  googleCalendarUrl,
} from "./ical.ts";

function ev(partial: Partial<CalEvent> = {}): CalEvent {
  return {
    uid: "e_test00000001",
    day: "Sun",
    date: "Dec 13",
    event: "Fay Victor: Black Poems",
    where: "Brooklyn Public Library (Dweck Auditorium)",
    cost: "FREE",
    category: "sound",
    flag: null,
    mode: "witness",
    start: "16:00",
    end: null,
    note: "Free with RSVP. Doors 3:30pm.",
    url: "https://www.fouroneoneprojects.org/events/fay-victor-black-poems",
    ...partial,
  };
}

/** Undo RFC 5545 folding: a CRLF followed by one space joins the lines. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

/**
 * The value of an event property, parameters dropped. Looks past the time zone
 * block, which has DTSTART lines of its own.
 */
function prop(ics: string, name: string): string | undefined {
  const text = unfold(ics);
  const line = text
    .slice(Math.max(0, text.indexOf("BEGIN:VEVENT")))
    .split("\r\n")
    .find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
  return line?.slice(line.indexOf(":") + 1);
}

/** Each VEVENT keyed by UID, with the clock-dependent DTSTAMP removed. */
function vevents(ics: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of unfold(ics).split("BEGIN:VEVENT\r\n").slice(1)) {
    const body = block
      .slice(0, block.indexOf("END:VEVENT"))
      .split("\r\n")
      .filter((l) => !l.startsWith("DTSTAMP:"))
      .join("\n");
    out.set(prop(block, "UID") ?? "", body);
  }
  return out;
}

const google = (e: CalEvent) => new URL(googleCalendarUrl(e) ?? "about:blank");

const all: CalEvent[] = (
  JSON.parse(
    readFileSync(new URL("../data/events.json", import.meta.url), "utf8"),
  ) as EventsData
).weeks.flatMap((w) => w.events);

test("one event's file holds that event alone, under the feed's UID", () => {
  const ics = buildEventICal(ev());
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
  assert.equal(prop(ics, "UID"), "e_test00000001@nyc-creative-calendar");
  assert.equal(prop(ics, "SUMMARY"), "Fay Victor: Black Poems");
  assert.match(prop(ics, "DTSTAMP") ?? "", /^\d{8}T\d{6}Z$/);
});

test("every line ends in CRLF, never a bare LF", () => {
  const ics = buildEventICal(ev({ note: "Line one.\nLine two." }));
  assert.ok(!/(^|[^\r])\n/.test(ics));
  assert.ok(ics.split("\r\n").length > 10);
});

test("a timed event is in New York time and runs two hours with no end", () => {
  const ics = buildEventICal(ev());
  assert.match(ics, /\r\nDTSTART;TZID=America\/New_York:20261213T160000\r\n/);
  assert.match(ics, /\r\nDTEND;TZID=America\/New_York:20261213T180000\r\n/);
});

test("an end time is used as given", () => {
  const ics = buildEventICal(ev({ date: "Nov 21", start: "10:00", end: "17:00" }));
  assert.equal(prop(ics, "DTSTART"), "20261121T100000");
  assert.equal(prop(ics, "DTEND"), "20261121T170000");
});

test("no start time makes an all-day event that ends the next day", () => {
  const ics = buildEventICal(ev({ date: "Nov 18", start: null }));
  assert.match(ics, /\r\nDTSTART;VALUE=DATE:20261118\r\n/);
  assert.match(ics, /\r\nDTEND;VALUE=DATE:20261119\r\n/);
  assert.ok(!ics.includes("DTSTART;TZID"));
});

test("an all-day event on Dec 31 ends on Jan 1 of the next year", () => {
  const e = ev({ date: "Dec 31", start: null });
  assert.equal(prop(buildEventICal(e), "DTEND"), "20270101");
  assert.equal(google(e).searchParams.get("dates"), "20261231/20270101");
});

test("a late show ends the next morning, not before it starts", () => {
  const night = buildEventICal(ev({ date: "Nov 20", start: "22:00", end: "01:00" }));
  assert.equal(prop(night, "DTSTART"), "20261120T220000");
  assert.equal(prop(night, "DTEND"), "20261121T010000");

  const noEnd = buildEventICal(ev({ date: "Nov 30", start: "23:30", end: null }));
  assert.equal(prop(noEnd, "DTEND"), "20261201T013000");
});

test("an end that repeats the start, or comes hours before it, gets two hours", () => {
  const same = buildEventICal(ev({ start: "19:30", end: "19:30" }));
  assert.equal(prop(same, "DTEND"), "20261213T213000");
  // 19:00–14:30 is a typo, not a 19-and-a-half-hour night.
  const typo = buildEventICal(ev({ start: "19:00", end: "14:30" }));
  assert.equal(prop(typo, "DTEND"), "20261213T210000");
});

test("the year is the one dates.ts gives the calendar", () => {
  const e = ev({ date: "Jan 10", start: null });
  const year = parseEventDate("Jan 10")?.getFullYear();
  assert.equal(prop(buildEventICal(e), "DTSTART"), `${year}0110`);
  assert.equal(google(e).searchParams.get("dates"), `${year}0110/${year}0111`);
});

test("commas, semicolons, backslashes and newlines are escaped", () => {
  const ics = buildEventICal(
    ev({
      event: "Bach, Brahms; a \\ b",
      where: "Roulette, Brooklyn",
      note: "Doors 7.\nMusic 7:30.",
    }),
  );
  assert.equal(prop(ics, "SUMMARY"), "Bach\\, Brahms\\; a \\\\ b");
  assert.equal(prop(ics, "LOCATION"), "Roulette\\, Brooklyn");
  assert.ok(prop(ics, "DESCRIPTION")?.startsWith("Doors 7.\\nMusic 7:30.\\n"));
});

test("long lines fold at 75 octets without splitting a character", () => {
  const url = `https://example.org/events/${"a-long-path-segment/".repeat(12)}`;
  const title = "Café Müller ☆ ".repeat(8).trim();
  const ics = buildEventICal(ev({ event: title, url }));
  const enc = new TextEncoder();
  for (const line of ics.split("\r\n")) {
    assert.ok(enc.encode(line).length <= 75, `too long: ${line}`);
  }
  assert.ok(ics.includes("\r\n "), "expected at least one folded line");
  assert.equal(prop(ics, "URL"), url);
  assert.equal(prop(ics, "SUMMARY"), title);
});

test("the single-event file is that event's entry in the feed", () => {
  const feed = vevents(buildICal(all, { calendarName: "Art Cal" }));
  assert.equal(feed.size, all.length);
  for (const e of all) {
    const own = vevents(buildEventICal(e));
    assert.equal(own.size, 1);
    const [uid, body] = [...own][0];
    assert.equal(body, feed.get(uid), `${e.date} ${e.event}`);
  }
});

test("every event in events.json ends after it starts", () => {
  for (const [, body] of vevents(buildICal(all))) {
    const start = /DTSTART[^:]*:(\S+)/.exec(body)?.[1] ?? "";
    const end = /DTEND[^:]*:(\S+)/.exec(body)?.[1] ?? "";
    assert.ok(end > start, `${start} → ${end}\n${body}`);
  }
});

test("the Google link carries title, New York times, place and the event's link", () => {
  const e = ev();
  const raw = googleCalendarUrl(e) ?? "";
  assert.ok(
    raw.startsWith(
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=",
    ),
  );
  assert.ok(raw.includes("&dates=20261213T160000/20261213T180000&"));
  assert.ok(raw.includes("&ctz=America/New_York&"));
  const p = google(e).searchParams;
  assert.equal(p.get("action"), "TEMPLATE");
  assert.equal(p.get("text"), "Fay Victor: Black Poems");
  assert.equal(p.get("ctz"), "America/New_York");
  assert.equal(p.get("location"), "Brooklyn Public Library (Dweck Auditorium)");
  assert.equal(
    p.get("details"),
    "Free with RSVP. Doors 3:30pm.\nCost: FREE\nsound · witness\n\n" +
      "https://www.fouroneoneprojects.org/events/fay-victor-black-poems",
  );
});

test("an all-day event on Google is YYYYMMDD to the next day", () => {
  const p = google(ev({ date: "Nov 18", start: null })).searchParams;
  assert.equal(p.get("dates"), "20261118/20261119");
});

test("characters that mean something in a URL survive the trip", () => {
  const title = "Bill + Ted & Co #1? a=b/c";
  assert.equal(google(ev({ event: title })).searchParams.get("text"), title);
});

test("Google and the .ics agree on every event's times", () => {
  for (const e of all) {
    const ics = buildEventICal(e);
    assert.equal(
      google(e).searchParams.get("dates"),
      `${prop(ics, "DTSTART")}/${prop(ics, "DTEND")}`,
      `${e.date} ${e.event}`,
    );
  }
});

test("a date that can't be read gives no link and no event", () => {
  const e = ev({ date: "TBA" });
  assert.equal(googleCalendarUrl(e), null);
  assert.ok(!buildEventICal(e).includes("BEGIN:VEVENT"));
});

test("the file is named after the event", () => {
  assert.equal(eventFilename(ev()), "fay-victor-black-poems.ics");
  assert.equal(eventFilename(ev({ event: "☆☆☆" })), "event.ics");
});
