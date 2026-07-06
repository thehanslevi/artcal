import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../../src/types.ts";
import { collapseRuns } from "./dedupe.ts";
import { mergeIntoEvents } from "./merge.ts";

const EVENTS_PATH = resolve("src/data/events.json");
const REVIEW_PATH = resolve("scripts/scanner/candidates-review.json");
const SUMMARY_PATH = resolve("scripts/scanner/last-run.json");
const STATE_PATH = resolve("scripts/scanner/scan-state.json");

export interface Rejection {
  venue: string;
  event: string;
  date: string;
  reason: string;
  source: string;
}

export type PerVenue = Record<
  string,
  { accepted: number; rejected: number; source: string; error?: string }
>;

export interface ScanResult {
  ranAt: string;
  accepted: CalEvent[];
  rejected: Rejection[];
  perVenue: PerVenue;
  scanState: Record<string, string>;
}

// Merge a run's accepted events onto a base calendar and write all four
// tracked scanner outputs. Used both by the live scan (base = current
// events.json) and by reconcile-scan (base = freshly-pulled origin/main),
// so a scan's results apply cleanly no matter what else landed on main.
export function writeScanOutputs(base: EventsData, result: ScanResult): {
  acceptedTotal: number;
} {
  const year = new Date(result.ranAt).getFullYear();

  writeFileSync(STATE_PATH, JSON.stringify(result.scanState, null, 2) + "\n", "utf8");

  const { data: mergedRaw, skippedDuplicates } = mergeIntoEvents(
    base,
    result.accepted,
    year,
  );
  const { data: merged } = collapseRuns(mergedRaw, year);
  writeFileSync(EVENTS_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  writeFileSync(REVIEW_PATH, JSON.stringify(result.rejected, null, 2) + "\n", "utf8");

  const acceptedTotal = result.accepted.length - skippedDuplicates.length;
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        ranAt: result.ranAt,
        acceptedTotal,
        rejectedTotal: result.rejected.length,
        duplicatesSkipped: skippedDuplicates.map((s) => ({
          event: s.event.event,
          date: s.event.date,
          duplicateOf: s.duplicateOf.event,
        })),
        perVenue: result.perVenue,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return { acceptedTotal };
}
