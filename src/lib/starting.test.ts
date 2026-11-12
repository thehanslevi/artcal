import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalEvent } from "../types";
import type { Practice } from "../types/practice";
import { judgeStarting, startingSoon, type StartingInput } from "./starting";

// Fixtures only. src/lib/events.ts reads the build's virtual modules, which
// Node can't load, so nothing here touches it or events.json.

const TODAY = new Date(2026, 10, 12); // Thu Nov 12, 2026
const MONDAY = new Date(2026, 10, 9); // where the page's events begin
const LONG_AGO = new Date(2026, 6, 1); // full history

let uid = 0;
function ev(partial: Partial<CalEvent> & { date: string; event: string }): CalEvent {
  uid += 1;
  return {
    uid: `e_${uid}`,
    day: "",
    where: "Somewhere",
    venue: "Somewhere",
    neighborhood: null,
    address: null,
    cost: "TBD",
    category: "making",
    flag: null,
    mode: "make",
    start: null,
    end: null,
    note: null,
    url: "https://somewhere.example/classes",
    ...partial,
  };
}

function row(partial: Partial<Practice> & { id: string; name: string }): Practice {
  return {
    what: "",
    disciplines: ["ceramics"],
    neighborhood: "Bushwick",
    borough: "brooklyn",
    url: `https://${partial.id}.example`,
    cost: { kind: "unknown", why: "not-checked" },
    schedule: { kind: "irregular", note: "" },
    access: ["enroll-ahead"],
    verifiedOn: "2026-11-01",
    ...partial,
  };
}

/** Events at a row are the ones whose URL shares its host, as lib/join matches them. */
function input(
  events: CalEvent[],
  more: Partial<StartingInput> = {},
): StartingInput {
  return {
    events,
    practices: [],
    eventsAt: (p) => events.filter((e) => e.url && new URL(e.url).host === new URL(p.url).host),
    today: TODAY,
    coveredFrom: LONG_AGO,
    ...more,
  };
}

const whats = (i: StartingInput) => startingSoon(i).map((x) => x.what);
const why = (i: StartingInput, what: string, date?: string) =>
  judgeStarting(i).misses.find((m) => m.what === what && (!date || m.date === date))?.why;

test("a class that gives its length starts on its date, with where, when, price and link", () => {
  const shoes = row({
    id: "shoes",
    name: "Brooklyn Shoe Space",
    neighborhood: "East Williamsburg",
    url: "https://brooklynshoespace.com/classes",
  });
  const boot = ev({
    date: "Nov 21",
    event: "8-day boot class with Kira Goodey",
    venue: "Brooklyn Shoe Space",
    url: "https://brooklynshoespace.com/schedule",
    cost: "$1,450",
  });
  const [item] = startingSoon(input([boot], { practices: [shoes] }));
  assert.equal(item?.what, "8-day boot class with Kira Goodey");
  assert.equal(item?.when, "Starts Sat Nov 21");
  assert.equal(item?.venue, "Brooklyn Shoe Space");
  assert.equal(item?.neighborhood, "East Williamsburg");
  assert.equal(item?.price, "$1,450");
  assert.equal(item?.url, "https://brooklynshoespace.com/schedule");
  assert.equal(item?.reason, "length");
});

test("an unknown price shows nothing rather than TBD", () => {
  const [item] = startingSoon(input([ev({ date: "Nov 21", event: "2-day Slides & Mule Making Workshop" })]));
  assert.equal(item?.price, null);
});

test("the window runs from today to 21 days out", () => {
  const events = [
    ev({ date: "Nov 11", event: "3-day Yesterday Class" }),
    ev({ date: "Nov 12", event: "3-day Today Class" }),
    ev({ date: "Dec 3", event: "3-day Day 21 Class" }),
    ev({ date: "Dec 4", event: "3-day Day 22 Class" }),
  ];
  assert.deepEqual(whats(input(events)), ["3-day Today Class", "3-day Day 21 Class"]);
});

test("a course already running is left out, and so is its last session", () => {
  const sundays = ["Oct 11", "Oct 18", "Oct 25", "Nov 1", "Nov 8", "Nov 15"].map((date) =>
    ev({ date, event: "Hand Building Course", venue: "Mostly Good Studios", start: "10:00" }),
  );
  const i = input(sundays);
  assert.deepEqual(whats(i), []);
  assert.equal(why(i, "Hand Building Course", "Nov 15"), "already running (also Nov 8)");
});

test("when the weeks before aren't loaded, a course's last session isn't taken for its first", () => {
  // The page holds this week on. Mostly Good's Nov 15 session was week six.
  const visible = [ev({ date: "Nov 15", event: "Hand Building Course", start: "10:00" })];
  const i = input(visible, { coveredFrom: MONDAY });
  assert.deepEqual(whats(i), []);
  assert.equal(why(i, "Hand Building Course"), "the 14 days before it aren't loaded");
  // With two weeks of history loaded and nothing in them, it's a start.
  assert.deepEqual(whats(input(visible, { coveredFrom: new Date(2026, 9, 31) })), [
    "Hand Building Course",
  ]);
});

test("a listing that names its length and appears once needs a week before it loaded", () => {
  const boot = [ev({ date: "Nov 21", event: "8-day boot class" })];
  // Loaded from Mon Nov 16: five days before it, not enough to rule out a
  // weekly class listed session by session.
  assert.deepEqual(whats(input(boot, { coveredFrom: new Date(2026, 10, 16) })), []);
  // Loaded from Mon Nov 9: twelve days.
  assert.deepEqual(whats(input(boot, { coveredFrom: MONDAY })), ["8-day boot class"]);
});

test("a series with all its stated sessions ahead starts on the first, history or not", () => {
  const tuesdays = ["Nov 17", "Nov 24", "Dec 1", "Dec 8", "Dec 15", "Dec 22"].map((date) =>
    ev({
      date,
      event: "Poetry & the Body",
      start: "19:00",
      cost: "$300",
      note: "Part of a 6-week series. See URL for full details.",
    }),
  );
  const i = input(tuesdays, { coveredFrom: new Date(2026, 10, 16) });
  const items = startingSoon(i);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.when, "Starts Tue Nov 17");
  assert.equal(why(i, "Poetry & the Body", "Nov 24"), "already running (also Nov 17)");
  // Five of six: the first may be in the past chunk.
  assert.deepEqual(whats(input(tuesdays.slice(1), { coveredFrom: new Date(2026, 10, 23) })), []);
});

test("a paid title repeated within a week from one listing is a run; its first session starts it", () => {
  const run = ["Nov 19", "Nov 26", "Dec 3"].map((date) =>
    ev({ date, event: "Drypoint & Stencil Monoprint", start: "18:00", cost: "$290" }),
  );
  assert.deepEqual(
    startingSoon(input(run)).map((x) => [x.when, x.reason]),
    [["Starts Thu Nov 19", "run"]],
  );
});

test("repeats that aren't one class are left out", () => {
  const free = ["Nov 15", "Nov 22"].map((date) =>
    ev({ date, event: "Studio Sundays", cost: "FREE", start: "11:00" }),
  );
  assert.equal(why(input(free), "Studio Sundays", "Nov 15"), "free and weekly: a drop-in");

  // A page per date is a separate booking each time.
  const pages = ["Nov 15", "Nov 22"].map((date) =>
    ev({ date, event: "Music Explorers", cost: "$20", url: `https://dada.example/${date}` }),
  );
  assert.equal(why(input(pages), "Music Explorers", "Nov 15"), "one session");

  // Different start times are different sittings of a two-hour intro.
  const intro = [
    ev({ date: "Nov 16", event: "Introduction to Shoe Making", start: "18:00", cost: "$95" }),
    ev({ date: "Nov 23", event: "Introduction to Shoe Making", start: "14:00", cost: "$95" }),
  ];
  assert.equal(why(input(intro), "Introduction to Shoe Making", "Nov 16"), "one session");

  // A fortnightly night is a drop-in.
  const fortnightly = ["Nov 12", "Nov 26"].map((date) =>
    ev({ date, event: "Writing Night", cost: "$10", start: "19:00" }),
  );
  assert.equal(why(input(fortnightly), "Writing Night", "Nov 12"), "one session");
});

test("what a listing says about itself can rule it out", () => {
  const events = [
    ev({ date: "Nov 14", event: "Private Card Holder / Pouch Workshop" }),
    ev({ date: "Nov 21", event: "Holiday Card Workshop", note: "1-Day Weekend Workshop" }),
    ev({ date: "Nov 19", event: "Cathode Ray Crash Course", cost: "$40" }),
    ev({ date: "Nov 15", event: "Open Studio", cost: "FREE" }),
    ev({ date: "Nov 16", event: "Drop-In Figure Drawing" }),
    ev({ date: "Nov 12", event: "Bi-Weekly Writing Night", note: "Fall series resumes." }),
    ev({ date: "Nov 19", event: "Bolex Rex5 (extended day, S3 of 5)" }),
    ev({ date: "Nov 18", event: "Intro to Wet Plate Collodion", note: "This intensive workshop covers plates." }),
  ];
  const i = input(events);
  assert.deepEqual(whats(i), []);
  assert.equal(why(i, "Private Card Holder / Pouch Workshop"), "private class");
  assert.equal(why(i, "Holiday Card Workshop"), "says it's one session");
  assert.equal(why(i, "Cathode Ray Crash Course"), "says it's one session");
  assert.equal(why(i, "Open Studio"), "says it's one session");
  assert.equal(why(i, "Drop-In Figure Drawing"), "says it's one session");
  assert.equal(why(i, "Bi-Weekly Writing Night"), "a standing night, not a class");
  assert.equal(why(i, "Bolex Rex5 (extended day, S3 of 5)"), "session 3 of 5");
  // "Intensive" alone isn't a length.
  assert.equal(why(i, "Intro to Wet Plate Collodion"), "one session");
});

test("signals that do count, from the title or the note", () => {
  const events = [
    ev({ date: "Nov 13", event: "Super 8mm on Ektachrome (S1 of 4)" }),
    ev({ date: "Nov 14", event: "Intro to Woodcut Printing", note: "2 Sundays" }),
    ev({ date: "Nov 15", event: "Extending Poetry Through Computation", note: "Two-day workshop, continues Sun Nov 16." }),
    ev({ date: "Nov 16", event: "Wheel Throwing", note: "Multi-week beginner course." }),
    ev({ date: "Nov 20", event: "Winter Semester" }),
  ];
  assert.deepEqual(
    startingSoon(input(events)).map((x) => [x.what, x.reason]),
    [
      ["Super 8mm on Ektachrome (S1 of 4)", "first-session"],
      ["Intro to Woodcut Printing", "length"],
      ["Extending Poetry Through Computation", "length"],
      ["Wheel Throwing", "length"],
      ["Winter Semester", "format"],
    ],
  );
});

test("a street address is never shown as the venue", () => {
  const [item] = startingSoon(
    input([
      ev({
        date: "Nov 18",
        event: "Poetry Workshop",
        note: "Part of a 3-week series.",
        venue: "144 Montague Street",
        where: "144 Montague Street, Brooklyn",
        neighborhood: "Brooklyn Heights",
      }),
    ]),
  );
  assert.equal(item?.venue, null);
  assert.equal(item?.neighborhood, "Brooklyn Heights");
});

test("a Directory row lends its name and neighborhood, and groups its sessions however the venue is spelled", () => {
  const rbpmw = row({
    id: "rbpmw",
    name: "Robert Blackburn Printmaking Workshop",
    neighborhood: "Midtown West",
    url: "https://www.rbpmw-efanyc.org/classes",
  });
  const run = [
    ev({ date: "Nov 21", event: "Riso", venue: "RBPMW", url: "https://www.rbpmw-efanyc.org/riso", start: "11:00", cost: "$290" }),
    ev({ date: "Nov 22", event: "Riso", venue: "Robert Blackburn", url: "https://www.rbpmw-efanyc.org/riso", start: "11:00", cost: "$290" }),
  ];
  const items = startingSoon(input(run, { practices: [rbpmw] }));
  assert.deepEqual(
    items.map((x) => [x.what, x.venue, x.neighborhood, x.when]),
    [["Riso", "Robert Blackburn Printmaking Workshop", "Midtown West", "Starts Sat Nov 21"]],
  );
});

test("when two Directory rows share a site, the event keeps its own venue", () => {
  const clay = row({
    id: "powerhouse-ceramics",
    name: "Powerhouse Arts Community Ceramics Studio",
    url: "https://powerhousearts.org/community-ceramics-studio",
  });
  const print = row({
    id: "mgc",
    name: "MGC Community Print Studio",
    url: "https://powerhousearts.org/mgc-community-print-studio",
  });
  const [item] = startingSoon(
    input(
      [
        ev({
          date: "Nov 18",
          event: "4-week Screen Printing",
          venue: "MGC",
          neighborhood: "Gowanus",
          url: "https://powerhousearts.org/mgc-screen-printing",
        }),
      ],
      { practices: [clay, print] },
    ),
  );
  assert.equal(item?.venue, "MGC");
  assert.equal(item?.neighborhood, "Gowanus");
});

test("the same class scraped twice is listed once", () => {
  const twice = [
    ev({ date: "Nov 21", event: "8-day boot class", url: "https://shoes.example/a" }),
    ev({ date: "Nov 21", event: "8-day boot class", url: "https://shoes.example/b" }),
  ];
  assert.equal(startingSoon(input(twice)).length, 1);
});

test("a dormant or waitlisted row with a posted return date in the window", () => {
  const choir = row({
    id: "choir",
    name: "Brooklynite Choir",
    neighborhood: "Brooklyn Heights",
    cost: { kind: "per-session", amount: 25 },
    availability: { status: "waitlist", note: "Full.", resumes: "2026-12-01" },
  });
  const [item] = startingSoon(input([], { practices: [choir] }));
  assert.equal(item?.what, "Brooklynite Choir");
  assert.equal(item?.venue, null);
  assert.equal(item?.neighborhood, "Brooklyn Heights");
  assert.equal(item?.when, "Starts Tue Dec 1");
  assert.equal(item?.price, "$25/session");
  assert.equal(item?.waitlist, true);
  assert.equal(item?.url, "https://choir.example");
});

test("a return month counts while the month starts inside the window", () => {
  const ensemble = (resumes: string) =>
    row({
      id: "fire",
      name: "The Fire Ensemble",
      access: ["free", "contact-first"],
      cost: { kind: "free" },
      availability: { status: "dormant", note: "Between sessions.", resumes },
    });
  const [dec] = startingSoon(input([], { practices: [ensemble("2026-12")] }));
  assert.equal(dec?.when, "Starts in December");
  assert.equal(dec?.price, "Free");
  // November has begun, so the session may be under way.
  const nov = input([], { practices: [ensemble("2026-11")] });
  assert.deepEqual(whats(nov), []);
  assert.equal(why(nov, "The Fire Ensemble"), "return date has begun or passed; the row needs a look");
});

test("rows that don't count: an estimated date, nothing to sign up for, a date too far off", () => {
  const rows = [
    row({
      id: "starr",
      name: "Estimated",
      availability: { status: "dormant", note: "x", resumes: "2026-11-20", resumesEstimated: true },
    }),
    row({
      id: "dropin",
      name: "Drop-in only",
      access: ["drop-in"],
      availability: { status: "dormant", note: "x", resumes: "2026-11-20" },
    }),
    row({
      id: "far",
      name: "Far off",
      availability: { status: "dormant", note: "x", resumes: "2027-02-01" },
    }),
  ];
  const i = input([], { practices: rows });
  assert.deepEqual(whats(i), []);
  assert.equal(why(i, "Estimated"), "return date is an estimate");
  assert.equal(why(i, "Drop-in only"), "nothing to sign up for");
  assert.equal(why(i, "Far off"), undefined);
});

test("at most five, soonest first; nothing qualifying means nothing", () => {
  const dates = ["Nov 30", "Nov 14", "Nov 26", "Nov 18", "Nov 22", "Nov 13", "Dec 1"];
  const events = dates.map((date, n) => ev({ date, event: `${n + 2}-day Class ${date}` }));
  assert.deepEqual(
    startingSoon(input(events)).map((x) => x.when),
    ["Starts Fri Nov 13", "Starts Sat Nov 14", "Starts Wed Nov 18", "Starts Sun Nov 22", "Starts Thu Nov 26"],
  );
  assert.deepEqual(startingSoon(input([ev({ date: "Nov 14", event: "Pasta Body" })])), []);
});

test("witness events never count", () => {
  assert.deepEqual(whats(input([ev({ date: "Nov 14", event: "3-day Festival", mode: "witness" })])), []);
});
