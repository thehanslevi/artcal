/**
 * What a title tells you about which half of the site an event belongs to.
 *
 * One vocabulary, used twice: the scanner applies it at scan time (see
 * scripts/scanner/classify.ts) and the audit applies it to the stored file (see
 * scripts/audit-modes.ts). They used to disagree, which is how a museum's film
 * nights ended up filed as workshops.
 *
 * mode is not decoration. It decides whether an event appears under Practice or
 * under Happening, so a wrong label files it under the wrong question.
 */
import type { Mode } from "../types";

/**
 * Word-bounded on every alternative. Without the boundaries "class" matches
 * inside "Classical/Jazz Improv" and files a jazz gig as a class — a real bug
 * this file exists to prevent.
 */
const bounded = (parts: string[]) =>
  new RegExp(`\\b(?:${parts.flatMap((p) => p.split("|")).join("|")})\\b`, "i");

/** You are in the audience: a finished thing being shown. */
export const WITNESS_RE = bounded([
  "concert|recital|performance|screening|showcase|gig|dj set|live music",
  "premiere|matin[ée]e|cabaret|open mic|listening (session|party)|in concert",
  "book launch|album release|quartet|quintet|orchestra|symphony",
  "exhibition|opening reception|closing reception|on view|vernissage",
  "artist talk|gallery talk|lecture|panel|symposium|keynote|in conversation",
  "conversations|festival|block party|benefit|gala|fundraiser",
  "film series|double feature|shorts program|documentary screening",
  "watch party|world cup|after dark",
]);

/**
 * You are making the thing. Wider than the scanner's original list, which had
 * no term for a critique, a writing night, a drop-in or a working group.
 */
export const MAKE_RE = bounded([
  "class|classes|workshop|course|intensive|lesson|seminar|bootcamp",
  "open studio|hands[- ]on|skill[- ]?share|drop[- ]in",
  "intro(duction)? to|beginner|learn to|make your own|build your own|diy",
  "writing (group|night|circle|hour)|write[- ]in|critique|crit night",
  "co[- ]?working|work session|working group|open shop|open lab",
  "training|apprenticeship|residency|clinic|tutorial",
  // Named family and educator making series that carry no generic keyword.
  "en familia|for educators",
]);

/**
 * "Open Studio" at a ceramics shop is a session you work in. "Open Studios" is
 * the day you walk through other people's. The plural is the whole difference,
 * so it is checked before anything else.
 */
const VISITING_RE = /\bopen studios\b/i;

export type Signal = Mode | "both" | "none";

/** What the title alone claims. "none" means: defer to the venue's default. */
export function titleSignal(title: string): Signal {
  if (VISITING_RE.test(title)) return "witness";
  const w = WITNESS_RE.test(title);
  const m = MAKE_RE.test(title);
  if (w && m) return "both";
  if (w) return "witness";
  if (m) return "make";
  return "none";
}
