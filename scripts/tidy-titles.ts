// Rewrite every stored event title that doesn't follow the title rule
// (src/lib/title.ts). The scanner applies the rule to new events on the way
// in; this is for the ones already in the file, and for after the rule changes.
//
//   npx tsx scripts/tidy-titles.ts            rewrite src/data/events.json
//   npx tsx scripts/tidy-titles.ts --dry-run  list what would change
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EventsData } from "../src/types.ts";
import { seriesPrefixes, tidyTitle } from "../src/lib/title.ts";

const PATH = resolve("src/data/events.json");
const dry = process.argv.includes("--dry-run");
const data = JSON.parse(readFileSync(PATH, "utf8")) as EventsData;
const all = data.weeks.flatMap((w) => w.events);
const series = seriesPrefixes(all.map((e) => e.event));

let changed = 0;
for (const e of all) {
  const tidy = tidyTitle(e.event, { series });
  if (tidy === e.event) continue;
  changed += 1;
  console.log(`${e.date.padEnd(6)} ${e.event}\n       → ${tidy}`);
  if (!dry) e.event = tidy;
}
if (!dry && changed) writeFileSync(PATH, JSON.stringify(data, null, 2) + "\n");
console.log(`${dry ? "Would change" : "Changed"} ${changed} of ${all.length} titles.`);
