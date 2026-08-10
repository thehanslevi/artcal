// Automated freshness sweep for src/data/practices.json.
//
//   npx tsx scripts/refresh-practices.ts
//
// The Directory is hand-verified on purpose (see check-practices.ts): a scraper
// cannot confirm that a class still costs $40 or still runs on Tuesdays. That
// judgement lives in each row's `verifiedOn`, and the quarterly hand re-check.
//
// But between those re-checks the footer date sat still for weeks and read as
// neglect, even though a 16-day-old directory is well inside its 120-day
// freshness window. This closes that gap WITHOUT lying: it confirms every
// venue's link is still live and, if the sweep genuinely reached them, stamps
// the file-level `lastChecked`. That — and only that — is what the site shows
// as "Updated". `verifiedOn` / `lastVerified` (the human claim) are never
// touched here.
//
// It edits one line. The rest of the hand-maintained file is left byte-for-byte
// intact so the bot commit never fights the human editor.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Practice } from "../src/types/practice.ts";

const PATH = resolve("src/data/practices.json");

/** Write today into lastChecked (surgical single-line edit); return true if it
 *  actually changed the file. Shared by the live sweep and the re-stamp path. */
function stamp(date: string): boolean {
  const before = readFileSync(PATH, "utf8");
  let after: string;
  if (/"lastChecked"\s*:\s*"[^"]*"/.test(before)) {
    after = before.replace(/"lastChecked"\s*:\s*"[^"]*"/, `"lastChecked": "${date}"`);
  } else {
    after = before.replace(
      /("lastVerified"\s*:\s*"[^"]*",\n)/,
      `$1  "lastChecked": "${date}",\n`,
    );
  }
  if (after === before) return false;
  writeFileSync(PATH, after);
  return true;
}

// Re-stamp mode: the workflow's push-retry loop resets to fresh main and calls
// this to re-apply an already-computed date without re-probing 65 venues.
const reStamp = process.env.LASTCHECKED_DATE;
if (reStamp) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reStamp)) {
    console.error(`LASTCHECKED_DATE must be YYYY-MM-DD, got ${reStamp}`);
    process.exit(1);
  }
  console.log(stamp(reStamp) ? `Re-stamped lastChecked = ${reStamp}.` : "Already stamped.");
  process.exit(0);
}

const raw = readFileSync(PATH, "utf8");
const data = JSON.parse(raw) as { lastChecked?: string; practices: Practice[] };

const UA =
  "Mozilla/5.0 (compatible; ArtCalFreshness/1.0; +https://nyc-art-cal.vercel.app)";

type Reach = "reached" | "unreachable";

// "Reached" is deliberately generous: a 200, a redirect, even a 403 bot wall
// all prove the host answered and the venue still exists. Only a network-level
// failure (DNS, timeout, connection refused) counts as not reached — that is
// the case where stamping "Updated" today would be a lie.
async function probe(p: Practice): Promise<Reach> {
  try {
    const res = await fetch(p.url, {
      redirect: "follow",
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    // Any HTTP answer, including 4xx/5xx, means we reached the host.
    void res.status;
    return "reached";
  } catch {
    return "unreachable";
  }
}

/** Small pool: ~65 tiny nonprofits. Don't hammer them. */
async function pooled<T, R>(
  items: T[],
  size: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

const results = await pooled(data.practices, 6, probe);
const reached = results.filter((r) => r === "reached").length;
const total = results.length;
const rate = total ? reached / total : 0;

// A CI network blip can make everything "unreachable". Bumping the date on that
// run would falsely claim freshness, so require most of the directory to answer
// before stamping. Below the floor, leave the date alone; next week retries.
const FLOOR = 0.7;
const today = new Date().toISOString().slice(0, 10);

console.log(
  `refresh-practices: reached ${reached}/${total} (${Math.round(rate * 100)}%)`,
);

if (rate < FLOOR) {
  console.log(
    `Below ${Math.round(FLOOR * 100)}% floor — not stamping lastChecked. ` +
      `Likely a network problem on this run, not the venues.`,
  );
  process.exit(0);
}

// Surgical single-line edit: the rest of the hand-maintained file is untouched.
console.log(
  stamp(today)
    ? `Stamped lastChecked = ${today}.`
    : `lastChecked already ${today} — nothing to write.`,
);
