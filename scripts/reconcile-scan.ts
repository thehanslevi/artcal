// Re-apply the most recent scan's accepted events onto the CURRENT
// events.json, then rewrite the tracked scanner outputs. CI runs this after
// resetting to the freshest origin/main, so a scan's results merge cleanly
// no matter what else landed on main between checkout and push — no textual
// merge conflicts on the JSON.
//
//   npx tsx scripts/reconcile-scan.ts
//
// Reads scripts/scanner/.scan-result.json (written, untracked, by the scan).
// A no-op if that file is absent.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventsData } from "../src/types.ts";
import {
  writeScanOutputs,
  type ScanResult,
} from "./scanner/write-outputs.ts";

const EVENTS_PATH = resolve("src/data/events.json");
const RESULT_PATH = resolve("scripts/scanner/.scan-result.json");

if (!existsSync(RESULT_PATH)) {
  console.log("No .scan-result.json — nothing to reconcile.");
  process.exit(0);
}

const result = JSON.parse(readFileSync(RESULT_PATH, "utf8")) as ScanResult;
const base = JSON.parse(readFileSync(EVENTS_PATH, "utf8")) as EventsData;

const { acceptedTotal } = writeScanOutputs(base, result);
console.log(
  `Reconciled onto current events.json · applied ${acceptedTotal} accepted events.`,
);
