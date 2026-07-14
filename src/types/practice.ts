// The Practice model.
//
// Art Cal's original primitive was CalEvent: one date, one row. That model can
// only express things that publish a date, which in practice means ticketed
// shows. Making does not publish dates. It publishes standing patterns:
// "Mon/Wed/Fri 6:30-8pm", "first Saturdays", "8-week sessions", "$165/month".
// So the primitive here is the standing pattern, and "what's on this week" is
// COMPUTED from it rather than scraped.
//
// Two views share this one dataset:
//   Directory (public) — where to make things in NYC, all disciplines.
//   Commitments (private) — the <=5 practices actually being done, with
//   deadlines, budget, and finish lines.

export type Discipline =
  | "ceramics"
  | "printmaking"
  | "book-arts"
  | "textiles"
  | "glass"
  | "woodworking"
  | "darkroom"
  | "film"
  | "sound"
  | "code"
  | "zines"
  | "writing"
  | "dance"
  | "theatre"
  | "voice"
  | "community";

export type Borough =
  | "brooklyn"
  | "manhattan"
  | "queens"
  | "bronx"
  | "staten-island";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** How you get in the door, and whether money is a barrier. */
export type Access =
  | "free"
  | "sliding-scale"
  | "scholarship"
  | "work-study"
  | "drop-in"
  | "membership"
  | "enroll-ahead"
  | "contact-first";

/**
 * Structured so a season's budget can actually sum. The old model stored cost
 * as a free-text string, which left 157 of 270 events at "TBD" and made the
 * binding constraint (no income) unanswerable.
 */
export type Cost =
  | { kind: "free" }
  | { kind: "sliding"; min: number; max: number }
  | { kind: "fixed"; amount: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "per-month"; amount: number }
  | { kind: "per-session"; amount: number }
  | { kind: "unknown" };

/**
 * The standing pattern. `dated` exists only for genuine one-offs; if most
 * entries end up `dated`, this model has drifted back into being an event feed.
 */
export type Schedule =
  | { kind: "weekly"; days: Weekday[]; time?: string }
  | { kind: "monthly-nth"; nth: 1 | 2 | 3 | 4 | -1; day: Weekday; time?: string }
  | { kind: "session"; weeks: number; note: string }
  | { kind: "membership"; note: string }
  | { kind: "irregular"; note: string }
  | { kind: "dated"; date: string; note?: string };

export interface Practice {
  id: string;
  name: string;
  /** One line, plain language, what you actually do there. Not marketing copy. */
  what: string;
  disciplines: Discipline[];
  neighborhood: string;
  borough: Borough;
  /** Door-to-door minutes from Crown Heights. Null when not yet measured. */
  travelMin: number | null;
  url: string;
  cost: Cost;
  schedule: Schedule;
  access: Access[];
  /** ISO date this entry was last checked against the venue's own site. */
  verifiedOn: string;
  /** Set when something is known to be wrong or unconfirmed. Shown in the UI. */
  caveat?: string;
}

export interface PracticesData {
  lastVerified: string;
  practices: Practice[];
}

// ---------------------------------------------------------------------------
// The commitment layer.
// ---------------------------------------------------------------------------

/**
 * A hard cap, enforced in code rather than by intention. The brief names the
 * failure pattern explicitly: overcommit, spread thin, get overwhelmed, finish
 * little. A calendar that can hold unlimited commitments feeds that pattern.
 * Adding a sixth active commitment forces dropping one.
 */
export const MAX_ACTIVE = 5;

export type CommitmentStatus = "active" | "considering" | "done" | "dropped";

export interface Commitment {
  practiceId: string;
  status: CommitmentStatus;
  /** Free text: "weekly", "Mondays Sep 14 - Nov 2", "one day". */
  cadence: string;
  startsOn?: string;
  endsOn?: string;
  /** Enrollment or registration deadline. Drives the decision queue. */
  decideBy?: string;
  /** What it ends in. A screening, a showing, a printed thing. */
  finishLine?: string;
  /** The single next thing to do. "Just go." "Email to confirm dates." */
  nextAction?: string;
  /** Rough monthly spend while active, for the budget line. */
  monthlyCost?: number;
  notes?: string;
}

export interface CommitmentsData {
  season: string;
  commitments: Commitment[];
}
