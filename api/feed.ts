// Dynamic picks feed (Vercel serverless function).
//
//   GET /api/feed?key=<sync passphrase>  → that passphrase's picks as .ics
//   GET /api/feed?curated=1              → picks of CURATOR_PASSPHRASE (env)
//
// Calendar apps poll the URL, so the feed self-updates as picks sync and as
// event data is corrected in src/data/events.json (bundled at deploy).
import { createHash } from "node:crypto";
import eventsData from "../src/data/events.json";
import { CURATOR_HASH } from "../src/lib/curator";
import { buildICal } from "../src/lib/ical";
import { buildPickIndex } from "../src/lib/picks";
import type { CalEvent, EventsData } from "../src/types";

const SUPABASE_URL = "https://djyzqifuckuwdeeltnej.supabase.co";
const SUPABASE_KEY = "sb_publishable_EIeHwihJheYgPBZbqODuAg_0oCyic99";

interface FeedRequest {
  query: Record<string, string | string[] | undefined>;
}

interface FeedResponse {
  setHeader(name: string, value: string): void;
  status(code: number): FeedResponse;
  send(body: string): void;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(
  req: FeedRequest,
  res: FeedResponse,
): Promise<void> {
  const curated = first(req.query.curated) !== undefined;
  const key = curated ? process.env.CURATOR_PASSPHRASE : first(req.query.key);

  if (!curated && (!key || key.trim().length < 4)) {
    res.status(400).send("Missing or invalid ?key=<sync passphrase>");
    return;
  }

  // Unknown key → valid empty calendar, so subscriptions set up early keep
  // working and fill in later.
  let ids = new Set<string>();
  if (key || curated) {
    const hash = key
      ? createHash("sha256").update(key.trim()).digest("hex")
      : CURATOR_HASH;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/picks?passphrase_hash=eq.${hash}&select=picks`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    if (!r.ok) {
      res.status(502).send("Picks store unavailable");
      return;
    }
    const rows = (await r.json()) as { picks: unknown }[];
    const picks = rows[0]?.picks;
    if (Array.isArray(picks)) {
      ids = new Set(picks.filter((p): p is string => typeof p === "string"));
    }
  }

  const data = eventsData as EventsData;
  const all: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);
  // Resolve through the identity index, not the title: a pick saved before a
  // rename or a dedupe merge must still land on its event rather than silently
  // disappear from someone's subscribed calendar.
  const index = buildPickIndex(all);
  const picked = new Set<CalEvent>();
  for (const id of ids) {
    const e = index.get(id);
    if (e) picked.add(e);
  }
  const events = all.filter((e) => picked.has(e));

  const ics = buildICal(events, {
    calendarName: curated
      ? "Art Cal — Curated Picks"
      : "Art Cal — My Picks",
    calendarDescription: curated
      ? "Hand-picked highlights from the full calendar. Updates as the list is curated."
      : "Your starred picks. Updates automatically as you pick events on any synced device.",
  });

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=900, stale-while-revalidate=3600",
  );
  res.status(200).send(ics);
}
