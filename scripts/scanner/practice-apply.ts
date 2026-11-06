// Apply a reviewed proposal to the Directory data. Pure: the CLI owns the file.
//
// `verifiedOn` means a person checked the row against the venue's own site, and
// accepting a proposal doesn't by itself prove that. Having read one quoted line
// is not having re-read the page. So it only moves when the reviewer says so,
// with --verified, and never as a side effect. The exception is a new row, which
// can't exist without a verifiedOn: for those the flag is required rather than
// assumed, so a row can't enter the Directory carrying an unearned date.
import { hostOf } from "../../src/lib/host.ts";
import type {
  Access,
  Borough,
  Cost,
  Discipline,
  Practice,
  PracticesData,
} from "../../src/types/practice.ts";
import type { PracticeDraft, Proposal } from "./practice-extract.ts";

export interface ApplyOptions {
  /** ISO date of a human check. Omit when the reviewer didn't re-check. */
  verifiedOn?: string;
  /** Reviewer's fill-ins for a new row: what, neighborhood, borough, ... */
  set?: Record<string, string>;
}

function slug(name: string): string {
  return name
    // "Dieu Donné" is dieu-donne, not dieu-donn.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ACCESS_VALUES: Access[] = [
  "free", "sliding-scale", "scholarship", "work-study", "drop-in",
  "membership", "enroll-ahead", "contact-first",
];

/**
 * A price as a reviewer would type it, having read the page:
 *
 *   free            90            580-620
 *   250/mo          90/session    75-675 sliding
 *
 * A draft's cost is often the roughest thing in it (an entry price read as the
 * only price, or a range padded by one stray figure), and the person accepting
 * has the page open. This lets them say what it is rather than accept a figure
 * they can see is wrong.
 */
export function parseCost(text: string): Cost {
  const t = text.trim().toLowerCase().replace(/[$,]/g, "");
  const num = (s: string) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new Error(`"${text}" isn't a price`);
    return n;
  };
  if (t === "free") return { kind: "free" };
  let m = t.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)(\s+sliding)?$/);
  if (m) {
    const [min, max] = [num(m[1]!), num(m[2]!)];
    if (min >= max) throw new Error(`"${text}": a range runs low to high`);
    return { kind: m[3] ? "sliding" : "range", min, max };
  }
  m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(mo|month)$/);
  if (m) return { kind: "per-month", amount: num(m[1]!) };
  m = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(session|class|visit)$/);
  if (m) return { kind: "per-session", amount: num(m[1]!) };
  m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return { kind: "fixed", amount: num(m[1]!) };
  throw new Error(
    `can't read cost "${text}". Try: free, 90, 580-620, 250/mo, 90/session, 75-675 sliding`,
  );
}

function parseAccess(text: string): Access[] {
  const values = text.split(",").map((a) => a.trim()).filter(Boolean);
  const unknown = values.filter((a) => !ACCESS_VALUES.includes(a as Access));
  if (!values.length || unknown.length) {
    throw new Error(
      `access is a comma list of: ${ACCESS_VALUES.join(", ")}` +
        (unknown.length ? ` (not: ${unknown.join(", ")})` : ""),
    );
  }
  return [...new Set(values)] as Access[];
}

function completeDraft(
  draft: PracticeDraft,
  set: Record<string, string>,
): PracticeDraft {
  // What a place is for comes from the reviewer, whatever the draft holds: a
  // scraper can't vouch for a description, and a model's is usually the pitch.
  const out = { ...draft, what: "" };
  for (const [k, v] of Object.entries(set)) {
    switch (k) {
      case "name":
      case "what":
      case "neighborhood":
      case "url":
        out[k] = v;
        break;
      case "borough":
        out.borough = v as Borough;
        break;
      case "disciplines":
        out.disciplines = v.split(",").map((d) => d.trim()) as Discipline[];
        break;
      case "travelMin":
        out.travelMin = v === "null" ? null : Number(v);
        break;
      case "cost":
        out.cost = parseCost(v);
        break;
      case "access":
        out.access = parseAccess(v);
        break;
      default:
        throw new Error(`can't --set ${k}`);
    }
  }
  const missing: string[] = [];
  if (!out.what.trim()) missing.push("what");
  if (!out.neighborhood.trim()) missing.push("neighborhood");
  if (!out.borough) missing.push("borough");
  if (!out.disciplines.length) missing.push("disciplines");
  if (missing.length) {
    throw new Error(
      `this row still needs: ${missing.map((m) => `--set ${m}=...`).join(" ")}`,
    );
  }
  return out;
}

export function applyProposal(
  data: PracticesData,
  proposal: Proposal,
  opts: ApplyOptions = {},
): PracticesData {
  const next: PracticesData = structuredClone(data);

  if (proposal.kind === "new") {
    if (!opts.verifiedOn) {
      throw new Error(
        "a new row needs a date a person can stand behind: open the venue's site, then re-run with --verified",
      );
    }
    const host = hostOf(proposal.draft.url);
    if (next.practices.some((p) => hostOf(p.url) === host)) {
      throw new Error(`the Directory already has a row on ${host}`);
    }
    const d = completeDraft(proposal.draft, opts.set ?? {});
    const id = slug(d.name);
    if (next.practices.some((p) => p.id === id)) {
      throw new Error(`id ${id} is taken`);
    }
    const unconfirmed = d.cost.kind === "unknown" || d.schedule.kind === "irregular";
    const row: Practice = {
      id,
      name: d.name,
      what: d.what,
      disciplines: d.disciplines,
      neighborhood: d.neighborhood,
      borough: d.borough!,
      travelMin: d.travelMin,
      url: d.url,
      cost: d.cost,
      schedule: d.schedule,
      access: d.access,
      verifiedOn: opts.verifiedOn,
      ...(unconfirmed
        ? {
            caveat: `Scaffolded ${opts.verifiedOn} from the studio site; cost, schedule, and access need confirming.`,
          }
        : {}),
    };
    next.practices.push(row);
  } else {
    const row = next.practices.find((p) => p.id === proposal.practiceId);
    if (!row) throw new Error(`no row with id ${proposal.practiceId}`);
    if (JSON.stringify(row[proposal.change.field]) !== JSON.stringify(proposal.current)) {
      throw new Error(
        `${row.id}.${proposal.change.field} changed since this was proposed; review it again next run`,
      );
    }
    switch (proposal.change.field) {
      case "cost":
        row.cost = proposal.change.proposed;
        break;
      case "schedule":
        row.schedule = proposal.change.proposed;
        break;
      case "access":
        row.access = proposal.change.proposed;
        break;
    }
    if (opts.verifiedOn) row.verifiedOn = opts.verifiedOn;
  }

  // validate-practices.ts enforces both: lastVerified tracks the newest human
  // check, and a link sweep can't be older than a person having opened the site.
  next.lastVerified = next.practices.map((p) => p.verifiedOn).sort().pop()!;
  if (next.lastChecked < next.lastVerified) next.lastChecked = next.lastVerified;
  return next;
}
