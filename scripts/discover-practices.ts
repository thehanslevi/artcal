// Discover standing offerings: read making venues' rendered pages and propose
// Directory changes for a person to review.
//
//   npx tsx scripts/discover-practices.ts              everything
//   npx tsx scripts/discover-practices.ts powerhouse   ids/names matching this
//
// This is the counterweight to scan-events.ts, which only finds what publishes a
// date and so drifts toward theaters and cinemas. Making publishes prices and
// standing patterns, in prose, on pages that render client-side. Those pages
// don't yield events, but once rendered most of them do say what a class costs.
//
// It writes one file, scripts/scanner/practice-proposals.json. It never writes
// practices.json: review-practices.ts applies what a person accepts, and only a
// person can move `verifiedOn`. The workflow checks that nothing else changed.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hostOf } from "../src/lib/host.ts";
import type { Practice, PracticesData } from "../src/types/practice.ts";
import { closeBrowser, renderPage } from "./scanner/fetchers.ts";
import { callLlm, hasLlm, isQuotaExhausted } from "./scanner/llm.ts";
import {
  buildLlmPrompt,
  extractPrices,
  LLM_ENVELOPE,
  LLM_SYSTEM_PROMPT,
  parseLlmReading,
  pickOfferLinks,
  planReading,
  proposeNew,
  proposeUpdates,
  recheckHeld,
  type CachedReading,
  type LlmReading,
  type Page,
  type Proposal,
} from "./scanner/practice-extract.ts";
import { VENUES } from "./scanner/venues.ts";

const PRACTICES_PATH = resolve("src/data/practices.json");
const OUT_PATH = resolve("scripts/scanner/practice-proposals.json");
const DECISIONS_PATH = resolve("scripts/scanner/practice-decisions.json");
const STATE_PATH = resolve("scripts/scanner/practice-discovery-state.json");

// Small nonprofits: a few at a time, a few pages each.
const POOL = 3;
const SUBPAGES = 3;
// The free LLM tier is shared with the Sunday scan.
const LLM_PER_RUN = 40;
// Below this share of venues answering, it's our network rather than theirs, and
// a run that saw nothing shouldn't overwrite a review file full of open items.
const FLOOR = 0.5;
// A reply longer than this isn't saved, and the venue is simply asked again.
const MAX_SAVED_REPLY = 6000;

interface Seed {
  key: string;
  name: string;
  url: string;
  row?: Practice;
  venue?: { name: string; url: string; whereTemplate: string };
}

export interface VenueResult {
  status: "read" | "blocked" | "dead" | "unreachable";
  detail?: string;
  pages: number;
  prices: number;
  /** The row's figure is still on the site. A note for the reviewer, not a verification. */
  costStillShown?: boolean;
  proposals: number;
  /** used: asked now. unchanged/stale: saved reply re-read. skipped: no reading. */
  llm?: "used" | "unchanged" | "stale" | "skipped";
  discarded?: number;
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function buildSeeds(practices: Practice[]): Seed[] {
  const hosts = new Set(practices.map((p) => hostOf(p.url)));
  const covered = (h: string) =>
    [...hosts].some((d) => d === h || h.endsWith(`.${d}`) || d.endsWith(`.${h}`));
  const seeds: Seed[] = practices.map((row) => ({
    key: row.id,
    name: row.name,
    url: row.url,
    row,
  }));
  // Making venues the event scanner knows about but the Directory doesn't.
  // Witness venues stay out on purpose: this list is for places to make things.
  for (const v of VENUES) {
    if (v.defaultMode !== "make" || covered(hostOf(v.url))) continue;
    seeds.push({ key: `new:${hostOf(v.url)}`, name: v.name, url: v.url, venue: v });
  }
  return seeds;
}

async function crawl(seed: Seed): Promise<{ result: VenueResult; pages: Page[] }> {
  const first = await renderPage(seed.url);
  const result: VenueResult = { status: "read", pages: 0, prices: 0, proposals: 0 };
  if (first.status === 0) {
    return { result: { ...result, status: "unreachable", detail: first.error }, pages: [] };
  }
  if (first.status === 404 || first.status === 410) {
    return { result: { ...result, status: "dead", detail: `HTTP ${first.status}` }, pages: [] };
  }
  // A bot wall gets recorded, not worked around. A person can still look.
  if (first.status >= 400) {
    return { result: { ...result, status: "blocked", detail: `HTTP ${first.status}` }, pages: [] };
  }
  const pages: Page[] = [{ url: first.url, text: first.text }];
  for (const link of pickOfferLinks(first.links, first.url, SUBPAGES)) {
    const sub = await renderPage(link);
    if (sub.status > 0 && sub.status < 400 && sub.text) {
      pages.push({ url: sub.url, text: sub.text });
    }
  }
  return { result: { ...result, pages: pages.length }, pages };
}

function proposalId(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 8);
}

function buildProposals(
  seed: Seed,
  pages: Page[],
  llm: LlmReading | undefined,
  today: string,
): Proposal[] {
  const stamp = { firstSeen: today, lastSeen: today };
  if (seed.row) {
    return proposeUpdates(seed.row, pages, llm).map((p) => ({
      ...p,
      ...stamp,
      // The value is part of the id: rejecting $200 shouldn't silence a later $250.
      id: proposalId([seed.key, p.change.field, JSON.stringify(p.change.proposed)]),
    }));
  }

  const fresh = proposeNew(seed.venue!, pages, llm);
  if (!fresh) return [];
  // By host alone: rejecting a venue rejects the venue, whatever it charges.
  return [{ ...fresh, ...stamp, id: proposalId(["new", hostOf(seed.url)]) }];
}

const data = JSON.parse(readFileSync(PRACTICES_PATH, "utf8")) as PracticesData;
const filter = process.argv[2]?.toLowerCase();
const now = new Date();
const today = now.toISOString().slice(0, 10);

const allSeeds = buildSeeds(data.practices);
const seeds = filter
  ? allSeeds.filter((s) => `${s.key} ${s.name}`.toLowerCase().includes(filter))
  : allSeeds;

const previous = loadJson<{ proposals: Proposal[] }>(OUT_PATH, { proposals: [] });
const decisions = loadJson<Record<string, unknown>>(DECISIONS_PATH, {});
const state = loadJson<Record<string, CachedReading>>(STATE_PATH, {});

try {
  console.log(`Reading ${seeds.length} venues...`);
  const crawled: { seed: Seed; result: VenueResult; pages: Page[]; hash: string }[] = [];
  for (let i = 0; i < seeds.length; i += POOL) {
    await Promise.all(
      seeds.slice(i, i + POOL).map(async (seed) => {
        const { result, pages } = await crawl(seed);
        const hash = createHash("sha1")
          .update(pages.map((p) => p.text).join("\n"))
          .digest("hex")
          .slice(0, 16);
        crawled.push({ seed, result, pages, hash });
        console.log(`  ${result.status.padEnd(11)} ${seed.key} (${pages.length} pages)`);
      }),
    );
  }

  const answered = crawled.filter((c) => c.result.status !== "unreachable").length;
  if (!filter && answered / Math.max(1, crawled.length) < FLOOR) {
    console.log(
      `Only ${answered}/${crawled.length} answered: likely this run's network. Leaving proposals as they are.`,
    );
    process.exit(0);
  }

  // The model is only asked about gaps, only when the page has changed since it
  // last read it, and the longest-waiting venues go first.
  const wanted = (s: Seed) =>
    !s.row || s.row.cost.kind === "unknown" || s.row.schedule.kind === "irregular";
  const queue = crawled
    .filter((c) => c.result.status === "read" && wanted(c.seed))
    .sort((a, b) =>
      (state[a.seed.key]?.at ?? "").localeCompare(state[b.seed.key]?.at ?? ""),
    );
  const readings = new Map<string, LlmReading>();
  let llmCalls = 0;
  for (const c of queue) {
    const cached = state[c.seed.key];
    const canAsk = hasLlm() && !isQuotaExhausted() && llmCalls < LLM_PER_RUN;
    const plan = planReading(cached, c.hash, canAsk);
    if (plan === "skip") {
      c.result.llm = "skipped";
      continue;
    }
    let raw: string | null;
    if (plan === "ask") {
      llmCalls += 1;
      raw = await callLlm(LLM_SYSTEM_PROMPT, buildLlmPrompt(c.seed.name, c.pages), {
        envelope: LLM_ENVELOPE,
      });
      if (raw !== null) {
        state[c.seed.key] = {
          hash: c.hash,
          at: now.toISOString(),
          ...(raw.length <= MAX_SAVED_REPLY ? { raw } : {}),
        };
      } else if (typeof cached?.raw === "string") {
        // The call failed. What it said last time still counts, as far as
        // today's page bears it out.
        raw = cached.raw;
        c.result.llm = "stale";
      }
    } else {
      raw = cached!.raw!;
    }
    if (raw === null) {
      c.result.llm = "skipped";
      continue;
    }
    // Saved or fresh, the reply goes through the same checks against the page
    // as it is today.
    const reading = parseLlmReading(raw, c.pages);
    readings.set(c.seed.key, reading);
    c.result.llm ??= plan === "ask" ? "used" : plan;
    c.result.discarded = reading.discarded;
  }

  // A venue that couldn't be read this week keeps its open proposals, rechecked
  // under today's rules. Everything else is derived again from the page and the
  // model's saved or fresh reply.
  const previousById = new Map(previous.proposals.map((p) => [p.id, p]));
  const targetOf = (p: Proposal) =>
    p.kind === "update" ? p.practiceId : `new:${hostOf(p.draft.url)}`;
  const read = new Set(
    crawled.filter((c) => c.result.status === "read").map((c) => c.seed.key),
  );

  const proposals: Proposal[] = [];
  for (const p of previous.proposals) {
    const target = targetOf(p);
    if (read.has(target)) continue;
    const again = recheckHeld(p);
    if (!again) continue;
    proposals.push(
      again.kind === "update"
        ? { ...again, id: proposalId([target, again.change.field, JSON.stringify(again.change.proposed)]) }
        : again,
    );
  }
  const held = new Set(proposals.map((p) => p.id));

  const perVenue: Record<string, VenueResult> = {};
  for (const c of crawled) {
    if (c.result.status === "read") {
      const hits = extractPrices(c.pages);
      c.result.prices = hits.length;
      if (c.seed.row && c.seed.row.cost.kind !== "unknown" && c.seed.row.cost.kind !== "free") {
        const figures = Object.values(c.seed.row.cost).filter(
          (v): v is number => typeof v === "number",
        );
        c.result.costStillShown = figures.some((f) => hits.some((h) => h.amount === f));
      }
      const fresh = buildProposals(c.seed, c.pages, readings.get(c.seed.key), today);
      for (const p of fresh) {
        if (decisions[p.id] || held.has(p.id)) continue;
        proposals.push({ ...p, firstSeen: previousById.get(p.id)?.firstSeen ?? today });
        c.result.proposals += 1;
      }
    }
    perVenue[c.seed.key] = c.result;
  }

  const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
  const rank = (p: Proposal) =>
    (p.kind === "update" ? 0 : 3) + CONFIDENCE_ORDER[p.confidence];
  const live = proposals
    .filter((p) => !decisions[p.id])
    .sort((a, b) => rank(a) - rank(b) || targetOf(a).localeCompare(targetOf(b)));

  // A filtered run is for looking at output; it can't speak for the whole list.
  if (filter) {
    console.log(JSON.stringify(live.filter((p) => read.has(targetOf(p))), null, 2));
  } else {
    writeFileSync(
      OUT_PATH,
      JSON.stringify({ ranAt: now.toISOString(), proposals: live, perVenue }, null, 2) + "\n",
    );
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
  }

  const count = (s: VenueResult["status"]) =>
    crawled.filter((c) => c.result.status === s).length;
  console.log(
    `\nread ${count("read")} · blocked ${count("blocked")} · dead ${count("dead")} · unreachable ${count("unreachable")} · LLM calls ${llmCalls}` +
      `\n${live.length} open proposals. Review with: npm run practices:review`,
  );
} finally {
  // One stuck page can keep browser.close() from ever returning (the first full
  // run sat here for hours after writing its files). Everything is on disk by
  // now, so give it ten seconds and then leave regardless.
  await Promise.race([closeBrowser(), new Promise((r) => setTimeout(r, 10_000))]);
}
process.exit(process.exitCode ?? 0);
