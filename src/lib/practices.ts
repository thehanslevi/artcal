import raw from "../data/practices.json";
import type {
  Access,
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
export const LAST_VERIFIED = data.lastVerified;
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

/** Practices with a computable occurrence in the 7 days starting at `from`. */
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
      days: week.filter((d) => occursOn(practice.schedule, d)),
    }))
    .filter((x) => x.days.length > 0);
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
 * Lower bound of what a practice costs to try once, for budget math. Unknown
 * costs return null rather than 0 so they can't silently understate a total.
 */
export function costFloor(c: Cost): number | null {
  switch (c.kind) {
    case "free":
      return 0;
    case "sliding":
    case "range":
      return c.min;
    case "fixed":
    case "per-month":
    case "per-session":
      return c.amount;
    case "unknown":
      return null;
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
