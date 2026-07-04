import Anthropic from "@anthropic-ai/sdk";
import type { CalEvent } from "../../src/types";
import type { Venue } from "./venues";

const MODEL = "claude-sonnet-5";

export interface Candidate {
  event: CalEvent;
  venue: Venue;
  sourceHtml: string;
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
- "urgent" (venue explicitly says "going fast" / "sold out soon")
- "priority" (rare, milestone, world premiere, one-of-a-kind)
- "decide" (event happens soon and requires a decision)
- null (default)

Output strict JSON with this shape (no prose, no markdown fences):

{
  "events": [
    {
      "day": "Wed",
      "date": "Jul 8",
      "event": "Event title verbatim from source",
      "where": "provided venue string",
      "cost": "FREE" or "$X" or "$X–Y" or "TBD",
      "category": "one of the above",
      "flag": null,
      "mode": "make" or "witness",
      "start": "19:00" or null,
      "end": "20:30" or null,
      "note": "short one-line context (optional)",
      "url": "canonical URL for this event (or the venue page if none)"
    }
  ]
}`;

export async function extractFromVenue(
  venue: Venue,
  todayISO: string,
): Promise<Candidate[]> {
  const html = await fetchHtml(venue.url);
  if (!html) return [];

  const client = new Anthropic();
  const userPrompt = `Venue: ${venue.name}
Venue location string: ${venue.whereTemplate}
Venue's default category: ${venue.category}
Venue's default mode: ${venue.defaultMode}
Today's date (skip anything before): ${todayISO}

HTML (truncated to 40k chars):
${html.slice(0, 40000)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = safeParse(text);
  if (!parsed?.events) return [];

  const candidates: Candidate[] = [];
  for (const raw of parsed.events) {
    const event = normalize(raw, venue);
    if (!event) continue;
    candidates.push({ event, venue, sourceHtml: html });
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
    const parsed = JSON.parse(cleaned) as { events?: unknown[] };
    return parsed;
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
  const start = str(r["start"]);
  const end = str(r["end"]);
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
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}
