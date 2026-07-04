import type { CalEvent, EventsData } from "../../src/types";
import type { Candidate } from "./extract";

const VALID_CATEGORIES = new Set<CalEvent["category"]>([
  "sound",
  "dance",
  "film",
  "tech",
  "making",
  "theatre",
  "literature",
  "community",
]);

const VALID_MODES = new Set<CalEvent["mode"]>(["make", "witness"]);

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

export interface GateResult {
  pass: boolean;
  reason?: string;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function existingKeys(existing: EventsData): Set<string> {
  const keys = new Set<string>();
  for (const w of existing.weeks) {
    for (const e of w.events) {
      keys.add(`${e.date}|${slug(e.event)}`);
    }
  }
  return keys;
}

export function makeGateRunner(
  existing: EventsData,
  todayISO: string,
  year: number,
) {
  const seen = existingKeys(existing);
  const today = new Date(todayISO);

  return function runGates(candidate: Candidate): GateResult {
    const { event, sourceHtml } = candidate;

    if (!event.event.trim()) return fail("empty title");
    if (!event.where.trim()) return fail("empty venue");

    if (!VALID_CATEGORIES.has(event.category)) {
      return fail(`invalid category: ${event.category}`);
    }
    if (!VALID_MODES.has(event.mode)) {
      return fail(`invalid mode: ${event.mode}`);
    }

    // Date parsing
    const dateParts = event.date.trim().split(/\s+/);
    const month = MONTHS[dateParts[0] ?? ""];
    const day = Number(dateParts[1]);
    if (month === undefined || Number.isNaN(day) || day < 1 || day > 31) {
      return fail(`unparseable date: ${event.date}`);
    }
    const eventDate = new Date(year, month, day);
    if (eventDate < today) return fail("date is in the past");
    const maxAhead = new Date(today);
    maxAhead.setMonth(maxAhead.getMonth() + 18);
    if (eventDate > maxAhead) return fail("date more than 18 months out");

    // Duplicate check
    const key = `${event.date}|${slug(event.event)}`;
    if (seen.has(key)) return fail("duplicate of existing event");

    // Anti-hallucination: the date must literally appear in the source HTML.
    const html = sourceHtml.toLowerCase();
    const dateStr = event.date.toLowerCase();
    const monthNumStr = String(month + 1).padStart(2, "0");
    const dayNumStr = String(day).padStart(2, "0");
    const dateAsIso = `${year}-${monthNumStr}-${dayNumStr}`;
    const dayName = event.day.toLowerCase();
    // Accept any of: "jul 8", "07/08", "07-08", "2026-07-08", "wed" close to date
    const dateAppears =
      html.includes(dateStr) ||
      html.includes(`${monthNumStr}/${dayNumStr}`) ||
      html.includes(`${monthNumStr}-${dayNumStr}`) ||
      html.includes(dateAsIso);
    if (!dateAppears) return fail("date not literally in source HTML");
    if (event.day && !html.includes(dayName)) {
      // Weekday should appear at least somewhere on the page — soft check
      // (Skip strict fail; the date check above is the real anti-hallucination.)
    }

    // Anti-hallucination: title tokens should mostly appear in source
    const titleTokens = event.event
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3);
    if (titleTokens.length > 0) {
      const hits = titleTokens.filter((t) => html.includes(t)).length;
      const ratio = hits / titleTokens.length;
      if (ratio < 0.5) return fail("title tokens missing from source");
    }

    // Times sanity
    if (event.start && !isHhmm(event.start)) return fail("bad start time");
    if (event.end && !isHhmm(event.end)) return fail("bad end time");

    // Register so later candidates don't re-add the same date+slug
    seen.add(key);

    return { pass: true };
  };
}

function isHhmm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

function fail(reason: string): GateResult {
  return { pass: false, reason };
}
