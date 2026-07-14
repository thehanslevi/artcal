import { randomBytes } from "node:crypto";
import type { CalEvent, EventsData, Week } from "../../src/types";
import { findDuplicateOf } from "./dedupe";

/**
 * Opaque and permanent. Never derive a uid from date, title, or venue: the
 * whole point is that it survives those changing. Assigned once, here, the
 * first time an event enters the file.
 */
function newUid(): string {
  return "e_" + randomBytes(6).toString("hex");
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseEventDate(dateStr: string, year: number): Date | null {
  const parts = dateStr.trim().split(/\s+/);
  const m = MONTHS[parts[0] ?? ""];
  const d = Number(parts[1]);
  if (m === undefined || Number.isNaN(d)) return null;
  return new Date(year, m, d);
}

function parseWeekRange(label: string, year: number): { start: Date; end: Date } | null {
  const cleaned = label.replace("–", "-").replace("—", "-");
  const m = cleaned.match(/^(\w{3})\s+(\d+)-(?:(\w{3})\s+)?(\d+)$/);
  if (!m) return null;
  const [, m1, d1, m2, d2] = m;
  const startMonth = MONTHS[m1 ?? ""];
  const endMonth = m2 ? MONTHS[m2 ?? ""] : startMonth;
  if (startMonth === undefined || endMonth === undefined) return null;
  return {
    start: new Date(year, startMonth, Number(d1)),
    end: new Date(year, endMonth, Number(d2)),
  };
}

function weekLabelFor(date: Date): string {
  // Sunday-anchored 7-day windows
  const dow = date.getDay(); // 0 = Sun
  const start = new Date(date);
  start.setDate(date.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startMonth = MONTH_NAMES[start.getMonth()];
  const endMonth = MONTH_NAMES[end.getMonth()];
  if (start.getMonth() === end.getMonth()) {
    return `${startMonth} ${start.getDate()}–${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
}

export interface MergeResult {
  data: EventsData;
  skippedDuplicates: { event: CalEvent; duplicateOf: CalEvent }[];
}

export function mergeIntoEvents(
  existing: EventsData,
  accepted: CalEvent[],
  year: number,
): MergeResult {
  const weeks = [...existing.weeks];
  const skippedDuplicates: MergeResult["skippedDuplicates"] = [];

  for (const event of accepted) {
    const d = parseEventDate(event.date, year);
    if (!d) continue;

    // Final dedupe net: unlike the gate check (which runs against the file
    // as it was at scan start), this also catches two candidates from the
    // same run duplicating each other.
    const dup = findDuplicateOf(event, weeks.flatMap((w) => w.events));
    if (dup) {
      skippedDuplicates.push({ event, duplicateOf: dup });
      continue;
    }

    // Try to find an existing week containing this date
    let targetIndex = weeks.findIndex((w) => {
      const range = parseWeekRange(w.label, year);
      if (!range) return false;
      return d >= range.start && d <= range.end;
    });

    if (targetIndex === -1) {
      // Create a new week
      const label = weekLabelFor(d);
      const newWeek: Week = { label, events: [] };
      // Insert in chronological order
      const insertAt = weeks.findIndex((w) => {
        const range = parseWeekRange(w.label, year);
        return range ? range.start > d : false;
      });
      if (insertAt === -1) {
        weeks.push(newWeek);
        targetIndex = weeks.length - 1;
      } else {
        weeks.splice(insertAt, 0, newWeek);
        targetIndex = insertAt;
      }
    }

    const withUid: CalEvent = event.uid ? event : { ...event, uid: newUid() };
    weeks[targetIndex] = {
      ...weeks[targetIndex],
      events: [...weeks[targetIndex].events, withUid].sort(byDateAsc(year)),
    };
  }

  const isoDate = new Date().toISOString().slice(0, 10);
  return { data: { lastVerified: isoDate, weeks }, skippedDuplicates };
}

function byDateAsc(year: number) {
  return (a: CalEvent, b: CalEvent) => {
    const da = parseEventDate(a.date, year);
    const db = parseEventDate(b.date, year);
    if (!da || !db) return 0;
    return da.getTime() - db.getTime();
  };
}
