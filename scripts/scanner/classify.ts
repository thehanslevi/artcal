import type { Category, Mode } from "../../src/types";

// Deterministic extractors stamp every event with the venue's default mode
// and category. That breaks for multi-program institutions (a pottery studio's
// domain also hosting a jazz concert), so when the title clearly signals a
// different kind of event, override the venue default.

// Audience-only signals (a jazz "concert" is witnessed, not made).
const WITNESS_RE =
  /\b(concert|recital|performance|screening|reading|showcase|gig|dj set|live music|premiere|matin[ée]e|cabaret|open mic|listening (session|party)|in concert|book launch|album release|quartet|quintet|orchestra|symphony)\b/i;

// Participatory signals. Deliberately excludes ambiguous words that show up
// in show titles: "how to" (a play, "How to Swallow a Volcano"), "lab" (a
// variety night, "Cirkus Moxie Lab"), "clinic", "crit".
const MAKE_RE =
  /\b(class|classes|workshop|course|intensive|lesson|seminar|bootcamp|open studio|hands[- ]on|skill[- ]?share)\b/i;

// Category hints — deliberately conservative and collision-free. Titles carry
// venue-name prefixes ("Symphony Space: …") and program names ("The Jazz
// Continuum" is a dance work), so bare words like "jazz"/"symphony"/"band" are
// unsafe. Only performance-type phrases that describe the event itself qualify.
const CATEGORY_HINTS: [RegExp, Category][] = [
  [/\b(in concert|concert|recital|dj set|quartet|quintet|opera)\b/i, "sound"],
  [/\b(film screening|screening of|16mm|super ?8)\b/i, "film"],
  [/\b(poetry reading|book launch|reading by)\b/i, "literature"],
];

export function classifyEvent(
  title: string,
  venueMode: Mode,
  venueCategory: Category,
): { mode: Mode; category: Category } {
  const t = title.toLowerCase();

  let mode = venueMode;
  const witness = WITNESS_RE.test(t);
  const make = MAKE_RE.test(t);
  // A clear witness signal without a make signal flips a make-default to
  // witness; a clear make signal flips the other way. Ambiguous → keep venue.
  if (witness && !make) mode = "witness";
  else if (make && !witness) mode = "make";

  let category = venueCategory;
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(t)) {
      category = cat;
      break;
    }
  }

  return { mode, category };
}
