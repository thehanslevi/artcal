import type { CalEvent } from "../../src/types";
import { classifyEvent } from "./classify.ts";
import type { Candidate } from "./extract";
import type { Venue } from "./venues";

// Deterministic extraction from a venue's published iCal feed — no LLM,
// no quota. Venues declare `icsUrl` in venues.ts.

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface IcsProp {
  value: string;
  params: Record<string, string>;
}

type IcsEvent = Record<string, IcsProp>;

function unfoldLines(ics: string): string[] {
  // RFC 5545: continuation lines start with a space or tab.
  return ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

export function parseIcs(ics: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: IcsEvent | null = null;
  for (const line of unfoldLines(ics)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [prop, ...paramParts] = left.split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
    cur[(prop ?? "").toUpperCase()] = { value, params };
  }
  return events;
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

interface LocalDt {
  y: number;
  m: number; // 1-based
  d: number;
  hhmm: string | null;
}

/** Parse DTSTART/DTEND into local (America/New_York) date + time. */
function parseDt(prop: IcsProp | undefined): LocalDt | null {
  if (!prop) return null;
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, ys, ms, ds, hh, mm, , z] = m;
  if (!hh) {
    return { y: Number(ys), m: Number(ms), d: Number(ds), hhmm: null };
  }
  if (z) {
    // UTC timestamp → convert to New York local
    const utc = new Date(
      Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hh), Number(mm)),
    );
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(utc);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return {
      y: Number(get("year")),
      m: Number(get("month")),
      d: Number(get("day")),
      hhmm: `${get("hour").padStart(2, "0")}:${get("minute")}`,
    };
  }
  // TZID or floating local time — take it literally (feeds we use are NY venues)
  return {
    y: Number(ys),
    m: Number(ms),
    d: Number(ds),
    hhmm: `${hh}:${mm}`,
  };
}

function detectCost(...texts: (string | undefined)[]): string {
  const blob = texts.filter(Boolean).join(" ");
  const range = blob.match(/\$\s?(\d+(?:\.\d\d)?)\s*[–—-]\s*\$?\s?(\d+(?:\.\d\d)?)/);
  if (range) return `$${range[1]}–${range[2]}`;
  const single = blob.match(/\$\s?(\d+(?:\.\d\d)?)/);
  if (single) return `$${single[1]}`;
  if (/\bfree\b/i.test(blob)) return "FREE";
  return "TBD";
}

export async function extractFromIcs(
  venue: Venue,
  todayISO: string,
): Promise<Candidate[]> {
  if (!venue.icsUrl) return [];
  const res = await fetch(venue.icsUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; NYCArtCalendarBot/1.0; +https://nyc-art-cal.vercel.app)",
      Accept: "text/calendar, text/plain",
    },
  });
  if (!res.ok) return [];
  const ics = await res.text();
  if (!ics.includes("BEGIN:VEVENT")) return [];

  const today = new Date(todayISO);
  const maxAhead = new Date(today);
  maxAhead.setMonth(maxAhead.getMonth() + 18);

  const candidates: Candidate[] = [];
  for (const v of parseIcs(ics)) {
    // Skip unexpanded recurrence masters; most feeds pre-expand occurrences.
    if (v["RRULE"]) continue;
    const start = parseDt(v["DTSTART"]);
    const summary = v["SUMMARY"] ? unescapeText(v["SUMMARY"].value) : "";
    if (!start || !summary) continue;
    const when = new Date(start.y, start.m - 1, start.d);
    if (when < today || when > maxAhead) continue;

    const end = parseDt(v["DTEND"]);
    const sameDayEnd = end && end.y === start.y && end.m === start.m && end.d === start.d;
    const description = v["DESCRIPTION"] ? unescapeText(v["DESCRIPTION"].value) : "";
    const location = v["LOCATION"] ? unescapeText(v["LOCATION"].value) : "";
    const url = v["URL"]?.value.trim() || venue.url;
    const { mode, category } = classifyEvent(
      summary,
      venue.defaultMode,
      venue.category,
    );

    const event: CalEvent = {
      day: DAY_ABBR[when.getDay()] ?? "",
      date: `${MONTH_ABBR[start.m - 1]} ${start.d}`,
      event: summary,
      where: location || venue.whereTemplate,
      cost: detectCost(summary, description),
      category,
      flag: null,
      mode,
      start: start.hhmm,
      end: sameDayEnd ? end.hhmm : null,
      note: null,
      url,
    };
    candidates.push({ event, venue, sourceHtml: ics, source: "ics" });
    if (candidates.length >= 60) break;
  }
  return candidates;
}
