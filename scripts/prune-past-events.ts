/**
 * Remove events that have already happened from src/data/events.json so past
 * events never ship in the bundle or in the generated .ics feeds.
 *
 * Keeps every event whose date is on or after a cutoff (default: today), plus
 * any event whose date can't be parsed (fail-safe — never silently drop data
 * we don't understand). Weeks left empty are removed.
 *
 * Usage:
 *   tsx scripts/prune-past-events.ts               # cutoff = today
 *   tsx scripts/prune-past-events.ts --before=2026-08-22
 *   tsx scripts/prune-past-events.ts --dry         # report only, no write
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseEventDate, today } from "../src/lib/dates.ts";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "src", "data", "events.json");

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const beforeArg = args.find((a) => a.startsWith("--before="))?.split("=")[1];
const cutoff = beforeArg ? new Date(`${beforeArg}T00:00:00`) : today();

interface Ev {
  date?: string | null;
  event?: string;
  [k: string]: unknown;
}
interface Week {
  label: string;
  events: Ev[];
}
interface Data {
  lastVerified: string;
  weeks: Week[];
}

const data = JSON.parse(readFileSync(FILE, "utf8")) as Data;

let kept = 0;
let dropped = 0;
const weeks: Week[] = [];
for (const w of data.weeks) {
  const events = w.events.filter((e) => {
    const d = parseEventDate(e.date);
    if (!d) return true; // keep unparseable dates
    const isPast = d.getTime() < cutoff.getTime();
    if (isPast) dropped++;
    else kept++;
    return !isPast;
  });
  if (events.length > 0) weeks.push({ ...w, events });
}

console.log(
  `cutoff ${cutoff.toISOString().slice(0, 10)} · kept ${kept} · dropped ${dropped} past · weeks ${data.weeks.length} → ${weeks.length}`,
);

if (!dry) {
  const out = { ...data, weeks };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${FILE}`);
} else {
  console.log("dry run — no changes written");
}
