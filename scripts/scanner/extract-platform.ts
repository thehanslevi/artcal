import type { CalEvent } from "../../src/types";
import type { Venue } from "./venues";

// Deterministic parsers for the CMS platforms most NYC arts venues run on.
// These emit server-rendered event markup with machine-readable <time
// datetime> even when they omit JSON-LD, so we can extract without an LLM.

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function decode(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Parsed {
  y: number;
  mo: number; // 0-based
  d: number;
  hhmm: string | null;
  title: string;
  href: string | null;
}

function toEvent(p: Parsed, venue: Venue): CalEvent {
  const when = new Date(p.y, p.mo, p.d);
  const { mode, category } = classifyEvent(
    p.title,
    venue.defaultMode,
    venue.category,
  );
  return {
    day: DAY_ABBR[when.getDay()] ?? "",
    date: `${MONTH_ABBR[p.mo]} ${p.d}`,
    event: p.title,
    where: venue.whereTemplate,
    cost: "TBD",
    category,
    flag: null,
    mode,
    start: p.hhmm,
    end: null,
    note: null,
    url: p.href ?? venue.url,
  };
}

function parseDatetimeAttr(dt: string): { y: number; mo: number; d: number; hhmm: string | null } | null {
  const m = dt.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return {
    y: Number(m[1]),
    mo: Number(m[2]) - 1,
    d: Number(m[3]),
    hhmm: m[4] ? `${m[4]}:${m[5]}` : null,
  };
}

function absolutize(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

// Squarespace event collections: <article class="eventlist-event ...">
// containing a <time datetime> and an <a class="eventlist-title-link">.
function parseSquarespace(html: string): Parsed[] {
  if (!/eventlist-event|SQUARESPACE_CONTEXT/.test(html)) return [];
  const out: Parsed[] = [];
  const blocks = html.split(/<article[^>]*class="[^"]*eventlist-event/i).slice(1);
  for (const block of blocks) {
    const dtMatch = block.match(/datetime="([^"]+)"/i);
    if (!dtMatch) continue;
    const parsedDt = parseDatetimeAttr(dtMatch[1]!);
    if (!parsedDt) continue;
    const titleMatch =
      block.match(/class="[^"]*eventlist-title-link[^"]*"[^>]*>([^<]+)/i) ??
      block.match(/<a[^>]+href="([^"]*\/events\/[^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (!titleMatch) continue;
    const hrefMatch = block.match(/class="[^"]*eventlist-title-link[^"]*"[^>]*href="([^"]+)"/i)
      ?? block.match(/href="([^"]*\/events\/[^"]+)"/i);
    const title = decode(titleMatch[titleMatch.length - 1]!);
    if (!title) continue;
    // A later time element often carries the clock time.
    const timeMatch = block.match(/datetime="[^"]*T(\d{2}):(\d{2})/i);
    out.push({
      ...parsedDt,
      hhmm: parsedDt.hhmm ?? (timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : null),
      title,
      href: hrefMatch ? hrefMatch[1]! : null,
    });
  }
  return out;
}

// WordPress "The Events Calendar" list view.
function parseTribe(html: string): Parsed[] {
  if (!/tribe-events|tribe_events/.test(html)) return [];
  const out: Parsed[] = [];
  // Boundary rejects a following hyphen so we split on the container class
  // (…__event) and not its child classes (…__event-datetime, …__event-title).
  const blocks = html.split(/tribe-events-calendar-list__event(?![-\w])/).slice(1);
  for (const block of blocks) {
    const dtMatch = block.match(/datetime="([^"]+)"/i);
    if (!dtMatch) continue;
    const parsedDt = parseDatetimeAttr(dtMatch[1]!);
    if (!parsedDt) continue;
    const titleMatch = block.match(
      /event-title-link[^>]*href="([^"]+)"[^>]*>([^<]+)/i,
    );
    if (!titleMatch) continue;
    const title = decode(titleMatch[2]!);
    if (!title) continue;
    out.push({ ...parsedDt, title, href: titleMatch[1]! });
  }
  return out;
}

export function extractPlatform(
  html: string,
  venue: Venue,
  todayISO: string,
): CalEvent[] {
  const parsers = [parseSquarespace, parseTribe];
  const today = new Date(todayISO);
  const maxAhead = new Date(today);
  maxAhead.setMonth(maxAhead.getMonth() + 18);

  const seen = new Set<string>();
  const events: CalEvent[] = [];
  for (const parse of parsers) {
    const parsed = parse(html);
    if (parsed.length === 0) continue;
    for (const p of parsed) {
      if (!p.title || p.title.length < 2) continue;
      const when = new Date(p.y, p.mo, p.d);
      if (when < today || when > maxAhead) continue;
      const e = toEvent(p, venue);
      e.url = absolutize(e.url, venue.url) ?? venue.url;
      const key = `${e.date}|${e.event}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(e);
      if (events.length >= 40) break;
    }
    if (events.length > 0) break; // trust the first platform that matched
  }
  return events;
}
