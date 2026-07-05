import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { CalEvent } from "../../src/types";
import { extractJsonLdEvents } from "./extract-jsonld.ts";
import type { Venue } from "./venues";

// gemini-flash-latest currently resolves to gemini-3.5-flash which has a 20/day
// free-tier request cap; pinning to 2.5-flash for a higher separate quota.
const MODEL = "gemini-2.5-flash";

export interface Candidate {
  event: CalEvent;
  venue: Venue;
  sourceHtml: string;
  source: "json-ld" | "llm";
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

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    events: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          day: { type: SchemaType.STRING },
          date: { type: SchemaType.STRING },
          event: { type: SchemaType.STRING },
          where: { type: SchemaType.STRING },
          cost: { type: SchemaType.STRING },
          category: { type: SchemaType.STRING },
          flag: { type: SchemaType.STRING, nullable: true },
          mode: { type: SchemaType.STRING },
          start: { type: SchemaType.STRING, nullable: true },
          end: { type: SchemaType.STRING, nullable: true },
          note: { type: SchemaType.STRING, nullable: true },
          url: { type: SchemaType.STRING },
        },
        required: [
          "day",
          "date",
          "event",
          "where",
          "cost",
          "category",
          "mode",
          "url",
        ],
      },
    },
  },
  required: ["events"],
};

export async function extractFromVenue(
  venue: Venue,
  todayISO: string,
): Promise<Candidate[]> {
  const html = await fetchHtml(venue.url);
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

  // Fallback: LLM extraction on the unstructured HTML
  if (!process.env.GOOGLE_API_KEY) {
    console.warn(`   no JSON-LD and no GOOGLE_API_KEY — skipping ${venue.name}`);
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const userPrompt = `Venue: ${venue.name}
Venue location string: ${venue.whereTemplate}
Venue's default category: ${venue.category}
Venue's default mode: ${venue.defaultMode}
Today's date (skip anything before): ${todayISO}

HTML (truncated to 40k chars):
${html.slice(0, 40000)}`;

  // Small delay to be gentle on per-minute rate limits when the scanner
  // is looping through many venues in a row.
  await new Promise((r) => setTimeout(r, 2000));
  const response = await model.generateContent(userPrompt);
  const text = response.response.text();
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

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NYCArtCalendarBot/1.0; +https://nyc-art-practice-programming.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
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
