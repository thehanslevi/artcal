// Review what discover-practices.ts proposed.
//
//   npx tsx scripts/review-practices.ts                 list, with quotes
//   npx tsx scripts/review-practices.ts --md            counts, for a GitHub issue
//   npx tsx scripts/review-practices.ts accept <id>     apply; verifiedOn stays put
//   npx tsx scripts/review-practices.ts accept <id> --verified
//                                                       you opened the site just
//                                                       now; verifiedOn moves too
//   npx tsx scripts/review-practices.ts accept <id> --verified --set what="..."
//
// A new venue's draft can be corrected as it's accepted. --set takes: name,
// what, neighborhood, borough, url, disciplines (comma list), access (comma
// list), and cost, written as you'd say it:
//   --set cost=90   580-620   250/mo   90/session   "75-675 sliding"   free
//   npx tsx scripts/review-practices.ts reject <id> [why]
//
// Rejected proposals stay rejected, so the same wrong guess doesn't return weekly.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PracticesData } from "../src/types/practice.ts";
import { applyProposal } from "./scanner/practice-apply.ts";
import type { Proposal } from "./scanner/practice-extract.ts";

const PRACTICES_PATH = resolve("src/data/practices.json");
const OUT_PATH = resolve("scripts/scanner/practice-proposals.json");
const DECISIONS_PATH = resolve("scripts/scanner/practice-decisions.json");

interface ProposalsFile {
  ranAt?: string;
  proposals: Proposal[];
  perVenue?: Record<string, { status: string; detail?: string }>;
}

/**
 * Today where the reviewer is. toISOString() is UTC, so an evening review in New
 * York was stamping tomorrow's date, and verifiedOn is a claim about the day a
 * person opened the site.
 */
function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

const file = loadJson<ProposalsFile>(OUT_PATH, { proposals: [] });
const decisions = loadJson<Record<string, { decision: string; on: string; why?: string }>>(
  DECISIONS_PATH,
  {},
);

function saveDecision(p: Proposal, decision: "accepted" | "rejected", why?: string): void {
  decisions[p.id] = {
    decision,
    on: localDate(),
    ...(why ? { why } : {}),
  };
  writeFileSync(DECISIONS_PATH, JSON.stringify(decisions, null, 2) + "\n");
  file.proposals = file.proposals.filter((x) => x.id !== p.id);
  writeFileSync(OUT_PATH, JSON.stringify(file, null, 2) + "\n");
}

function find(id: string | undefined): Proposal {
  const p = file.proposals.find((x) => x.id === id);
  if (!p) {
    console.error(`No open proposal with id ${id}.`);
    process.exit(1);
  }
  return p;
}

const label = (p: Proposal) => (p.kind === "update" ? p.name : p.draft.name);

function list(): void {
  if (!file.proposals.length) {
    console.log("No open proposals.");
    return;
  }
  for (const p of file.proposals) {
    const tag = `[${p.id}] ${p.confidence.toUpperCase()} ${p.method}`;
    if (p.kind === "update") {
      console.log(`\n${tag}  ${p.name} · ${p.change.field}`);
      console.log(`  now:      ${JSON.stringify(p.current)}`);
      console.log(`  proposed: ${JSON.stringify(p.change.proposed)}`);
    } else {
      console.log(`\n${tag}  NEW: ${p.draft.name}  ${p.draft.url}`);
      console.log(
        `  draft: ${JSON.stringify({ ...p.draft, name: undefined, url: undefined, what: undefined })}`,
      );
      if (p.suggestedWhat) {
        console.log(`  model's description (not applied; write yours with --set what="..."):`);
        console.log(`    ${p.suggestedWhat}`);
      }
    }
    for (const e of p.evidence) console.log(`  "${e.quote}"\n    ${e.url}`);
  }
  console.log(`\n${file.proposals.length} open. accept <id> [--verified] [--set k=v] · reject <id> [why]`);
}

// Counts and our own venue names only. Quotes are text from other people's pages
// and don't belong in an issue body, where @mentions and links would go live.
function markdown(): void {
  const updates = file.proposals.filter((p) => p.kind === "update");
  const news = file.proposals.filter((p) => p.kind === "new");
  const lines = [
    `_Discovery run ${file.ranAt?.slice(0, 10) ?? "unknown"}. These are proposals: nothing has changed in the Directory._`,
    "",
    `**${updates.length}** updates to existing rows, **${news.length}** possible new venues.`,
    "",
  ];
  const names = (ps: Proposal[]) => [...new Set(ps.map(label))].sort().join(", ");
  if (updates.length) lines.push(`Updates: ${names(updates)}`, "");
  if (news.length) lines.push(`New: ${names(news)}`, "");
  const broken = Object.entries(file.perVenue ?? {}).filter(([k, v]) =>
    !k.startsWith("new:") && (v.status === "dead" || v.status === "unreachable"),
  );
  if (broken.length) {
    // Our own row ids and a short reason. The browser's error text carries a
    // URL and a stack, which don't belong in an issue body either.
    const reason = (v: { status: string; detail?: string }) =>
      v.status === "dead"
        ? (v.detail ?? "gone")
        : /NAME_NOT_RESOLVED/.test(v.detail ?? "")
          ? "domain doesn't resolve"
          : /SSL|CERT/.test(v.detail ?? "")
            ? "certificate error"
            : "no answer";
    lines.push(`Couldn't load: ${broken.map(([k, v]) => `${k} (${reason(v)})`).join(", ")}`, "");
  }
  lines.push("Review locally: `npm run practices:review`");
  console.log(lines.join("\n"));
}

function parseFlags(args: string[]): { verified: boolean; set: Record<string, string> } {
  const set: Record<string, string> = {};
  let verified = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verified") verified = true;
    else if (args[i] === "--set") {
      const [k, ...v] = (args[++i] ?? "").split("=");
      if (!k || !v.length) throw new Error("--set needs key=value");
      set[k] = v.join("=");
    } else throw new Error(`unknown argument: ${args[i]}`);
  }
  return { verified, set };
}

function accept(id: string | undefined, args: string[]): void {
  const p = find(id);
  const before = readFileSync(PRACTICES_PATH, "utf8");
  const today = localDate();
  try {
    const { verified, set } = parseFlags(args);
    const next = applyProposal(JSON.parse(before) as PracticesData, p, {
      ...(verified ? { verifiedOn: today } : {}),
      set,
    });
    writeFileSync(PRACTICES_PATH, JSON.stringify(next, null, 2) + "\n");
    const check = spawnSync("npx", ["tsx", "scripts/validate-practices.ts"], { encoding: "utf8" });
    if (check.status !== 0) {
      writeFileSync(PRACTICES_PATH, before);
      throw new Error(`that would break validation, so nothing changed:\n${check.stderr}`);
    }
    saveDecision(p, "accepted");
    console.log(
      `Applied to ${label(p)}.${verified ? ` verifiedOn is now ${today}.` : " verifiedOn unchanged."}`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const [cmd, id, ...rest] = process.argv.slice(2);
if (cmd === "accept") accept(id, rest);
else if (cmd === "reject") {
  const p = find(id);
  saveDecision(p, "rejected", rest.join(" ") || undefined);
  console.log(`Rejected ${id} (${label(p)}). It won't be proposed again.`);
} else if (cmd === "--md") markdown();
else list();
