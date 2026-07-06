import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../src/types.ts";
import { extractFromEmail } from "./scanner/extract-email.ts";
import { extractFromVenue, getLlmAttempts } from "./scanner/extract.ts";
import { closeBrowser } from "./scanner/fetchers.ts";
import { makeGateRunner } from "./scanner/gates.ts";
import { VENUES } from "./scanner/venues.ts";
import { writeScanOutputs, type ScanResult } from "./scanner/write-outputs.ts";

const EVENTS_PATH = resolve("src/data/events.json");
const STATE_PATH = resolve("scripts/scanner/scan-state.json");
const RESULT_PATH = resolve("scripts/scanner/.scan-result.json");

interface Rejection {
  venue: string;
  event: string;
  date: string;
  reason: string;
  source: "json-ld" | "llm" | "email";
}

async function main(): Promise<void> {
  // GOOGLE_API_KEY is only required for LLM fallback.
  // Venues with JSON-LD structured data work without it.
  if (!process.env.GOOGLE_API_KEY) {
    console.warn(
      "GOOGLE_API_KEY not set — LLM fallback disabled. Will only ingest venues with JSON-LD data.",
    );
  }

  const events = JSON.parse(readFileSync(EVENTS_PATH, "utf8")) as EventsData;
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const year = now.getFullYear();

  const runGate = makeGateRunner(events, todayISO, year);
  const accepted: CalEvent[] = [];
  const rejected: Rejection[] = [];
  const perVenue: Record<
    string,
    {
      accepted: number;
      rejected: number;
      source: "json-ld" | "llm" | "none";
      error?: string;
    }
  > = {};

  // Round-robin: venues whose LLM turn came longest ago go first, so the
  // small free-tier quota rotates across the whole list over successive
  // runs instead of always burning on the same top of the list.
  let scanState: Record<string, string> = {};
  try {
    scanState = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Record<string, string>;
  } catch {
    /* first run */
  }
  const venuesOrdered = [...VENUES].sort((a, b) =>
    (scanState[a.name] ?? "").localeCompare(scanState[b.name] ?? ""),
  );

  for (const venue of venuesOrdered) {
    console.log(`→ ${venue.name} · ${venue.url}`);
    perVenue[venue.name] = { accepted: 0, rejected: 0, source: "none" };
    try {
      const candidates = await extractFromVenue(venue, todayISO);
      if (candidates.length > 0) {
        perVenue[venue.name].source = candidates[0].source;
      }
      console.log(
        `   extracted ${candidates.length} candidates (${perVenue[venue.name].source})`,
      );
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
            source: c.source,
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

  // Email/newsletter pipeline (opt-in via IMAP secrets)
  let emailAccepted = 0;
  let emailRejected = 0;
  try {
    const emailCandidates = await extractFromEmail(todayISO);
    for (const c of emailCandidates) {
      const gate = runGate(c);
      if (gate.pass) {
        accepted.push(c.event);
        emailAccepted += 1;
      } else {
        rejected.push({
          venue: c.emailFrom,
          event: c.event.event,
          date: c.event.date,
          reason: gate.reason ?? "unknown",
          source: "email",
        });
        emailRejected += 1;
      }
    }
    if (emailAccepted + emailRejected > 0) {
      perVenue["_email"] = {
        accepted: emailAccepted,
        rejected: emailRejected,
        source: "llm",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`   email pipeline FAILED: ${msg}`);
  }

  for (const name of getLlmAttempts()) {
    scanState[name] = now.toISOString();
  }

  const result: ScanResult = {
    ranAt: now.toISOString(),
    accepted,
    rejected,
    perVenue,
    scanState,
  };
  // Persist the raw result (untracked) so CI can reconcile it onto the
  // latest main before pushing, avoiding events.json merge conflicts.
  writeFileSync(RESULT_PATH, JSON.stringify(result) + "\n", "utf8");

  const { acceptedTotal } = writeScanOutputs(events, result);

  console.log(
    `\nDONE · accepted ${acceptedTotal} · flagged ${rejected.length} for review`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await closeBrowser();
  });
