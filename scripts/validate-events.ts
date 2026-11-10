// Validate src/data/events.json.
//
//   npx tsx scripts/validate-events.ts
//
// Runs in `npm run lint`. The scanner writes this file every Sunday and it is
// also hand-edited, so the guarantees below need enforcing rather than
// assuming. Each check corresponds to a bug that actually shipped.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../src/types.ts";
import { seriesPrefixes, tidyTitle } from "../src/lib/title.ts";

const data = JSON.parse(
  readFileSync(resolve("src/data/events.json"), "utf8"),
) as EventsData;

const all: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);
const errors: string[] = [];
const warnings: string[] = [];

const label = (e: CalEvent) => `${e.date} "${e.event.slice(0, 44)}"`;

// Identity: a pick keyed to a missing or duplicated uid silently drops out of
// someone's subscribed calendar.
const uids = new Set<string>();
for (const e of all) {
  if (!e.uid) errors.push(`${label(e)}: missing uid`);
  else if (uids.has(e.uid)) errors.push(`${label(e)}: duplicate uid ${e.uid}`);
  uids.add(e.uid);
}

// Naming: the title is the event, never the venue. 66% carried a redundant
// "Venue: " prefix, which made the calendar sort by venue instead of by event.
for (const e of all) {
  if (!e.event?.trim()) errors.push(`${label(e)}: empty title`);
  if (e.venue && e.event.toLowerCase().startsWith(e.venue.toLowerCase())) {
    errors.push(`${label(e)}: title repeats its venue "${e.venue}"`);
  }
  if (!e.venue) warnings.push(`${label(e)}: no venue field`);
}

// A person took these off the calendar; one coming back means a scan or a merge
// ignored scripts/scanner/removed-events.json.
try {
  const removed = JSON.parse(readFileSync(resolve("scripts/scanner/removed-events.json"), "utf8")) as (CalEvent & { why?: string })[];
  for (const r of removed) {
    if (!r.why) errors.push(`removed-events.json: ${r.uid} has no reason`);
    if (uids.has(r.uid)) errors.push(`${label(r)}: was removed (${r.why}) but is back in events.json`);
  }
} catch {
  // No removals recorded yet.
}

// The title is the name of the thing, not its billing (src/lib/title.ts). The
// scanner applies the rule on the way in; a hand edit has to follow it too.
// `npm run events:tidy` rewrites every title that doesn't.
const series = seriesPrefixes(all.map((e) => e.event));
for (const e of all) {
  const tidy = tidyTitle(e.event, { series });
  if (tidy !== e.event) errors.push(`${label(e)}: title should read "${tidy}"`);
}

// Display string: a street address in `where` makes rows unscannable.
for (const e of all) {
  if (/\d{5}|USA|United States/i.test(e.where)) {
    errors.push(`${label(e)}: postal cruft in where "${e.where}"`);
  }
}

// Markup and entities leaked from scrapes and rendered raw on the site.
for (const e of all) {
  for (const f of ["event", "where", "note"] as const) {
    const v = e[f];
    if (typeof v === "string" && /&[a-z]+;|&#\d+;|<\/?[a-z]+>/i.test(v)) {
      errors.push(`${label(e)}: unescaped markup in ${f}`);
    }
  }
}

// Links: every event should be clickable from the calendar and the ICS feed.
for (const e of all) {
  if (!e.url) warnings.push(`${label(e)}: no url`);
  else if (!/^https?:\/\//.test(e.url)) errors.push(`${label(e)}: bad url ${e.url}`);
}

if (warnings.length) {
  console.warn(`events.json: ${warnings.length} warning(s)`);
  for (const w of warnings.slice(0, 10)) console.warn("  " + w);
  if (warnings.length > 10) console.warn(`  ... and ${warnings.length - 10} more`);
}

if (errors.length) {
  console.error(`\nevents.json: ${errors.length} problem(s)\n`);
  for (const e of errors.slice(0, 25)) console.error("  " + e);
  if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
  process.exit(1);
}
console.log(`events.json OK — ${all.length} events, 0 problems`);
