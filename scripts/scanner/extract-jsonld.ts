import type { CalEvent } from "../../src/types";
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
  const start = parseIsoDate(raw.startDate);
  if (!start) return null;
  if (start < today) return null;

  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][start.getDay()];
  const date = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`;
  const startTime = hasTime(raw.startDate) ? isoTimeString(raw.startDate) : null;
  const endTime = raw.endDate && hasTime(raw.endDate) ? isoTimeString(raw.endDate) : null;

  const cost = extractCost(raw.offers);

  return {
    day,
    date,
    event: raw.name.trim(),
    where: locationString(raw.location) ?? venue.whereTemplate,
    cost,
    category: venue.category,
    flag: null,
    mode: venue.defaultMode,
    start: startTime,
    end: endTime,
    note: null,
    url: raw.url ?? venue.url,
  };
}

function parseIsoDate(s: string): Date | null {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function hasTime(iso: string): boolean {
  return iso.includes("T");
}

function isoTimeString(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
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
