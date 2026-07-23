import type { Category, Mode } from "../../src/types";
import { titleSignal } from "../../src/lib/mode-signals";

// Deterministic extractors stamp every event with the venue's default mode
// and category. That breaks for multi-program institutions (a pottery studio's
// domain also hosting a jazz concert), so when the title clearly signals a
// different kind of event, override the venue default.

// The make/witness vocabulary lives in src/lib/mode-signals so that scan time
// and the audit (scripts/audit-modes.ts) can never drift apart again.

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

  // A decisive title overrides the venue default. Signals on both sides, or
  // neither, keep the venue's default.
  const signal = titleSignal(title);
  const mode: Mode = signal === "make" || signal === "witness" ? signal : venueMode;

  let category = venueCategory;
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(t)) {
      category = cat;
      break;
    }
  }

  return { mode, category };
}
