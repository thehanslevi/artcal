/**
 * Mode-label audit.
 *
 *   npx tsx scripts/audit-modes.ts            report only
 *   npx tsx scripts/audit-modes.ts --fix      apply the high-confidence flips
 *
 * mode decides which half of the site an event lands in — Practice or
 * Happening — so a wrong label doesn't just mis-tag a row, it files the event
 * under the wrong question. Two things go wrong:
 *
 *   1. A venue's defaultMode is wrong. Every ambiguous title inherits it, so a
 *      museum registered as "make" files its screenings as workshops.
 *   2. A title carries a signal the scanner's narrower regexes don't cover
 *      ("Exhibition Opening", "Artist Talk", "Block Party").
 *
 * This reports both and only rewrites events whose title is decisive. Titles
 * with signals on both sides, or neither, are listed for a human and never
 * touched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { CalEvent, EventsData, Mode } from "../src/types";
import { VENUES } from "./scanner/venues";
import { hostOf } from "../src/lib/host";
import { titleSignal } from "../src/lib/mode-signals";

const FIX = process.argv.includes("--fix");
// --check is for lint: stay quiet when clean, fail loudly when not.
const CHECK = process.argv.includes("--check");
const PATH = "src/data/events.json";

const data = JSON.parse(readFileSync(PATH, "utf8")) as EventsData;
const ALL: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);

const signal = titleSignal;

// ---- 1. Venue defaults vs the evidence of their own listings -------------
const byHost = new Map<string, { name: string; def: Mode }>();
for (const v of VENUES) {
  const h = hostOf(v.url);
  if (h) byHost.set(h, { name: v.name, def: v.defaultMode });
}

interface Tally {
  name: string;
  def: Mode;
  witness: number;
  make: number;
  none: number;
}
const venues = new Map<string, Tally>();
for (const e of ALL) {
  const h = hostOf(e.url);
  const v = byHost.get(h);
  if (!v) continue;
  const t = venues.get(h) ?? { name: v.name, def: v.def, witness: 0, make: 0, none: 0 };
  const s = signal(e.event);
  if (s === "witness") t.witness++;
  else if (s === "make") t.make++;
  else t.none++;
  venues.set(h, t);
}

const suspectVenues = [...venues.values()]
  .filter((t) => {
    const decisive = t.witness + t.make;
    if (decisive < 3) return false; // too little evidence to call
    const share = t.def === "make" ? t.witness / decisive : t.make / decisive;
    return share >= 0.7;
  })
  .sort((a, b) => b.witness + b.make - (a.witness + a.make));

// ---- 2. Individual events whose title contradicts their label -----------
const wrong = ALL.filter((e) => {
  const s = signal(e.event);
  return (s === "make" || s === "witness") && s !== e.mode;
});
const ambiguous = ALL.filter((e) => signal(e.event) === "both");

if (!CHECK) {
console.log("VENUE DEFAULTS THAT DISAGREE WITH THEIR OWN LISTINGS\n");
if (suspectVenues.length === 0) console.log("  none\n");
for (const t of suspectVenues) {
  const should: Mode = t.def === "make" ? "witness" : "make";
  console.log(
    `  ${t.name.slice(0, 34).padEnd(36)}default=${t.def.padEnd(8)}` +
      `titles: ${t.witness} witness / ${t.make} make / ${t.none} unsignalled` +
      `  -> should be ${should}`,
  );
}

console.log(`\nEVENTS WHOSE TITLE CONTRADICTS THEIR LABEL: ${wrong.length}\n`);
for (const e of wrong.slice(0, 40)) {
  console.log(
    `  ${e.mode.padEnd(8)}-> ${signal(e.event).padEnd(8)}${e.date.padEnd(8)}` +
      `${e.event.slice(0, 44).padEnd(46)}${(e.venue ?? "").slice(0, 24)}`,
  );
}
if (wrong.length > 40) console.log(`  … and ${wrong.length - 40} more`);

console.log(`\nAMBIGUOUS (signals both ways, left alone): ${ambiguous.length}`);
for (const e of ambiguous.slice(0, 12)) {
  console.log(`  ${e.mode.padEnd(8)}${e.date.padEnd(8)}${e.event.slice(0, 56)}`);
}
}

if (CHECK) {
  const problems = suspectVenues.length + wrong.length;
  if (problems === 0) {
    console.log(`modes OK — ${ALL.length} events, 0 problems`);
    process.exit(0);
  }
  console.error(
    `mode audit: ${wrong.length} contradicted events, ` +
      `${suspectVenues.length} suspect venue defaults. ` +
      `Run "npm run audit:modes" for detail.`,
  );
  process.exit(1);
}

if (FIX) {
  let n = 0;
  for (const w of data.weeks) {
    for (const e of w.events as CalEvent[]) {
      const s = signal(e.event);
      if ((s === "make" || s === "witness") && s !== e.mode) {
        e.mode = s;
        n++;
      }
    }
  }
  writeFileSync(PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`\nRelabelled ${n} events.`);
} else if (wrong.length) {
  console.log(`\nRe-run with --fix to relabel the ${wrong.length} contradicted events.`);
}
