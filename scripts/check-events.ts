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
//
// The same reads fill in what a listing is missing (scanner/event-price.ts): a
// price for one still at TBD, when its page states one, and the event's own
// page for one whose link is a venue's calendar or a page shared with other
// events. Fills are kept in event-checks.json with the words the price came
// from, and --apply replays them too, onto listings still at TBD or still on
// the old link.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CalEvent, EventsData } from "../src/types.ts";
import { directLinks, isTbd, listingUrls, planFill, type Fill, type PageReadWithLinks } from "./scanner/event-price.ts";
import { closeBrowser, renderPage } from "./scanner/fetchers.ts";
import { judgeListing, type ListingResult } from "./scanner/listing-check.ts";

const EVENTS = resolve("src/data/events.json");
const REMOVED = resolve("scripts/scanner/removed-events.json");
const CHECKS = resolve("scripts/scanner/event-checks.json");
const STRIKES_TO_REMOVE = 2;
const FLOOR = 0.25;
const POOL = 4;

interface CheckRow { last: string; result: ListingResult; strikes: number }
/** A price or an own-page link the run found; `replaces` is the link it was found on. */
interface FillRow extends Fill { replaces?: string }
interface ChecksFile {
  ranAt: string;
  rows: Record<string, CheckRow>;
  /** Decided by the last full run; --apply replays these onto a fresh main. */
  remove: { uid: string; why: string }[];
  /** Found by the last full run; --apply replays these too. */
  fill?: FillRow[];
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

/**
 * A price for a listing still at TBD, and its own page for a listing still on
 * the link the run read. A hand edit made since then stays.
 */
function applyFills(list: FillRow[]): number {
  if (!list.length) return 0;
  const data = load<EventsData>(EVENTS, { lastVerified: "", weeks: [] });
  const byUid = new Map(list.map((f) => [f.uid, f]));
  let n = 0;
  for (const e of data.weeks.flatMap((w) => w.events)) {
    const f = byUid.get(e.uid);
    if (!f) continue;
    const cost = f.cost && isTbd(e.cost);
    const url = f.url && f.replaces && e.url === f.replaces;
    if (cost) e.cost = f.cost!;
    if (url) e.url = f.url!;
    if (cost || url) n += 1;
  }
  if (n) writeFileSync(EVENTS, JSON.stringify(data, null, 2) + "\n");
  return n;
}

const args = process.argv.slice(2);
const today = new Date();
today.setHours(0, 0, 0, 0);
const on = localDate(today);

/**
 * Take down what the run decided, fill in what it found, and if every listing
 * was read, say the calendar was verified today: that's what the Happenings
 * footer shows.
 */
function applyChecks(checks: ChecksFile): { removed: number; filled: number } {
  const removed = applyRemovals(checks.remove, on);
  const filled = applyFills(checks.fill ?? []);
  if (checks.verifiedOn) {
    const data = load<EventsData>(EVENTS, { lastVerified: "", weeks: [] });
    if (!data.lastVerified || data.lastVerified < checks.verifiedOn) {
      data.lastVerified = checks.verifiedOn;
      writeFileSync(EVENTS, JSON.stringify(data, null, 2) + "\n");
    }
  }
  return { removed, filled };
}

if (args.includes("--apply")) {
  const checks = load<ChecksFile>(CHECKS, { ranAt: "", rows: {}, remove: [] });
  const { removed, filled } = applyChecks(checks);
  console.log(`Applied ${removed} removal(s) and ${filled} fill(s) from the last check.`);
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
const pages = new Map<string, PageReadWithLinks>();
async function read(urls: string[]): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: POOL }, async () => {
      while (next < urls.length) {
        const url = urls[next++]!;
        const p = await renderPage(url);
        pages.set(url, { status: p.status, text: p.text, url: p.url, links: p.links });
      }
    }),
  );
}
await read([...byUrl.keys()]);

// A calendar or a page shared by several events: read the event pages it links
// to, for each listing's own page and price.
const listing = listingUrls(upcoming.map(({ e }) => e));
const linked = new Set<string>();
for (const { e } of upcoming) {
  const page = e.url && listing.has(e.url) ? pages.get(e.url) : undefined;
  if (!page?.links) continue;
  for (const url of directLinks(e, page.links, page.url || e.url!)) if (!pages.has(url)) linked.add(url);
}
if (linked.size) {
  console.log(`Reading ${linked.size} event pages linked from listing pages...`);
  await read([...linked]);
}
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

// Listings at TBD, or linked to a calendar: what the same reads say about them.
const fill: FillRow[] = [];
const found: string[] = [];
for (const { e, day } of upcoming) {
  if (!e.url || !(isTbd(e.cost) || listing.has(e.url))) continue;
  const plan = planFill(e, {
    page: pages.get(e.url),
    result: rows[e.uid]!.result,
    listing: listing.has(e.url),
    reads: pages,
    year: day.getFullYear(),
    daysAway: Math.round((day.getTime() - today.getTime()) / 86_400_000),
  });
  if (!plan.cost && !plan.url) continue;
  fill.push({ uid: e.uid, cost: plan.cost, url: plan.url, replaces: plan.url ? e.url : undefined, quote: plan.quote, page: plan.page });
  const parts = [plan.cost && `${plan.cost}, from "${plan.quote}"`, plan.url && `link ${plan.url}`].filter(Boolean);
  found.push(`${e.date} ${e.event}: ${parts.join("; ")}`);
}
if (fill.length) {
  console.log(`Found ${fill.filter((f) => f.cost).length} price(s) and ${fill.filter((f) => f.url).length} event page(s):`);
  for (const f of found) console.log("  " + f);
}

const overFloor = failShare > FLOOR;
if (overFloor) {
  console.warn(`${Math.round(failShare * 100)}% failed, over the ${FLOOR * 100}% floor: removing nothing this run.`);
  remove.length = 0;
}
if (dry) {
  console.log(`Dry run: would remove ${remove.length} and fill ${fill.length}.`);
  for (const r of remove) console.log(`  ${r.uid}: ${r.why}`);
  process.exit(0);
}
const checks: ChecksFile = {
  ranAt: new Date().toISOString(),
  rows,
  remove,
  fill,
  ...(overFloor ? {} : { verifiedOn: on }),
};
writeFileSync(CHECKS, JSON.stringify(checks, null, 2) + "\n");
const { removed, filled } = applyChecks(checks);
console.log(`Removed ${removed}. Filled ${filled}.`);
process.exit(0);
