// Check every upcoming listing against its own page, and take down the ones
// that aren't there. Runs after each Sunday scan and again midweek
// (.github/workflows/check-events.yml).
//
//   npx tsx scripts/check-events.ts             read every page, update checks
//   npx tsx scripts/check-events.ts --dry-run   read and report; write nothing
//   npx tsx scripts/check-events.ts --apply     re-apply the last run's removals
//                                               onto the current events.json
//                                               (CI does this after rebasing)
//
// A listing comes down after two checks in a row find its page gone or not
// listing it (src: scanner/listing-check.ts). One bad read never removes
// anything, and neither does a blocked or unreachable site. If more than a
// quarter of the listings fail in one run, nothing is removed: that's a
// network problem or a redesign, not 25% of the calendar being wrong.
// Removals go to scripts/scanner/removed-events.json with the reason, which
// the scan's gate reads so the same event isn't scraped back in.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../src/types.ts";
import { closeBrowser, renderPage } from "./scanner/fetchers.ts";
import { judgeListing, type ListingResult } from "./scanner/listing-check.ts";

const EVENTS = resolve("src/data/events.json");
const REMOVED = resolve("scripts/scanner/removed-events.json");
const CHECKS = resolve("scripts/scanner/event-checks.json");
const STRIKES_TO_REMOVE = 2;
const FLOOR = 0.25;
const POOL = 4;

interface CheckRow { last: string; result: ListingResult; strikes: number }
interface ChecksFile {
  ranAt: string;
  rows: Record<string, CheckRow>;
  /** Decided by the last full run; --apply replays these onto a fresh main. */
  remove: { uid: string; why: string }[];
  /** Set when the run read every listing and stayed under the floor. */
  verifiedOn?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// events.json carries no year; read it the way the site does (src/lib/dates.ts),
// so "upcoming" here means what the calendar lists as upcoming.
function eventDay(e: CalEvent, today: Date): Date | null {
  const [m, dd] = e.date.split(/\s+/);
  const mi = MONTHS.indexOf((m ?? "").slice(0, 3));
  if (mi < 0 || !Number(dd)) return null;
  return new Date(today.getFullYear(), mi, Number(dd));
}
const load = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback);

function applyRemovals(list: { uid: string; why: string }[], on: string): number {
  if (!list.length) return 0;
  const data = load<EventsData>(EVENTS, { lastVerified: "", weeks: [] });
  const removed = load<(CalEvent & { why: string; removedOn: string })[]>(REMOVED, []);
  const why = new Map(list.map((r) => [r.uid, r.why]));
  let n = 0;
  for (const w of data.weeks) {
    w.events = w.events.filter((e) => {
      const reason = why.get(e.uid);
      if (!reason) return true;
      removed.push({ ...e, why: reason, removedOn: on });
      n += 1;
      return false;
    });
  }
  writeFileSync(EVENTS, JSON.stringify(data, null, 2) + "\n");
  writeFileSync(REMOVED, JSON.stringify(removed, null, 2) + "\n");
  return n;
}

const args = process.argv.slice(2);
const today = new Date();
today.setHours(0, 0, 0, 0);
const on = localDate(today);

/**
 * Take down what the run decided, and if every listing was read, say the
 * calendar was verified today: that's what the Happenings footer shows.
 */
function applyChecks(checks: ChecksFile): number {
  const n = applyRemovals(checks.remove, on);
  if (checks.verifiedOn) {
    const data = load<EventsData>(EVENTS, { lastVerified: "", weeks: [] });
    if (!data.lastVerified || data.lastVerified < checks.verifiedOn) {
      data.lastVerified = checks.verifiedOn;
      writeFileSync(EVENTS, JSON.stringify(data, null, 2) + "\n");
    }
  }
  return n;
}

if (args.includes("--apply")) {
  const checks = load<ChecksFile>(CHECKS, { ranAt: "", rows: {}, remove: [] });
  console.log(`Applied ${applyChecks(checks)} removal(s) from the last check.`);
  process.exit(0);
}

const dry = args.includes("--dry-run");
const data = load<EventsData>(EVENTS, { lastVerified: "", weeks: [] });
const prior = load<ChecksFile>(CHECKS, { ranAt: "", rows: {}, remove: [] });
const upcoming = data.weeks
  .flatMap((w) => w.events)
  .map((e) => ({ e, day: eventDay(e, today) }))
  .filter((x): x is { e: CalEvent; day: Date } => x.day !== null && x.day >= today);

const byUrl = new Map<string, CalEvent[]>();
for (const { e } of upcoming) if (e.url) byUrl.set(e.url, [...(byUrl.get(e.url) ?? []), e]);

console.log(`Checking ${upcoming.length} upcoming listings on ${byUrl.size} pages...`);
const pages = new Map<string, { status: number; text: string; url: string }>();
const urls = [...byUrl.keys()];
let next = 0;
await Promise.all(
  Array.from({ length: POOL }, async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      const p = await renderPage(url);
      pages.set(url, { status: p.status, text: p.text, url: p.url });
    }
  }),
);
await Promise.race([closeBrowser(), new Promise((r) => setTimeout(r, 10_000))]);

const rows: Record<string, CheckRow> = {};
const remove: { uid: string; why: string }[] = [];
const tally: Record<string, number> = {};
const failing: string[] = [];
for (const { e, day } of upcoming) {
  const page = e.url ? pages.get(e.url) : undefined;
  const result: ListingResult = page
    ? judgeListing(e, page, {
        year: day.getFullYear(),
        daysAway: Math.round((day.getTime() - today.getTime()) / 86_400_000),
        sharedPage: (byUrl.get(e.url!)?.length ?? 0) > 1,
      })
    : "unconfirmed";
  tally[result] = (tally[result] ?? 0) + 1;
  const was = prior.rows[e.uid]?.strikes ?? 0;
  const strikes = result === "ok" ? 0 : result === "dead" || result === "unconfirmed" ? was + 1 : was;
  rows[e.uid] = { last: on, result, strikes };
  if (result === "dead" || result === "unconfirmed") {
    failing.push(`${e.date} ${e.event} (${e.venue ?? e.where}): ${result}, strike ${strikes}`);
    if (strikes >= STRIKES_TO_REMOVE) {
      remove.push({
        uid: e.uid,
        why:
          result === "dead"
            ? `Its page was gone on ${STRIKES_TO_REMOVE} checks in a row (last ${on})`
            : `Its page didn't list it on that date on ${STRIKES_TO_REMOVE} checks in a row (last ${on})`,
      });
    }
  }
}

const judged = (tally.ok ?? 0) + (tally.dead ?? 0) + (tally.unconfirmed ?? 0);
const failShare = judged ? ((tally.dead ?? 0) + (tally.unconfirmed ?? 0)) / judged : 0;
console.log(Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · "));
for (const f of failing) console.log("  " + f);

const overFloor = failShare > FLOOR;
if (overFloor) {
  console.warn(`${Math.round(failShare * 100)}% failed, over the ${FLOOR * 100}% floor: removing nothing this run.`);
  remove.length = 0;
}
if (dry) {
  console.log(`Dry run: would remove ${remove.length}.`);
  for (const r of remove) console.log(`  ${r.uid}: ${r.why}`);
  process.exit(0);
}
const checks: ChecksFile = {
  ranAt: new Date().toISOString(),
  rows,
  remove,
  ...(overFloor ? {} : { verifiedOn: on }),
};
writeFileSync(CHECKS, JSON.stringify(checks, null, 2) + "\n");
console.log(`Removed ${applyChecks(checks)}.`);
process.exit(0);
