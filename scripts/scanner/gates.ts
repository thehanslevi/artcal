import type { CalEvent, EventsData } from "../../src/types";
import type { Candidate } from "./extract";

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "at", "on", "in", "of", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "presents",
  "meeting", "event", "night",
]);

const SIMILARITY_THRESHOLD = 0.5;

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

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

const MONTH_ABBRS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

const MONTH_FULLS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export interface GateResult {
  pass: boolean;
  reason?: string;
}

function buildDateIndex(existing: EventsData): Map<string, CalEvent[]> {
  const byDate = new Map<string, CalEvent[]>();
  for (const w of existing.weeks) {
    for (const e of w.events) {
      const arr = byDate.get(e.date) ?? [];
      arr.push(e);
      byDate.set(e.date, arr);
    }
  }
  return byDate;
}

export function makeGateRunner(
  existing: EventsData,
  todayISO: string,
  year: number,
) {
  const dateIndex = buildDateIndex(existing);
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

    // Duplicate check: same date + significant title overlap
    const existingOnDate = dateIndex.get(event.date) ?? [];
    const candidateTokens = titleTokens(event.event);
    for (const existingEvent of existingOnDate) {
      const existingTokens = titleTokens(existingEvent.event);
      const sim = jaccard(candidateTokens, existingTokens);
      if (sim >= SIMILARITY_THRESHOLD) {
        return fail(
          `duplicate of existing (${sim.toFixed(2)} similarity to "${existingEvent.event}")`,
        );
      }
    }

    // Anti-hallucination: the date should be discoverable in the source HTML.
    const html = sourceHtml.toLowerCase();
    const monthAbbr = MONTH_ABBRS[month];
    const monthFull = MONTH_FULLS[month];
    const monthNumStr = String(month + 1).padStart(2, "0");
    const monthNumShort = String(month + 1);
    const dayNumStr = String(day).padStart(2, "0");
    const dayNumShort = String(day);

    const candidatePatterns = [
      `${monthAbbr} ${dayNumShort}`,
      `${monthAbbr} ${dayNumStr}`,
      `${monthAbbr}. ${dayNumShort}`,
      `${monthAbbr}, ${dayNumShort}`,
      `${monthFull} ${dayNumShort}`,
      `${monthFull} ${dayNumStr}`,
      `${dayNumShort} ${monthAbbr}`,
      `${dayNumShort} ${monthFull}`,
      `${monthNumStr}/${dayNumStr}`,
      `${monthNumStr}/${dayNumShort}`,
      `${monthNumShort}/${dayNumStr}`,
      `${monthNumShort}/${dayNumShort}`,
      `${monthNumStr}-${dayNumStr}`,
      `${monthNumStr}-${dayNumShort}`,
      `${year}-${monthNumStr}-${dayNumStr}`,
      `${dayNumStr}-${monthNumStr}-${year}`,
      `${dayNumStr}/${monthNumStr}/${year}`,
    ];
    const dateAppears = candidatePatterns.some((p) => html.includes(p));

    if (!dateAppears) return fail("date not literally in source HTML");

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

    // Register in the date index so later candidates this run don't dup either
    const arr = dateIndex.get(event.date) ?? [];
    arr.push(event);
    dateIndex.set(event.date, arr);

    return { pass: true };
  };
}

function isHhmm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

function fail(reason: string): GateResult {
  return { pass: false, reason };
}
