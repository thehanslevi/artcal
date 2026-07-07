import type { CalEvent } from "../../src/types";
import { classifyEvent } from "./classify.ts";
import type { Venue } from "./venues";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface JsonLdEvent {
  "@type"?: string | string[];
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  description?: string;
  location?: unknown;
  offers?: unknown;
}

/**
 * Extract Event objects from JSON-LD script blocks in the raw HTML.
 * Returns [] if none found or none parseable.
 */
export function extractJsonLdEvents(
  html: string,
  venue: Venue,
  todayISO: string,
): CalEvent[] {
  const events: CalEvent[] = [];
  const today = new Date(todayISO);

  const blocks = extractLdJsonBlocks(html);
  for (const block of blocks) {
    for (const raw of walkForEvents(block)) {
      const ev = toCalEvent(raw, venue, today);
      if (ev) events.push(ev);
    }
  }
  return events;
}

function extractLdJsonBlocks(html: string): unknown[] {
  const rx =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const results: unknown[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const body = m[1]?.trim();
    if (!body) continue;
    try {
      results.push(JSON.parse(body));
    } catch {
      // ignore malformed blocks
    }
  }
  return results;
}

function walkForEvents(node: unknown): JsonLdEvent[] {
  const out: JsonLdEvent[] = [];
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    if (typeof cur !== "object") continue;
    const obj = cur as Record<string, unknown>;
    const type = obj["@type"];
    if (isEventType(type)) {
      out.push(obj as JsonLdEvent);
    }
    // recurse into nested containers regardless
    for (const key of Object.keys(obj)) {
      if (key === "@context" || key === "@id") continue;
      stack.push(obj[key]);
    }
  }
  return out;
}

function isEventType(t: unknown): boolean {
  if (typeof t === "string") return t.toLowerCase().includes("event");
  if (Array.isArray(t)) return t.some((s) => typeof s === "string" && s.toLowerCase().includes("event"));
  return false;
}

function toCalEvent(
  raw: JsonLdEvent,
  venue: Venue,
  today: Date,
): CalEvent | null {
  if (!raw.name || !raw.startDate) return null;
  const s = parseIsoToNY(raw.startDate);
  if (!s) return null;
  const start = new Date(s.y, s.mo, s.d);
  if (start < today) return null;

  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][start.getDay()];
  const date = `${MONTH_NAMES[s.mo]} ${s.d}`;
  const startTime = s.hh !== null ? `${s.hh}:${s.mm}` : null;
  const e = raw.endDate ? parseIsoToNY(raw.endDate) : null;
  // Only keep an end time if it's the same calendar day (no cross-midnight).
  const endTime =
    e && e.hh !== null && e.y === s.y && e.mo === s.mo && e.d === s.d
      ? `${e.hh}:${e.mm}`
      : null;

  const cost = extractCost(raw.offers);
  const title = cleanTitle(raw.name, venue.name);
  const { mode, category } = classifyEvent(
    title,
    venue.defaultMode,
    venue.category,
  );

  return {
    day,
    date,
    event: title,
    where: locationString(raw.location) ?? venue.whereTemplate,
    cost,
    category,
    flag: null,
    mode,
    start: startTime,
    end: endTime,
    note: null,
    url: raw.url ?? venue.url,
  };
}

function cleanTitle(name: string, venueName: string): string {
  let t = name
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  // Platforms often append the venue to the event name ("Title — Venue").
  const suffix = new RegExp(
    `\\s*[—–\\-|·]\\s*${venueName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i",
  );
  t = t.replace(suffix, "").trim();
  return t;
}

interface LocalParts {
  y: number;
  mo: number; // 0-based
  d: number;
  hh: string | null;
  mm: string | null;
}

// Parse a JSON-LD ISO datetime into America/New_York wall-clock parts.
// A zoned timestamp (Z or ±offset) is an absolute instant → convert to NY.
// A naive timestamp (no zone) is meant as venue-local → take it literally.
// Crucially avoids the runner's own timezone (UTC in CI), which turned
// evening events into "00:00".
function parseIsoToNY(iso: string): LocalParts | null {
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?/,
  );
  if (!m) return null;
  const [, Y, Mo, D, H, Min, zone] = m;
  if (H === undefined) {
    return { y: +Y!, mo: +Mo! - 1, d: +D!, hh: null, mm: null };
  }
  if (zone) {
    const inst = new Date(iso);
    if (Number.isNaN(inst.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(inst);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    let hh = g("hour");
    if (hh === "24") hh = "00";
    return {
      y: +g("year"),
      mo: +g("month") - 1,
      d: +g("day"),
      hh: hh.padStart(2, "0"),
      mm: g("minute"),
    };
  }
  return { y: +Y!, mo: +Mo! - 1, d: +D!, hh: H, mm: Min! };
}

function locationString(loc: unknown): string | null {
  if (!loc) return null;
  if (typeof loc === "string") return loc;
  if (typeof loc !== "object") return null;
  const obj = loc as Record<string, unknown>;
  const name = typeof obj["name"] === "string" ? (obj["name"] as string) : null;
  const address = obj["address"];
  let addrStr: string | null = null;
  if (typeof address === "string") addrStr = address;
  else if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const street = typeof a["streetAddress"] === "string" ? a["streetAddress"] : "";
    const locality = typeof a["addressLocality"] === "string" ? a["addressLocality"] : "";
    addrStr = [street, locality].filter(Boolean).join(", ");
  }
  return [name, addrStr].filter(Boolean).join(" · ") || null;
}

function extractCost(offers: unknown): string {
  if (!offers) return "TBD";
  const list = Array.isArray(offers) ? offers : [offers];
  const prices: number[] = [];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const price = (o as Record<string, unknown>)["price"];
    if (typeof price === "number") prices.push(price);
    else if (typeof price === "string") {
      const n = parseFloat(price);
      if (!Number.isNaN(n)) prices.push(n);
    }
  }
  if (prices.length === 0) return "TBD";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === 0 && max === 0) return "FREE";
  if (min === max) return `$${min}`;
  return `$${min}–${max}`;
}
