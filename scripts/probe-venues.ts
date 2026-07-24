/**
 * Probe candidate venues for scrapeability before adding them to venues.ts.
 *
 * A verified making-venue list gives homepage domains, but the scanner needs an
 * events-page URL and proof the page yields structured events. This drives the
 * scanner's own extractors against each candidate's likely events pages and
 * reports what a real scan would find — so a venue only gets added once it's
 * known to produce events.
 *
 *   npx tsx scripts/probe-venues.ts                       all missing active venues
 *   npx tsx scripts/probe-venues.ts bushwickceramics.com  one domain
 *
 * Output: best URL found, method (ics/json-ld/platform), event count. Writes
 * nothing — adding to venues.ts stays a deliberate human step.
 */
import { readFileSync } from "node:fs";
import { VENUES, type Venue } from "./scanner/venues.ts";
import { fetchHtml } from "./scanner/fetchers.ts";
import { extractJsonLdEvents } from "./scanner/extract-jsonld.ts";
import { extractPlatform } from "./scanner/extract-platform.ts";
import { parseIcs } from "./scanner/extract-ics.ts";
import { hostOf } from "../src/lib/host.ts";

const TODAY = "2026-07-24";

// Paths a venue's events/classes tend to live at, most-specific first.
const PATHS = [
  "",
  "/events",
  "/events/",
  "/calendar",
  "/calendar/",
  "/classes",
  "/classes/",
  "/workshops",
  "/workshops/",
  "/schedule",
  "/whats-on",
  "/programs",
];

function shell(domain: string, url: string): Venue {
  return { name: domain, url, category: "making", defaultMode: "make", whereTemplate: domain };
}

interface Probe {
  domain: string;
  bestUrl: string | null;
  method: string;
  count: number;
}

async function findIcs(html: string, base: string): Promise<number> {
  const m = html.match(/href=["']([^"']+\.ics[^"']*)["']/i);
  if (!m) return 0;
  try {
    const url = new URL(m[1], base).href;
    const ics = await fetchHtml(url);
    return ics ? parseIcs(ics).length : 0;
  } catch {
    return 0;
  }
}

async function probe(domain: string): Promise<Probe> {
  const best: Probe = { domain, bestUrl: null, method: "—", count: 0 };
  for (const path of PATHS) {
    const url = `https://${domain}${path}`;
    const html = await fetchHtml(url).catch(() => null);
    if (!html) continue;
    const v = shell(domain, url);

    const candidates: [string, number][] = [
      ["ics", await findIcs(html, url)],
      ["json-ld", extractJsonLdEvents(html, v, TODAY).length],
      ["platform", extractPlatform(html, v, TODAY).length],
    ];
    for (const [method, count] of candidates) {
      if (count > best.count) {
        best.bestUrl = url;
        best.method = method;
        best.count = count;
      }
    }
    if (best.count >= 3 && path !== "") break;
  }
  return best;
}

const arg = process.argv[2];
const scanner = new Set(
  VENUES.flatMap((v) => [hostOf(v.url), ...(v.altSources ?? []).map((a) => hostOf(a.url))])
    .filter(Boolean)
    .map((h) => h.replace(/^www\./, "")),
);

let domains: string[];
if (arg) {
  domains = [arg.replace(/^www\./, "")];
} else {
  const rows = readFileSync("newsletter-signup-results.csv", "utf8").trim().split("\n").slice(1);
  domains = rows
    .map((l) => l.match(/^([^,]+),([^,]+),/))
    .filter((m): m is RegExpMatchArray => !!m)
    .filter((m) => m[2].trim().startsWith("submitted"))
    .map((m) => m[1].trim().toLowerCase().replace(/^www\./, ""))
    .filter((d) => !scanner.has(d) && ![...scanner].some((s) => s.endsWith(d) || d.endsWith(s)));
}

console.log(`Probing ${domains.length} venue(s)…\n`);
const results: Probe[] = [];
for (const d of domains) {
  const r = await probe(d);
  results.push(r);
  const tag = r.count >= 3 ? "✓" : r.count > 0 ? "~" : "·";
  console.log(`  ${tag} ${d.padEnd(30)}${String(r.count).padStart(3)} ev  ${r.method.padEnd(9)}${r.bestUrl ?? ""}`);
}

const scrapeable = results.filter((r) => r.count >= 3);
const weak = results.filter((r) => r.count > 0 && r.count < 3);
console.log(
  `\n${scrapeable.length} scrapeable (≥3 events), ${weak.length} weak (1–2), ` +
    `${results.length - scrapeable.length - weak.length} dry.`,
);
