// Fill in what upcoming listings are missing, now: a price for each one at TBD
// whose page states one, and the event's own page for each one linked to a
// venue's calendar or to a page shared with other events. The listing check
// (scripts/check-events.ts) does the same on every run; this is for a backlog,
// or after adding events by hand.
//
//   npx tsx scripts/fill-costs.ts                    read pages, write src/data/events.json
//   npx tsx scripts/fill-costs.ts --dry-run          read and report; write nothing
//   npx tsx scripts/fill-costs.ts --report out.json  also save the report as JSON
//
// It changes `cost` (only from TBD) and `url` (only from a listing page), and
// nothing else. The rules for what counts are in scripts/scanner/event-price.ts.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { daysUntil, parseEventDate, today as startOfToday } from "../src/lib/dates.ts";
import type { CalEvent, EventsData } from "../src/types.ts";
import { directLinks, isTbd, listingUrls, planFill, type PageReadWithLinks } from "./scanner/event-price.ts";
import { closeBrowser, renderPage } from "./scanner/fetchers.ts";
import { judgeListing } from "./scanner/listing-check.ts";

const EVENTS = resolve("src/data/events.json");
const POOL = 4;
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const reportTo = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined;

const data = JSON.parse(readFileSync(EVENTS, "utf8")) as EventsData;
const today = startOfToday();
const upcoming = data.weeks
  .flatMap((w) => w.events)
  .map((e) => ({ e, day: parseEventDate(e.date) }))
  .filter((x): x is { e: CalEvent; day: Date } => x.day !== null && x.day >= today);
const listing = listingUrls(upcoming.map(({ e }) => e));
const todo = upcoming.filter(({ e }) => isTbd(e.cost) || (e.url && listing.has(e.url)));
const sharing = new Map<string, number>();
for (const { e } of upcoming) if (e.url) sharing.set(e.url, (sharing.get(e.url) ?? 0) + 1);

const pages = new Map<string, PageReadWithLinks>();
/** Read each page; one more try for any that didn't answer. */
async function read(urls: string[], tries = 2): Promise<void> {
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
  const again = urls.filter((u) => pages.get(u)?.status === 0);
  if (again.length && tries > 1) await read(again, tries - 1);
}

const urls = [...new Set(todo.flatMap(({ e }) => (e.url ? [e.url] : [])))];
console.log(`Reading ${urls.length} pages for ${todo.length} listings...`);
await read(urls);
const linked = new Set<string>();
for (const { e } of todo) {
  const page = e.url && listing.has(e.url) ? pages.get(e.url) : undefined;
  if (!page?.links) continue;
  for (const url of directLinks(e, page.links, page.url || e.url!)) if (!pages.has(url)) linked.add(url);
}
console.log(`Reading ${linked.size} event pages linked from listing pages...`);
await read([...linked]);
await Promise.race([closeBrowser(), new Promise((r) => setTimeout(r, 10_000))]);

interface Change {
  uid: string;
  date: string;
  title: string;
  cost: [string, string];
  url: [string | null, string | null];
  quote?: string;
  page?: string;
}
const changes: Change[] = [];
const left: { uid: string; date: string; title: string; url: string | null; why: string }[] = [];

for (const { e, day } of todo) {
  const before = { cost: e.cost, url: e.url };
  if (!e.url) {
    left.push({ uid: e.uid, date: e.date, title: e.event, url: null, why: "it has no link" });
    continue;
  }
  const page = pages.get(e.url);
  const daysAway = daysUntil(day, today);
  const opts = { year: day.getFullYear(), daysAway };
  const result = page ? judgeListing(e, page, { ...opts, sharedPage: (sharing.get(e.url) ?? 0) > 1 }) : "unreachable";
  const plan = planFill(e, { page, result, listing: listing.has(e.url), reads: pages, ...opts });
  if (plan.cost) e.cost = plan.cost;
  if (plan.url) e.url = plan.url;
  if (plan.cost || plan.url) {
    changes.push({
      uid: e.uid,
      date: e.date,
      title: e.event,
      cost: [before.cost, e.cost],
      url: [before.url, e.url],
      quote: plan.quote,
      page: plan.page ?? plan.url,
    });
  }
  if (isTbd(e.cost)) left.push({ uid: e.uid, date: e.date, title: e.event, url: e.url, why: plan.why ?? "no price found" });
}

const prices = changes.filter((c) => c.cost[0] !== c.cost[1]).length;
const links = changes.filter((c) => c.url[0] !== c.url[1]).length;
console.log(`\nFilled ${prices} price(s) and ${links} link(s):`);
for (const c of changes) {
  console.log(`  ${c.uid} ${c.date} ${c.title}`);
  if (c.cost[0] !== c.cost[1]) console.log(`    cost ${c.cost[0]} → ${c.cost[1]}, from "${c.quote}" (${c.page})`);
  if (c.url[0] !== c.url[1]) console.log(`    link ${c.url[0]} → ${c.url[1]}`);
}
console.log(`\nStill TBD, ${left.length}:`);
for (const l of left) console.log(`  ${l.uid} ${l.date} ${l.title}: ${l.why}`);

if (reportTo) writeFileSync(reportTo, JSON.stringify({ changes, left }, null, 2) + "\n");
if (dry) {
  console.log("\nDry run: nothing written.");
} else if (changes.length) {
  writeFileSync(EVENTS, JSON.stringify(data, null, 2) + "\n");
  console.log(`\nWrote ${changes.length} change(s) to src/data/events.json.`);
}
process.exit(0);
