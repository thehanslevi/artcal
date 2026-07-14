// Find and merge near-duplicate events in src/data/events.json.
//
//   npx tsx scripts/dedupe-events.ts        report only
//   npx tsx scripts/dedupe-events.ts --fix  merge duplicates and write back
//
// When two entries are likely the same event (see scanner/dedupe.ts), the
// richer entry wins (notes, flags, real cost, times, url) and any fields
// it's missing are filled from the duplicate before the duplicate is
// removed.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../src/types.ts";
import { collapseRuns, isLikelyDuplicate } from "./scanner/dedupe.ts";

const FIX = process.argv.includes("--fix");
const EVENTS_PATH = resolve("src/data/events.json");

const data = JSON.parse(readFileSync(EVENTS_PATH, "utf8")) as EventsData;

interface Ref {
  week: number;
  idx: number;
  e: CalEvent;
}

const refs: Ref[] = [];
data.weeks.forEach((w, wi) =>
  w.events.forEach((e, ei) => refs.push({ week: wi, idx: ei, e: e as CalEvent })),
);

function richness(e: CalEvent): number {
  let score = 0;
  if (e.note) score += 2;
  if (e.flag) score += 1;
  if (e.url) score += 1;
  if (e.cost && e.cost.trim().toUpperCase() !== "TBD") score += 1;
  if (e.start) score += 1;
  if (e.end) score += 1;
  return score;
}

/**
 * A merged-away event takes its identity with it, so any pick saved against it
 * would dangle. Hand that identity to the survivor instead.
 */
function inheritIdentity(keep: CalEvent, lose: CalEvent): void {
  const ids = new Set(keep.aliases ?? []);
  if (lose.uid) ids.add(lose.uid);
  ids.add(`${lose.date}|${lose.event}`); // legacy key, for pre-uid picks
  ids.delete(keep.uid);
  keep.aliases = Array.from(ids);
}

function fillMissing(keep: CalEvent, lose: CalEvent): void {
  if ((!keep.cost || keep.cost.trim().toUpperCase() === "TBD") && lose.cost &&
      lose.cost.trim().toUpperCase() !== "TBD") {
    keep.cost = lose.cost;
  }
  if (!keep.start && lose.start) {
    keep.start = lose.start;
    keep.end = lose.end;
  }
  if (!keep.note && lose.note) keep.note = lose.note;
  if (!keep.url && lose.url) keep.url = lose.url;
  if (!keep.flag && lose.flag) keep.flag = lose.flag;
}

const removed = new Set<Ref>();
let merges = 0;

for (let i = 0; i < refs.length; i++) {
  const a = refs[i]!;
  if (removed.has(a)) continue;
  for (let j = i + 1; j < refs.length; j++) {
    const b = refs[j]!;
    if (removed.has(b)) continue;
    if (!isLikelyDuplicate(a.e, b.e)) continue;
    const [keep, lose] = richness(b.e) > richness(a.e) ? [b, a] : [a, b];
    console.log(`DUPE  ${keep.e.date}`);
    console.log(`  keep: ${keep.e.event}`);
    console.log(`  drop: ${lose.e.event}`);
    fillMissing(keep.e, lose.e);
    inheritIdentity(keep.e, lose.e);
    removed.add(lose);
    merges += 1;
  }
}

let out: EventsData = data;
if (merges > 0) {
  const removedByWeek = new Map<number, Set<number>>();
  for (const r of removed) {
    const s = removedByWeek.get(r.week) ?? new Set<number>();
    s.add(r.idx);
    removedByWeek.set(r.week, s);
  }
  out = {
    ...data,
    weeks: data.weeks
      .map((w, wi) => ({
        ...w,
        events: w.events.filter((_, ei) => !removedByWeek.get(wi)?.has(ei)),
      }))
      .filter((w) => w.events.length > 0),
  };
}

const year = new Date().getFullYear();
const { data: collapsedData, collapsed } = collapseRuns(out, year);
for (const c of collapsed) {
  console.log(`RUN   ${c.kept.date}  ${c.kept.event}  (+${c.dropped} more dates collapsed)`);
}

if (merges === 0 && collapsed.length === 0) {
  console.log("No duplicates or dense runs found.");
} else if (FIX) {
  writeFileSync(EVENTS_PATH, JSON.stringify(collapsedData, null, 2) + "\n", "utf8");
  console.log(
    `\nMerged ${merges} duplicates, collapsed ${collapsed.length} runs; wrote events.json.`,
  );
} else {
  console.log(
    `\n${merges} duplicates, ${collapsed.length} dense runs. Re-run with --fix to apply.`,
  );
}
