import type { CalEvent } from "../types";
import { parseEventDate } from "./dates";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * YYYYMMDD for the date `plusDays` after y-m-d. The arithmetic runs in UTC so
 * the day after Dec 31 is Jan 1 whatever zone the browser or server is in.
 */
function ymd(y: number, m: number, d: number, plusDays = 0): string {
  const t = new Date(Date.UTC(y, m - 1, d + plusDays));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const DAY = 24 * 60;
/** How long an event with no end runs. The feeds have always assumed two hours. */
const DEFAULT_LENGTH = 2 * 60;
/** An end before the start means the next morning only up to this length. */
const OVERNIGHT_MAX = 12 * 60;

interface Span {
  allDay: boolean;
  /** YYYYMMDD when all-day, else YYYYMMDDTHHMMSS in New York wall-clock time. */
  start: string;
  /** Exclusive: an all-day event ends at the start of the next day. */
  end: string;
}

/**
 * When an event starts and ends, shared by the feeds, the single-event file and
 * the Google link so all three agree. The year comes from parseEventDate, the
 * same rule the calendar uses to place the event.
 *
 * DTEND used to be the end time on the start's date, so 22:00–01:00 ended
 * before it began, a 23:00 start with no end got 01:00 the same day, and the
 * scrapes that repeat the start as the end (19:30–19:30) made zero-length
 * events. RFC 5545 requires the end to come after the start.
 */
function eventSpan(e: Pick<CalEvent, "date" | "start" | "end">): Span | null {
  const day = parseEventDate(e.date);
  if (!day) return null;
  const y = day.getFullYear();
  const m = day.getMonth() + 1;
  const d = day.getDate();
  const start = e.start ? toMinutes(e.start) : NaN;
  if (Number.isNaN(start)) {
    return { allDay: true, start: ymd(y, m, d), end: ymd(y, m, d, 1) };
  }
  let end = e.end ? toMinutes(e.end) : NaN;
  if (!(end > start)) {
    // 22:00–01:00 runs past midnight. No end, an end equal to the start, or
    // 19:00–14:30 (a typo, not a 19½-hour night) gets the default length.
    end =
      end < start && end + DAY - start <= OVERNIGHT_MAX
        ? end + DAY
        : start + DEFAULT_LENGTH;
  }
  const at = (mins: number) =>
    `${ymd(y, m, d, Math.floor(mins / DAY))}T${pad(Math.floor((mins % DAY) / 60))}${pad(mins % 60)}00`;
  return { allDay: false, start: at(start), end: at(end) };
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: content lines are capped at 75 octets, and longer ones must be
 * folded onto continuation lines starting with a single space.
 *
 * We were emitting lines up to 235 octets. Strict parsers truncate or reject
 * those, which is how a long event link reaches a subscriber broken.
 *
 * The limit counts octets, not characters, so this measures UTF-8 bytes and
 * never splits a multi-byte character across a fold.
 */
function fold(line: string): string[] {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return [line];

  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  // Continuation lines carry a leading space, so they hold one octet less.
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ch;
      bytes = n;
      limit = 74;
    } else {
      cur += ch;
      bytes += n;
    }
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i === 0 ? l : " " + l));
}

function nowStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** The description every calendar entry carries: the feeds and both single-event routes. */
function describe(e: CalEvent): string {
  const parts: string[] = [];
  if (e.note) parts.push(e.note);
  // "TBD" is what the old site printed when it didn't know the price. It told
  // the reader nothing, so say nothing.
  if (e.cost && e.cost.trim().toUpperCase() !== "TBD") {
    parts.push(`Cost: ${e.cost}`);
  }
  parts.push(`${e.category} · ${e.mode}`);
  // The link goes in the description because that is the only place every
  // client shows it. Google Calendar ignores the URL property outright; Apple
  // tucks it in a field that's easy to miss. Both auto-link description text.
  // URL: is still emitted in the feeds for clients that do use it.
  if (e.url) parts.push("", e.url);
  return parts.join("\n");
}

export interface BuildICalOptions {
  calendarName?: string;
  calendarDescription?: string;
}

export function buildICal(
  events: CalEvent[],
  options: BuildICalOptions = {},
): string {
  const stamp = nowStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Art Cal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (options.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`);
  }
  if (options.calendarDescription) {
    lines.push(`X-WR-CALDESC:${escapeText(options.calendarDescription)}`);
  }
  lines.push("X-WR-TIMEZONE:America/New_York");
  lines.push(
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  );
  const seenUids = new Set<string>();
  for (const e of events) {
    const span = eventSpan(e);
    if (!span) continue;
    // Prefer the event's permanent uid. The old scheme derived this from the
    // title, so renaming an event changed its calendar identity and clients
    // treated it as a different event. Falls back to the derived form only for
    // events that predate uids.
    let baseUid = e.uid ?? `${span.start.slice(0, 8)}-${slug(e.event)}`;
    let uid = baseUid;
    let n = 2;
    while (seenUids.has(uid)) {
      uid = `${baseUid}-${n++}`;
    }
    seenUids.add(uid);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}@nyc-creative-calendar`);
    lines.push(`DTSTAMP:${stamp}`);
    if (span.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${span.start}`);
      lines.push(`DTEND;VALUE=DATE:${span.end}`);
    } else {
      lines.push(`DTSTART;TZID=America/New_York:${span.start}`);
      lines.push(`DTEND;TZID=America/New_York:${span.end}`);
    }
    lines.push(`SUMMARY:${escapeText(e.event)}`);
    lines.push(`LOCATION:${escapeText(e.where)}`);
    lines.push(`DESCRIPTION:${escapeText(describe(e))}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // RFC 5545 ends every content line with CRLF, the last one included.
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

/**
 * One event as its own calendar file, for a visitor adding it by hand. It is
 * the feeds' VEVENT, UID included, so a calendar that already holds the event
 * from a feed or an earlier download can recognise it.
 */
export function buildEventICal(event: CalEvent): string {
  return buildICal([event]);
}

/** e.g. "fay-victor-black-poems.ics" */
export function eventFilename(event: CalEvent): string {
  return `${slug(event.event) || "event"}.ics`;
}

const GOOGLE_TEMPLATE = "https://calendar.google.com/calendar/render";

/**
 * A link that opens Google Calendar's new-event form filled in. Times are New
 * York wall-clock with ctz, so the event lands at the right hour in any time
 * zone; an all-day event ends on the next day, which Google treats as
 * exclusive. Null when the date can't be read, as buildICal skips those too.
 */
export function googleCalendarUrl(event: CalEvent): string | null {
  const span = eventSpan(event);
  if (!span) return null;
  const q = encodeURIComponent;
  return (
    `${GOOGLE_TEMPLATE}?action=TEMPLATE` +
    `&text=${q(event.event)}` +
    `&dates=${span.start}/${span.end}` +
    `&ctz=America/New_York` +
    `&location=${q(event.where)}` +
    `&details=${q(describe(event))}`
  );
}

function saveFile(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari has been known to drop a download whose blob URL is revoked in the
  // same tick as the click. Holding a few KB for ten seconds costs nothing.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadICal(
  events: CalEvent[],
  filename = "art-cal.ics",
  options: BuildICalOptions = {},
): void {
  saveFile(buildICal(events, options), filename);
}

export function downloadEventICal(event: CalEvent): void {
  saveFile(buildEventICal(event), eventFilename(event));
}
