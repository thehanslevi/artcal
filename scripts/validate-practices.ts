// Validate src/data/practices.json against the Practice schema.
//
//   npx tsx scripts/validate-practices.ts
//
// practices.json is hand-maintained and imported through a cast (a plain JSON
// import widens string literals, so it can't satisfy the unions at compile
// time). That cast is only honest if something actually checks the file, so
// this runs in `npm run lint`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Access,
  Borough,
  Discipline,
  Practice,
  PracticeChecks,
  UnknownCostReason,
  Weekday,
} from "../src/types/practice.ts";

const DISCIPLINES: Discipline[] = [
  "ceramics", "printmaking", "book-arts", "textiles", "glass", "woodworking",
  "metalwork", "darkroom", "film", "sound", "code", "zines", "writing", "dance", "theatre",
  "voice", "community",
];
const BOROUGHS: Borough[] = [
  "brooklyn", "manhattan", "queens", "bronx", "staten-island",
];
const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const ACCESS: Access[] = [
  "free", "sliding-scale", "scholarship", "work-study", "drop-in",
  "membership", "enroll-ahead", "contact-first",
];
const COST_KINDS = [
  "free", "sliding", "fixed", "range", "per-month", "per-session", "unknown",
];
const UNKNOWN_WHY: UnknownCostReason[] = [
  "not-published", "blocked", "not-checked",
];
const SCHEDULE_KINDS = [
  "weekly", "monthly-nth", "session", "membership", "irregular", "dated",
];
const AVAIL_STATUS = ["running", "dormant", "waitlist", "unknown"];

const errors: string[] = [];
const raw = readFileSync(resolve("src/data/practices.json"), "utf8");
const data = JSON.parse(raw) as {
  lastVerified: string;
  lastChecked: string;
  practices: Practice[];
};

const err = (id: string, msg: string) => errors.push(`${id}: ${msg}`);
const isIso = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const seen = new Set<string>();
for (const p of data.practices) {
  const id = p.id ?? "(missing id)";
  if (!p.id) err(id, "missing id");
  if (seen.has(p.id)) err(id, "duplicate id");
  seen.add(p.id);

  if (!p.name?.trim()) err(id, "missing name");
  if (!p.what?.trim()) err(id, "missing what");
  if (!/^https?:\/\//.test(p.url ?? "")) err(id, `bad url: ${p.url}`);
  if (!isIso(p.verifiedOn)) err(id, `verifiedOn must be YYYY-MM-DD, got ${p.verifiedOn}`);
  if (!BOROUGHS.includes(p.borough)) err(id, `bad borough: ${p.borough}`);
  if (!p.disciplines?.length) err(id, "needs at least one discipline");
  for (const d of p.disciplines ?? []) {
    if (!DISCIPLINES.includes(d)) err(id, `bad discipline: ${d}`);
  }
  for (const a of p.access ?? []) {
    if (!ACCESS.includes(a)) err(id, `bad access: ${a}`);
  }
  // Rows say where a venue is, never how far it is from anyone's home.
  if ("travelMin" in p) err(id, "travelMin was removed; drop the field");
  const prose = [p.what, p.caveat, p.neighborhood].filter(Boolean).join(" ");
  if (/from home|from crown heights|walking distance|walkable|by bike|\bmin(?:ute)?s? from\b/i.test(prose)) {
    err(id, "says how far the venue is from home; name the neighborhood and stop there");
  }

  const c = p.cost;
  if (!c || !COST_KINDS.includes(c.kind)) {
    err(id, `bad cost kind: ${c?.kind}`);
  } else if (c.kind === "unknown") {
    if (!UNKNOWN_WHY.includes(c.why)) err(id, `unknown cost needs a why, got ${c.why}`);
  } else if (c.kind === "sliding" || c.kind === "range") {
    if (typeof c.min !== "number" || typeof c.max !== "number") err(id, "range needs min and max");
    else if (c.min > c.max) err(id, `min ${c.min} > max ${c.max}`);
    // A range whose ends match renders as "$825-825".
    else if (c.min === c.max) err(id, `degenerate range ${c.min}-${c.max}; use kind "fixed"`);
  } else if (c.kind !== "free" && typeof (c as { amount?: unknown }).amount !== "number") {
    // "free" is the one priced kind with nothing to state.
    err(id, `${c.kind} needs a numeric amount`);
  }

  const s = p.schedule;
  if (!s || !SCHEDULE_KINDS.includes(s.kind)) {
    err(id, `bad schedule kind: ${s?.kind}`);
  } else if (s.kind === "weekly") {
    if (!s.days?.length) err(id, "weekly needs days");
    for (const d of s.days ?? []) if (!WEEKDAYS.includes(d)) err(id, `bad weekday: ${d}`);
  } else if (s.kind === "monthly-nth") {
    if (![1, 2, 3, 4, -1].includes(s.nth)) err(id, `bad nth: ${s.nth}`);
    if (!WEEKDAYS.includes(s.day)) err(id, `bad weekday: ${s.day}`);
  } else if (s.kind === "session" && typeof s.weeks !== "number") {
    err(id, "session needs weeks");
  }

  const a = p.availability;
  if (a) {
    if (!AVAIL_STATUS.includes(a.status)) err(id, `bad availability status: ${a.status}`);
    // Dormancy always needs a reason: an unexplained "not running" is useless.
    if (a.status !== "running" && !("note" in a && a.note?.trim())) {
      err(id, `availability "${a.status}" needs a note`);
    }
    if (a.status === "running" && a.darkMonths) {
      for (const m of a.darkMonths) {
        if (!Number.isInteger(m) || m < 1 || m > 12) err(id, `bad darkMonth: ${m}`);
      }
    }
  }
}

if (!isIso(data.lastVerified)) {
  errors.push(`lastVerified must be YYYY-MM-DD, got ${data.lastVerified}`);
} else {
  // Derived, never typed. It drifted to a month behind the newest row once
  // already, which is exactly the kind of quiet lie this file must not tell.
  const newest = data.practices
    .map((p) => p.verifiedOn)
    .filter(isIso)
    .sort()
    .pop();
  if (newest && data.lastVerified !== newest) {
    errors.push(
      `lastVerified is ${data.lastVerified} but the newest verifiedOn is ${newest}`,
    );
  }
}

// lastChecked is the automated freshness sweep (refresh-practices.ts). It's a
// weaker claim than lastVerified, but it can never be OLDER: a link sweep that
// predates the last hand-verification would be a meaningless date to surface.
if (!isIso(data.lastChecked)) {
  errors.push(`lastChecked must be YYYY-MM-DD, got ${data.lastChecked}`);
} else if (isIso(data.lastVerified) && data.lastChecked < data.lastVerified) {
  errors.push(
    `lastChecked (${data.lastChecked}) is older than lastVerified (${data.lastVerified})`,
  );
}

// practice-checks.json is the scrape's, and the site trusts it for "last
// checked". A check can't name a row that isn't there, claim a pass in the
// future, or claim one newer than the run that made it.
const checks = JSON.parse(
  readFileSync(resolve("src/data/practice-checks.json"), "utf8"),
) as PracticeChecks;
const rowIds = new Set(data.practices.map((p) => p.id));
const todayIso = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
for (const [id, c] of Object.entries(checks.rows ?? {})) {
  if (!rowIds.has(id)) errors.push(`practice-checks: ${id} is not a Directory row`);
  if (!isIso(c.last)) errors.push(`practice-checks: ${id}.last must be YYYY-MM-DD`);
  if (c.ok !== undefined) {
    if (!isIso(c.ok)) errors.push(`practice-checks: ${id}.ok must be YYYY-MM-DD`);
    else if (c.ok > c.last) errors.push(`practice-checks: ${id}.ok is after its last attempt`);
    else if (c.ok > todayIso) errors.push(`practice-checks: ${id}.ok is in the future`);
  }
  if (c.result === "ok" && c.ok !== c.last) {
    errors.push(`practice-checks: ${id} passed on ${c.last} but ok says ${c.ok}`);
  }
}

if (errors.length) {
  console.error(`practices.json: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log(`practices.json OK — ${data.practices.length} practices, 0 problems`);
