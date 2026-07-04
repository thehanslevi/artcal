import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../src/types.ts";
import { extractFromVenue } from "./scanner/extract.ts";
import { makeGateRunner } from "./scanner/gates.ts";
import { mergeIntoEvents } from "./scanner/merge.ts";
import { VENUES } from "./scanner/venues.ts";

const EVENTS_PATH = resolve("src/data/events.json");
const REVIEW_PATH = resolve("scripts/scanner/candidates-review.json");
const SUMMARY_PATH = resolve("scripts/scanner/last-run.json");

interface Rejection {
  venue: string;
  event: string;
  date: string;
  reason: string;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — cannot scan.");
    process.exit(1);
  }

  const events = JSON.parse(readFileSync(EVENTS_PATH, "utf8")) as EventsData;
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const year = now.getFullYear();

  const runGate = makeGateRunner(events, todayISO, year);
  const accepted: CalEvent[] = [];
  const rejected: Rejection[] = [];
  const perVenue: Record<string, { accepted: number; rejected: number; error?: string }> = {};

  for (const venue of VENUES) {
    console.log(`→ ${venue.name} · ${venue.url}`);
    perVenue[venue.name] = { accepted: 0, rejected: 0 };
    try {
      const candidates = await extractFromVenue(venue, todayISO);
      console.log(`   extracted ${candidates.length} candidates`);
      for (const c of candidates) {
        const gate = runGate(c);
        if (gate.pass) {
          accepted.push(c.event);
          perVenue[venue.name].accepted += 1;
        } else {
          rejected.push({
            venue: venue.name,
            event: c.event.event,
            date: c.event.date,
            reason: gate.reason ?? "unknown",
          });
          perVenue[venue.name].rejected += 1;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   FAILED: ${msg}`);
      perVenue[venue.name].error = msg;
    }
  }

  const merged = mergeIntoEvents(events, accepted, year);
  writeFileSync(EVENTS_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  writeFileSync(REVIEW_PATH, JSON.stringify(rejected, null, 2) + "\n", "utf8");
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        ranAt: now.toISOString(),
        acceptedTotal: accepted.length,
        rejectedTotal: rejected.length,
        perVenue,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(
    `\nDONE · accepted ${accepted.length} · flagged ${rejected.length} for review`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
