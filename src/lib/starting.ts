import type { CalEvent, Category } from "../types";
import type { Practice } from "../types/practice";
import { formatCost as formatEventCost, isFree } from "./cost";
import { daysBetween, parseEventDate } from "./dates";
import { hostOf, isAggregator } from "./host";
import { formatCost as formatRowCost } from "./practices";

/**
 * "Starting soon": classes and series whose first session is in the next three
 * weeks, while there's still time to sign up. A one-off workshop can wait for
 * the week it runs. A six-week course can't be joined in week two.
 *
 * Pure, so the tests can run it on fixtures. The page passes the events, the
 * Directory, and lib/join's datedSessionsFor to say which events happen at a
 * Directory row. join.ts reads the build's event modules, which Node can't.
 *
 * A session counts as a start when its title or note
 *   - says it's session 1: "Super 8mm on Ektachrome (S1 of 4)";
 *   - gives a length: "8-day boot class", "4 Wednesdays", "Part of a 6-week
 *     series", "Two-day workshop, continues Sat Jul 25";
 *   - names a format in the title: course, series, semester, cycle;
 * or when the same paid title comes back at the same venue within a week, from
 * the same listing. A Directory row counts when it's dormant or waitlisted and
 * its posted return date is in the window.
 *
 * Left out: anything private (booked by one person, listed anyway), anything
 * that calls itself one day, drop-in or open studio, a "crash course" (one
 * evening), a weekly or monthly night, and any session with the same title at
 * the same venue in the 14 days before it, which means the class is running.
 * "Intensive" on its own isn't a signal: every multi-day intensive in the data
 * says how many days, and the one that doesn't is a one-day workshop.
 *
 * That last check needs the 14 days before every session in the window, so the
 * events passed in have to start at least 14 days before today. The page's do:
 * vite.config.ts ships the two weeks before this week's Monday with it.
 */

/** How far ahead the strip looks, in days. */
export const WINDOW_DAYS = 21;
export const MAX_ITEMS = 5;
/** A same-title session this many days before means the class is running. */
export const LOOKBACK_DAYS = 14;
/** Sessions of one class are at most a week apart. Fortnightly is a drop-in night. */
const RUN_GAP_DAYS = 7;

export type StartReason =
  /** Says it's session 1: "(S1 of 4)". */
  | "first-session"
  /** Gives a length: "8-day", "6-week", "4 Wednesdays", "continues". */
  | "length"
  /** Names a format in the title: course, series, semester, cycle. */
  | "format"
  /** The same paid title again within a week, from one listing. */
  | "run"
  /** A Directory row's posted return date. */
  | "resumes";

export interface StartingItem {
  /** Stable key: the event uid, or the Directory row id. */
  key: string;
  /** The event title, or the Directory row's name. */
  what: string;
  /** Venue name. Never a street address. Null when `what` is the venue. */
  venue: string | null;
  neighborhood: string | null;
  starts: Date;
  /** "Starts Sat Nov 21", or "Starts in December" for a month with no day. */
  when: string;
  price: string | null;
  url: string | null;
  /** The event's ink. Directory rows have none. */
  category: Category | null;
  waitlist: boolean;
  reason: StartReason;
}

/** Something in the window that didn't make it, and why. For tests and review. */
export interface StartingMiss {
  what: string;
  date: string;
  why: string;
}

export interface StartingInput {
  /**
   * Dated events, complete from at least LOOKBACK_DAYS before today. On the
   * page, CURRENT_EVENTS: from two weeks before this week's Monday on.
   */
  events: CalEvent[];
  practices: Practice[];
  /** The make events at a row's venue. On the page, lib/join's datedSessionsFor. */
  eventsAt: (p: Practice) => CalEvent[];
  today: Date;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Starts Sat Nov 21". */
export function startsLabel(d: Date): string {
  return `Starts ${DAY[d.getDay()]} ${MONTH[d.getMonth()]} ${d.getDate()}`;
}

// 2 to 16, in figures or words. "30 days" in a note is a refund policy.
const N = "(?:[2-9]|1[0-6]|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
/** "6-week", "Two-day", "3-session", "10 weeks". Not "7 days a week". */
const LENGTH = new RegExp(
  `\\b(${N})[-\\s](day|night|week|session|part|weekend)s?\\b(?!\\s+(?:a|per)\\s+week)`,
  "i",
);
/** "4 Wednesdays", "2 Sundays". */
const WEEKDAYS = new RegExp(`\\b(${N})\\s(?:mon|tues|wednes|thurs|fri|satur|sun)days\\b`, "i");
/** Says it runs longer than a day, without a number. */
const LONGER = /\bmulti-?(?:day|week|session)\b|\bcontinues\b/i;
/** "(S1 of 4)", "Session 2 of 6", "(2 of 3)": where a course has got to. */
const SESSION_OF =
  /\b(?:s|session|week|class|day|part|lesson)\s*#?(\d+)\s+of\s+(\d+)\b|\((\d+)\s+of\s+(\d+)\)/i;
const FORMAT = /\b(?:course|series|semester|cycle)\b/i;
/** One sitting, by its own description. A crash course is one evening. */
const ONE_SITTING =
  /\b(?:1|one)[-\s](?:day|night|evening|session)\b|\bsingle[-\s]session\b|\bcrash course\b/i;
/** Titles only: a course's note can mention open studio hours. */
const DROP_IN = /\bdrop[-\s]?in\b|\bopen studios?\b/i;
/** A standing night, not a class: "Bi-Weekly Writing Night", "Monthly GameJam Club". */
const RECURRING = /\b(?:bi-?weekly|weekly|monthly)\b/i;
/** Booked by one person or a group, and listed anyway. Titles only. */
const PRIVATE = /\bprivate\b/i;

/** Venue fields that hold a city or a street rather than a place. */
const NOT_A_VENUE = /^(?:ny|nyc|new york|brooklyn|manhattan|queens|bronx|the bronx|staten island)$/i;
const STREET =
  /^\d+[\w-]*\s.*\b(?:st|street|ave|avenue|blvd|boulevard|rd|road|pl|place|ln|lane|dr|drive|pkwy|parkway|ct|court|broadway|bowery)\b/i;

function placeOrNull(s: string | null | undefined): string | null {
  const t = s?.trim();
  if (!t || NOT_A_VENUE.test(t) || STREET.test(t) || /\bTBA\b/.test(t)) return null;
  return t;
}

interface Session {
  e: CalEvent;
  d: Date;
  /** Lowercased title, for matching the sessions of one class. */
  title: string;
  /** Title and note, for reading signals. */
  text: string;
}

function venueName(e: CalEvent): string {
  return (e.venue ?? e.where.split(/[·,]/)[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameVenue(a: CalEvent, b: CalEvent, rowOf: Map<CalEvent, Practice>): boolean {
  const ra = rowOf.get(a);
  const rb = rowOf.get(b);
  if (ra && rb) return ra.id === rb.id;
  const host = hostOf(a.url);
  if (host && !isAggregator(host) && host === hostOf(b.url)) return true;
  const name = venueName(a);
  return name !== "" && name === venueName(b);
}

/** One listing: the same page, and the same start time when both have one. */
function sameListing(a: CalEvent, b: CalEvent): boolean {
  if ((a.url ?? "") !== (b.url ?? "")) return false;
  return !a.start || !b.start || a.start === b.start;
}

/** What makes a session in the window a start, or why it isn't one. */
function judgeSession(
  s: Session,
  sessions: Session[],
  rowOf: Map<CalEvent, Practice>,
): { reason: StartReason } | { why: string } {
  const title = s.e.event;
  const length = LENGTH.test(s.text) || WEEKDAYS.test(s.text) || LONGER.test(s.text);
  if (PRIVATE.test(title)) return { why: "private class" };
  if (ONE_SITTING.test(s.text) || DROP_IN.test(title)) return { why: "says it's one session" };
  if (RECURRING.test(title) && !length) return { why: "a standing night, not a class" };
  const at = SESSION_OF.exec(s.text);
  if (at) {
    const k = Number(at[1] ?? at[3]);
    if (k === 1) return { reason: "first-session" };
    return { why: `session ${k} of ${at[2] ?? at[4]}` };
  }

  const siblings = sessions
    .filter((o) => o !== s && o.title === s.title && sameVenue(o.e, s.e, rowOf))
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  const gap = (o: Session) => daysBetween(s.d, o.d);
  const before = siblings.filter((o) => gap(o) < 0 && gap(o) >= -LOOKBACK_DAYS).pop();
  if (before) return { why: `already running (also ${before.e.date})` };
  const later = siblings.filter((o) => gap(o) > 0);

  if (length) return { reason: "length" };
  if (FORMAT.test(title)) return { reason: "format" };
  const again = later.some((o) => gap(o) <= RUN_GAP_DAYS && sameListing(s.e, o.e));
  if (again) {
    // A free weekly program is a drop-in (Studio Sundays).
    if (isFree(s.e)) return { why: "free and weekly: a drop-in" };
    return { reason: "run" };
  }
  return { why: "one session" };
}

function eventItem(s: Session, row: Practice | undefined, reason: StartReason): StartingItem {
  const e = s.e;
  // A Directory row's name is kept by hand. A scraped venue can be a street
  // address ("144 Montague Street") or a city ("NY"). The event's own
  // neighborhood comes first: it's where this class meets, and a row can be
  // named for where the place used to be (Lower East Side Printshop is in the
  // Garment District).
  const venue = row ? row.name : placeOrNull(e.venue ?? e.where.split(/[·,]/)[0]);
  const hood = placeOrNull(e.neighborhood) ?? placeOrNull(row?.neighborhood);
  return {
    key: e.uid,
    what: e.event,
    venue,
    neighborhood: hood !== venue ? hood : null,
    starts: s.d,
    when: startsLabel(s.d),
    price: formatEventCost(e.cost)?.text ?? null,
    url: e.url,
    category: e.category,
    waitlist: false,
    reason,
  };
}

/**
 * A dormant or waitlisted row whose posted return date is in the window. An
 * estimated date is a guess from last year's pattern, so it doesn't count. A
 * month with no day counts while the month starts inside the window; once it
 * has begun the session may be under way.
 */
function judgeRow(p: Practice, today: Date): StartingItem | StartingMiss | null {
  const a = p.availability;
  if (!a || (a.status !== "dormant" && a.status !== "waitlist") || !a.resumes) return null;
  const miss = (why: string): StartingMiss => ({ what: p.name, date: a.resumes!, why });
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(a.resumes);
  if (!m) return miss("unreadable return date");
  const day = m[3] ? Number(m[3]) : null;
  const starts = new Date(Number(m[1]), Number(m[2]) - 1, day ?? 1);
  const days = daysBetween(today, starts);
  if (days > WINDOW_DAYS) return null;
  if (days < (day ? 0 : 1)) return miss("return date has begun or passed; the row needs a look");
  if (a.status === "dormant" && a.resumesEstimated) return miss("return date is an estimate");
  if (!p.access.some((x) => x === "enroll-ahead" || x === "contact-first")) {
    return miss("nothing to sign up for");
  }
  return {
    key: p.id,
    what: p.name,
    venue: null,
    neighborhood: placeOrNull(p.neighborhood),
    starts,
    when: day ? startsLabel(starts) : `Starts in ${MONTH_NAME[starts.getMonth()]}`,
    price: formatRowCost(p.cost),
    url: p.url,
    category: null,
    waitlist: a.status === "waitlist",
    reason: "resumes",
  };
}

/** Everything that qualifies, soonest first, and what was left out. */
export function judgeStarting(input: StartingInput): {
  items: StartingItem[];
  misses: StartingMiss[];
} {
  const { events, practices, eventsAt, today } = input;

  // Two rows can share a site (Powerhouse Arts runs a ceramics studio and a
  // print studio), and then the event's own venue is the better name.
  const claims = new Map<CalEvent, Practice[]>();
  for (const p of practices) {
    for (const e of eventsAt(p)) claims.set(e, [...(claims.get(e) ?? []), p]);
  }
  const rowOf = new Map<CalEvent, Practice>();
  for (const [e, rows] of claims) if (rows.length === 1) rowOf.set(e, rows[0]!);

  const sessions: Session[] = [];
  for (const e of events) {
    const d = parseEventDate(e.date);
    if (!d) continue;
    if (e.mode !== "make") continue;
    sessions.push({
      e,
      d,
      title: e.event.toLowerCase().replace(/\s+/g, " ").trim(),
      text: `${e.event} ${e.note ?? ""}`,
    });
  }

  const items: StartingItem[] = [];
  const misses: StartingMiss[] = [];
  const listed = new Set<string>();
  const rowsListed = new Set<string>();
  for (const s of sessions) {
    const days = daysBetween(today, s.d);
    if (days < 0 || days > WINDOW_DAYS) continue;
    const verdict = judgeSession(s, sessions, rowOf);
    if ("why" in verdict) {
      misses.push({ what: s.e.event, date: s.e.date, why: verdict.why });
      continue;
    }
    const row = rowOf.get(s.e);
    // The same class scraped twice is one item.
    const id = `${row?.id ?? venueName(s.e)}|${s.title}|${s.e.date}`;
    if (listed.has(id)) continue;
    listed.add(id);
    if (row) rowsListed.add(row.id);
    items.push(eventItem(s, row, verdict.reason));
  }

  for (const p of practices) {
    const r = judgeRow(p, today);
    if (!r) continue;
    if ("why" in r) {
      misses.push(r);
    } else if (!rowsListed.has(p.id)) {
      // A dated session at the same place says more than its return date.
      items.push(r);
    }
  }

  items.sort((a, b) => a.starts.getTime() - b.starts.getTime() || a.what.localeCompare(b.what));
  return { items, misses };
}

/** Up to MAX_ITEMS things to sign up for before they start. Empty hides the strip. */
export function startingSoon(input: StartingInput): StartingItem[] {
  return judgeStarting(input).items.slice(0, MAX_ITEMS);
}
