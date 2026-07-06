import type { CalEvent } from "../../src/types";
import { extractFromIcs } from "./extract-ics.ts";
import { extractJsonLdEvents } from "./extract-jsonld.ts";
import { extractPlatform } from "./extract-platform.ts";
import { fetchHtml, type FetchStrategy } from "./fetchers.ts";
import { callLlm, hasLlm, isQuotaExhausted } from "./llm.ts";
import type { Venue } from "./venues";

export { isQuotaExhausted } from "./llm.ts";

// Venues that spent an LLM call this run — scan-events.ts persists this so
// the limited quota rotates across venues on subsequent runs.
const llmAttempts: string[] = [];
export function getLlmAttempts(): string[] {
  return llmAttempts;
}

export interface Candidate {
  event: CalEvent;
  venue: Venue;
  sourceHtml: string;
  source: "json-ld" | "llm" | "ics";
}

const SYSTEM_PROMPT = `You extract dated cultural events from raw HTML into strict JSON.

Rules:
- ONLY include events with a specific date in 2026 or 2027 (year inferred from context).
- Date format: three-letter month + day, e.g. "Jul 26", "Nov 4".
- Day format: three-letter weekday matching the date (Mon/Tue/Wed/Thu/Fri/Sat/Sun).
- Times: 24-hour "HH:MM" strings, or null if not stated.
- Skip any event whose title/date you had to infer or guess. If in doubt, omit.
- Skip past events (before today's date).
- Return at most 30 events, prioritizing the earliest upcoming dates.

Category (pick one, given the venue's usual focus):
- sound (concerts, experimental music, opera)
- dance (dance shows and classes)
- film (screenings, workshops, cinemas)
- tech (live-coding, generative visuals, AI, hardware)
- making (printmaking, book arts, woodworking, darkroom)
- theatre (theatre, performance, clown)
- literature (writing groups, readings, poetry, book talks)
- community (social practice, hospitality, contemplation)

Mode (pick one):
- make (participatory — class, workshop, hack session, community volunteer)
- witness (audience-only — show, screening, concert, reading)

Flag (pick one or null):
- "urgent" if the venue explicitly says "going fast" or "sold out soon"
- "priority" if the event is rare, milestone, world premiere, one-of-a-kind
- "decide" if the event is imminent and requires a decision
- null (default)

For each event: fill day, date, event title verbatim, where (fall back to venue's provided location if none in source), cost ("FREE" / "$X" / "$X-Y" / "TBD"), category, mode, start/end HH:MM or null, short note (or null), url (canonical event URL or fall back to venue page).`;

export async function extractFromVenue(
  venue: Venue,
  todayISO: string,
): Promise<Candidate[]> {
  // Published iCal feed: deterministic and quota-free — always first.
  if (venue.icsUrl) {
    try {
      const fromIcs = await extractFromIcs(venue, todayISO);
      if (fromIcs.length > 0) return fromIcs;
    } catch (err) {
      console.warn(
        `   ics fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Making venues are mostly JS-rendered studio sites, so default them to
  // playwright — the rendered DOM feeds the deterministic extractors
  // (JSON-LD / detail-crawl / platform parsers), no LLM/quota needed.
  const defaultStrategy: FetchStrategy =
    venue.defaultMode === "make" ? "playwright" : "static";
  const primary = await tryUrl(
    venue.url,
    venue.fetch ?? defaultStrategy,
    venue,
    todayISO,
  );
  if (primary.length > 0) return primary;

  // Fall back to alternate sources (donyc, BrooklynVegan, etc.)
  if (venue.altSources) {
    for (const alt of venue.altSources) {
      const results = await tryUrl(
        alt.url,
        alt.fetch ?? "static",
        venue,
        todayISO,
      );
      if (results.length > 0) return results;
    }
  }

  return [];
}

async function tryUrl(
  url: string,
  strategy: FetchStrategy,
  venue: Venue,
  todayISO: string,
): Promise<Candidate[]> {
  const html = await fetchHtml(url, strategy);
  if (!html) return [];

  // First pass: try JSON-LD structured data (free, deterministic)
  const jsonLd = extractJsonLdEvents(html, venue, todayISO);
  if (jsonLd.length > 0) {
    return jsonLd.map((event) => ({
      event,
      venue,
      sourceHtml: html,
      source: "json-ld" as const,
    }));
  }

  // Second pass: follow event-detail links — many platforms only emit
  // Event JSON-LD on detail pages, not the listing.
  const detail = await crawlDetailPages(html, url, venue, todayISO);
  if (detail.length > 0) return detail;

  // Third pass: platform-specific deterministic parsers (Squarespace,
  // WordPress Tribe Events, Dice widgets) — free, no LLM.
  const platform = extractPlatform(html, venue, todayISO);
  if (platform.length > 0) {
    return platform.map((event) => ({
      event,
      venue,
      sourceHtml: html,
      source: "json-ld" as const,
    }));
  }

  // Fallback: LLM extraction on the unstructured HTML
  if (!hasLlm()) {
    console.warn(`   no structured data and no LLM key — skipping ${venue.name}`);
    return [];
  }
  if (isQuotaExhausted()) {
    console.warn(`   quota exhausted earlier — skipping LLM for ${venue.name}`);
    return [];
  }

  const userPrompt = `Venue: ${venue.name}
Venue location string: ${venue.whereTemplate}
Venue's default category: ${venue.category}
Venue's default mode: ${venue.defaultMode}
Today's date (skip anything before): ${todayISO}

HTML (truncated to 18k chars):
${html.slice(0, 18000)}`;

  // Small delay to be gentle on per-minute rate limits when the scanner
  // is looping through many venues in a row.
  llmAttempts.push(venue.name);
  await new Promise((r) => setTimeout(r, 1500));
  const text = await callLlm(SYSTEM_PROMPT, userPrompt);
  if (text === null) return [];
  const parsed = safeParse(text);
  if (!parsed?.events) return [];

  const candidates: Candidate[] = [];
  for (const raw of parsed.events) {
    const event = normalize(raw, venue);
    if (!event) continue;
    candidates.push({ event, venue, sourceHtml: html, source: "llm" });
  }
  return candidates;
}

const DETAIL_LINK_RE =
  /\/(events?|shows?|whats-on|performances?|programs?|calendar|productions?|screenings?)\//i;

async function crawlDetailPages(
  listingHtml: string,
  baseUrl: string,
  venue: Venue,
  todayISO: string,
): Promise<Candidate[]> {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return [];
  }
  const links = new Set<string>();
  for (const m of listingHtml.matchAll(/href="([^"#]+)"/g)) {
    let href: string;
    try {
      href = new URL(m[1]!, baseUrl).toString();
    } catch {
      continue;
    }
    if (!href.startsWith(origin)) continue;
    const path = (href.slice(origin.length).split("?")[0] ?? "").replace(/\/$/, "");
    if (!DETAIL_LINK_RE.test(path)) continue;
    // Listing/index pages have short paths; detail pages nest deeper.
    if (path.split("/").filter(Boolean).length < 2) continue;
    if (href.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")) continue;
    links.add(origin + path);
    if (links.size >= 12) break;
  }

  const out: Candidate[] = [];
  for (const link of links) {
    const detailHtml = await fetchHtml(link, "static");
    if (!detailHtml) continue;
    for (const event of extractJsonLdEvents(detailHtml, venue, todayISO)) {
      out.push({ event, venue, sourceHtml: detailHtml, source: "json-ld" });
    }
  }
  if (out.length > 0) {
    console.log(`   detail-crawl: ${out.length} events via JSON-LD on ${links.size} pages`);
  }
  return out;
}

function safeParse(text: string): { events?: unknown[] } | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as { events?: unknown[] };
  } catch {
    return null;
  }
}

function normalize(raw: unknown, venue: Venue): CalEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const day = str(r["day"]);
  const date = str(r["date"]);
  const eventTitle = str(r["event"]);
  const where = str(r["where"]) ?? venue.whereTemplate;
  const cost = str(r["cost"]) ?? "TBD";
  const category = str(r["category"]) ?? venue.category;
  const mode = str(r["mode"]) ?? venue.defaultMode;
  const flag = str(r["flag"]);
  const start = normalizeTime(str(r["start"]));
  const end = normalizeTime(str(r["end"]));
  const note = str(r["note"]);
  const url = str(r["url"]) ?? venue.url;
  if (!day || !date || !eventTitle) return null;
  return {
    day,
    date,
    event: eventTitle,
    where,
    cost,
    category: category as CalEvent["category"],
    flag: (flag as CalEvent["flag"]) ?? null,
    mode: mode as CalEvent["mode"],
    start: start ?? null,
    end: end ?? null,
    note: note ?? null,
    url,
  };
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const trimmed = decodeEntities(v).trim();
  return trimmed.length ? trimmed : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;br\s*\/?&gt;/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTime(t: string | null): string | null {
  if (!t) return null;
  const s = t.trim().toLowerCase();
  // Already HH:MM
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(:\d{2})?$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    if (h < 0 || h > 23) return null;
    return `${String(h).padStart(2, "0")}:${hhmm[2]}`;
  }
  // "7pm", "7 pm", "7:30 pm", "7:30pm"
  const twelveHr = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (twelveHr) {
    let h = Number(twelveHr[1]);
    const m = twelveHr[2] ?? "00";
    const meridiem = twelveHr[3];
    if (h < 1 || h > 12) return null;
    if (meridiem === "pm" && h !== 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  return null;
}
