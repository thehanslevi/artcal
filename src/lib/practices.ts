import raw from "../data/practices.json";
import { STALE_AFTER_DAYS } from "../types/practice";
import type {
  Access,
  Availability,
  Cost,
  Practice,
  PracticesData,
  Schedule,
  Weekday,
} from "../types/practice";

// practices.json is hand-maintained, so it is cast at this single boundary and
// checked at runtime by scripts/validate-practices.ts (run in CI). Widening
// rules mean a plain JSON import can't satisfy the literal unions directly.
const data = raw as unknown as PracticesData;

export const PRACTICES: Practice[] = data.practices;
/** Newest verifiedOn across the file. Derived in the data, enforced by lint. */
export const PRACTICES_VERIFIED = data.lastVerified;
export const BY_ID = new Map(PRACTICES.map((p) => [p.id, p]));

const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The replacement for the scraper.
 *
 * A weekly or monthly-nth schedule already contains everything needed to know
 * whether something is happening on a given day, so availability is derived
 * rather than fetched. Sessions, memberships, and irregular schedules have no
 * computable date and are deliberately excluded here: they belong in the
 * Directory and in Commitments, not in a "this week" list.
 */
export function occursOn(schedule: Schedule, date: Date): boolean {
  const dow = WEEKDAYS[date.getDay()]!;
  if (schedule.kind === "weekly") return schedule.days.includes(dow);
  if (schedule.kind === "monthly-nth") {
    if (schedule.day !== dow) return false;
    if (schedule.nth === -1) {
      // Last matching weekday of the month.
      return date.getDate() + 7 > daysInMonth(date);
    }
    return Math.floor((date.getDate() - 1) / 7) + 1 === schedule.nth;
  }
  return false;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/**
 * Whether a practice is actually meeting on `date`, as opposed to merely having
 * a schedule that says it would. A schedule and a season are different facts;
 * conflating them is what put the Fire Ensemble in "this week" while its
 * spring session was over.
 */
export function isRunningOn(p: Practice, date: Date): boolean {
  const a = p.availability;
  if (!a) return true; // omitted means running year-round
  if (a.status !== "running") return false;
  if (a.darkMonths?.includes(date.getMonth() + 1)) return false;
  return true;
}

/**
 * Practices with a computable occurrence in the 7 days starting at `from`, that
 * are also actually running. Both conditions are required.
 */
export function availableThisWeek(
  from: Date,
  practices: Practice[] = PRACTICES,
): { practice: Practice; days: Date[] }[] {
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return d;
  });
  return practices
    .map((practice) => ({
      practice,
      days: week.filter(
        (d) => occursOn(practice.schedule, d) && isRunningOn(practice, d),
      ),
    }))
    .filter((x) => x.days.length > 0);
}

const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A short label for the UI, or null when a practice is simply running. */
export function formatAvailability(a: Availability | undefined): string | null {
  if (!a) return null;
  switch (a.status) {
    case "running":
      if (!a.darkMonths?.length) return null;
      return `Dark ${a.darkMonths.map((m) => MONTH[m - 1]).join(", ")}`;
    case "dormant": {
      if (!a.resumes) return "Not running";
      const when = formatResumes(a.resumes);
      return a.resumesEstimated ? `Back ~${when}` : `Back ${when}`;
    }
    case "waitlist":
      return "Waitlist";
    case "unknown":
      return "Unconfirmed";
  }
}

function formatResumes(s: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return s;
  const month = MONTH[Number(m[2]) - 1] ?? s;
  return m[3] ? `${month} ${Number(m[3])}` : month;
}


const DAY_LABEL: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const NTH_LABEL: Record<string, string> = {
  "1": "first",
  "2": "second",
  "3": "third",
  "4": "fourth",
  "-1": "last",
};

export function formatSchedule(s: Schedule): string {
  switch (s.kind) {
    case "weekly": {
      const days = s.days.map((d) => DAY_LABEL[d]).join("/");
      return s.time ? `${days}, ${s.time}` : days;
    }
    case "monthly-nth": {
      const nth = NTH_LABEL[String(s.nth)] ?? `${s.nth}th`;
      const base = `${nth} ${DAY_LABEL[s.day]}s`;
      return s.time ? `${base}, ${s.time}` : base;
    }
    case "session":
      return `${s.weeks}-week session`;
    case "membership":
      return "Membership";
    case "irregular":
      return "Check site";
    case "dated":
      return s.date;
  }
}

/** Null when there is no usable number, so the UI can say nothing instead of "TBD". */
export function formatCost(c: Cost): string | null {
  switch (c.kind) {
    case "free":
      return "Free";
    case "sliding":
      return `$${c.min}–${c.max} sliding`;
    case "fixed":
      return `$${c.amount}`;
    case "range":
      return `$${c.min}–${c.max}`;
    case "per-month":
      return `$${c.amount}/mo`;
    case "per-session":
      return `$${c.amount}/session`;
    case "unknown":
      return null;
  }
}

/**
 * The honest version of the old "TBD". Says whose gap it is: the venue's, the
 * bot-blocker's, or ours.
 */
export function formatCostGap(c: Cost): string | null {
  if (c.kind !== "unknown") return null;
  switch (c.why) {
    case "not-published":
      return "Price not published — ask them";
    case "blocked":
      return "Price not readable by bot — check in a browser";
    case "not-checked":
      return "Price not checked yet";
  }
}


const NO_MONEY_BARRIER: Access[] = [
  "free",
  "sliding-scale",
  "scholarship",
  "work-study",
];

/** Money is not a hard gate: the stated binding constraint is no income. */
export function isAffordable(p: Practice): boolean {
  return (
    p.cost.kind === "free" ||
    p.access.some((a) => NO_MONEY_BARRIER.includes(a))
  );
}

/** Brooklyn and Lower Manhattan are easy; Midtown is a trip. */
export function isNearby(p: Practice, maxMin = 25): boolean {
  return p.travelMin !== null && p.travelMin <= maxMin;
}

const DAY_MS = 86_400_000;

export function daysSinceVerified(p: Practice, now: Date): number {
  const then = new Date(p.verifiedOn + "T00:00:00");
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

/**
 * Past STALE_AFTER_DAYS an entry is presented as suspect rather than true.
 * Nothing is locked; a fact verified in June is a fact about June.
 */
export function isStale(p: Practice, now: Date): boolean {
  return daysSinceVerified(p, now) > STALE_AFTER_DAYS;
}

/** "checked today" / "checked 8 days ago" / "checked 41 days ago". */
export function formatVerified(p: Practice, now: Date): string {
  const n = daysSinceVerified(p, now);
  if (n === 0) return "checked today";
  if (n === 1) return "checked yesterday";
  return `checked ${n} days ago`;
}

