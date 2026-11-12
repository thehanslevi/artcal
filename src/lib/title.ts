/**
 * One rule for event titles: the title is the name of the thing, not its
 * billing. The date field says when, the venue field says where, and the
 * line-up is for the venue's page. So a title loses:
 *
 *   - the year and season:        "M³ Festival 2026"               → "M³ Festival"
 *   - an edition in parentheses:  "… (5th annual)"                 → "…"
 *   - a premiere tag in brackets: "Daily Diversions (World Premiere)" → "Daily Diversions"
 *   - a date on the end:          "… - October 18th, 2026"         → "…"
 *   - showtimes in parentheses:   "… (2 sets EVERY SUNDAY @ 10:30)" → "…"
 *   - the line-up after its name: "Transatlantik II: A, B & C"     → "Transatlantik II"
 *   - a "feat." list:             "WordHack feat. A, B and C"      → "WordHack"
 *   - a presenter in front:       "x TEM present: A, B, C"         → "A, B, C"
 *   - a genre label in front:     "JAZZ - Joel Viera Trio"         → "Joel Viera Trio"
 *   - a course counter on the end: "Hand Building Course Fall Session Week 5"
 *                                                                  → "Hand Building Course"
 *   - shouting:                   "PICKLING PARTY"                 → "Pickling Party"
 *
 * What stays: a subtitle ("Film Series: The Films of Barbara Loden",
 * "Narcisa Hirsch: Graffiti, Film & Political Gesture"), a teacher ("Relief
 * Printmaking with Anat Keinan"), a proper name that happens to carry a number
 * ("The 25th Annual Putnam County Spelling Bee"), and a film opening ("REMAKE
 * — Ross McElwee opens"). A premiere that is the event itself stays: "Record
 * Premiere Celebration", "with the NYC premiere of Songs of the Earth".
 *
 * A slur keeps its first letter and loses the rest to stars ("Field N*****"):
 * the event keeps its name and its link, and the page doesn't print the word.
 *
 * Nothing is in all caps unless it's a name. A title of two or more words
 * written entirely in capitals is the venue shouting and goes to title case;
 * a single shouted word ("UMORA", "SOUNDWRDS") and a shouted word inside a
 * mixed-case title ("MIKE's Young World", "BRIC Celebrate Brooklyn!:
 * CARRTOONS") are taken to be names and left alone, as are acronyms (DJ, NYC,
 * B&W) and roman numerals.
 *
 * The one judgement call: a series that runs many nights keeps its headliner,
 * so six nights of "BRIC Celebrate Brooklyn!" don't all read the same:
 * "BRIC Celebrate Brooklyn!: Royel Otis + Ax and the Hatchetmen" becomes
 * "BRIC Celebrate Brooklyn!: Royel Otis". A series is a prefix seen on three
 * or more different events (seriesPrefixes); a two-night festival such as
 * Transatlantik II is a name and loses its line-up entirely.
 *
 * Pure and idempotent. Picks and duplicate matching never key on the title,
 * so renaming is safe (see picks.ts and scanner/dedupe.ts).
 */

export interface TitleContext {
  /** Prefixes shared by three or more different events; see seriesPrefixes. */
  series?: ReadonlySet<string>;
}

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const YEAR = "(?:19|20)\\d\\d";
const SEASON = "(?:Spring|Summer|Fall|Autumn|Winter)";
const ORDINAL = "\\d+(?:st|nd|rd|th)";
const DASH = "[-–—]";

/** "(5th annual)", "(20th anniversary)", "(Summer 2026)", "(2026)". */
const EDITION_PAREN = new RegExp(
  `\\s*\\((?:(?:the\\s+)?${ORDINAL}\\s+(?:annual|anniversary|year|edition)|${SEASON}\\s+${YEAR}|${YEAR})\\)`,
  "gi",
);
/** "(2 sets EVERY SUNDAY @ 10:30 & 11:30AM)", "(Doors 7pm)". */
const SHOWTIME_PAREN =
  /\s*\([^()]*(?:\d\s*(?:am|pm)\b|\d:\d\d|\bevery\s+(?:sun|mon|tue|wed|thu|fri|sat)|\bdoors\b)[^()]*\)/gi;
/**
 * "(World Premiere)", "(NYC premiere)", "[U.S. Premiere]", "(Premiere)": where
 * a show is first seen is billing. Only a tag in brackets, and only a place or
 * nothing before "premiere": "(Album Premiere)" says what the night is.
 */
const PREMIERE_SCOPE =
  "(?:world|u\\.?s\\.?(?:a\\.?)?|american|north\\s+american|new\\s+york(?:\\s+city)?|ny|nyc|east\\s+coast|west\\s+coast|international|european|brooklyn|local|national|global)";
const PREMIERE_PAREN = new RegExp(`\\s*[([](?:${PREMIERE_SCOPE}\\s+)?premi[eè]re!?[)\\]]`, "gi");
/** "(feat. A, B and C)", "(w/ A)": a line-up in parentheses. */
const LINEUP_PAREN = /\s*\((?:feat\.?|ft\.?|featuring|w\/)\s[^()]*\)/gi;
/** " - July 6", " - October 18th, 2026", " – Nov 2026": a date on the end. */
const TRAILING_DATE = new RegExp(
  `\\s+${DASH}\\s+${MONTH}(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:,?\\s+${YEAR})?\\s*$`,
  "i",
);
/** "Festival 2026", "Variety 2026": a year on the end. */
const TRAILING_YEAR = new RegExp(`\\s+${YEAR}\\s*$`);
/** "x TEM present:", "Lord Debacle Presents:", "Bar Laika presents": who, not what. */
const PRESENTER = /^(?:\S+\s+){1,5}?presents?:?\s+/i;
/**
 * "Fall Session Week 5", "(2 of 3)", "Day 1 - 3", "Private Class Day 4, 5 & 6":
 * where a course has got to. The date field says that. "Night 2", "Part 1"
 * and "Vol. 4" name different programmes and stay.
 */
const COURSE_COUNTER = new RegExp(
  `\\s*(?:[-–—:,]\\s*)?(?:${SEASON}\\s+(?:session|term|cycle)\\s*)?(?:week|session|class|day|lesson|module)\\s*#?\\d+(?:\\s*(?:[-–&,]|and|to)\\s*\\d+)*(?:\\s+of\\s+\\d+)?\\s*$|\\s*\\(\\d+\\s+of\\s+\\d+\\)\\s*$`,
  "i",
);
/** A film opening or closing is one title, whatever punctuation it carries. */
const OPENING = /\s(?:opens|closes)(?:\s\(\w+\))?$/i;

const GENRE =
  /^(?:jazz|indie|folk|americana|house|techno|disco|dj'?s?|soul|funk|blues|rock|punk|pop|r&b|latin|hip[- ]?hop|electronic|ambient|noise|experimental|improv|avant[- ]garde|free|standard|vibey|singer\/songwriter|singer-songwriter|world|afrobeats?|reggae|dub|metal|hardcore|emo|country|classical|chamber|choral|gospel)$/i;

/** "JAZZ", "Indie/Folk", "STANDARD+IMPROV JAZZ", "VIBEY/HOUSE DJs": a shelf label. */
function isGenreLabel(s: string): boolean {
  const words = s.split(/[\s/+]+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && words.every((w) => GENRE.test(w));
}

const ACT_WORD =
  /\b(?:trio|quartet|quintet|sextet|septet|octet|band|orchestra|arkestra|ensemble|collective|group|choir|dj|records|friends|guests)\b/i;
const MORE = /(?:^|\s)(?:\+|&|and)\s+(?:more|guests|others)\b|^(?:feat\.?|ft\.?|featuring|w\/)\s/i;

/**
 * A line-up bills two or more acts. Separators are commas, " / " and " + ".
 * A subtitle can use the same commas ("Graffiti, Film & Political Gesture"),
 * so a plain comma list needs three or more entries, a short first entry, and
 * no closing "and"; and the entries have to look like names. "Drag + Poetry +
 * Rap" is a description, not a bill, and stays.
 */
function isLineup(rest: string): boolean {
  const s = rest.replace(/\s*\([^()]*\)/g, "").trim();
  if (MORE.test(s)) return true;
  const parts = s.split(/\s*,\s*|\s+\/\s+|\s+\+\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  const named = parts.filter((p) => /^[A-Z0-9"“]/.test(p)).length;
  if (named < 2 || named * 2 < parts.length) return false;
  if (ACT_WORD.test(s)) return true;
  if (parts.every((p) => p.split(/\s+/).length === 1)) return false;
  const usesSlashOrPlus = /\s[/+]\s/.test(s);
  if (usesSlashOrPlus) return true;
  const first = parts[0]!;
  return parts.length >= 3 && first.split(/\s+/).length <= 4 && !/,\s*(?:and|&)\s/i.test(s);
}

/** The first-billed act. */
function headliner(rest: string): string {
  return rest
    .replace(/^(?:feat\.?|ft\.?|featuring|w\/)\s+/i, "")
    .split(/\s*,\s*|\s+\/\s+|\s+\+\s+|\s+(?:feat\.?|ft\.?|featuring|w\/)\s+/i)[0]!
    .replace(/\s*\([^()]*\)/g, "")
    .trim();
}

export function tidyTitle(raw: string, ctx: TitleContext = {}): string {
  let t = raw.replace(/\s+/g, " ").trim();

  t = t
    .replace(EDITION_PAREN, "")
    .replace(PREMIERE_PAREN, "")
    .replace(SHOWTIME_PAREN, "")
    .replace(LINEUP_PAREN, "");
  t = t.replace(TRAILING_DATE, "").replace(TRAILING_YEAR, "");
  t = t.replace(COURSE_COUNTER, "").replace(COURSE_COUNTER, "");
  t = t.replace(new RegExp(`\\s+(?:${DASH}|:|\\|)\\s*$`), "").trim();

  if (OPENING.test(t)) return mask(t) || mask(raw.trim());

  // "x TEM present: A, B, C" → "A, B, C". The presenter is not the event.
  const presented = t.replace(PRESENTER, "");
  if (presented !== t && presented.length >= 3) t = presented;

  // "JAZZ - Joel Viera Trio" → "Joel Viera Trio". The genre is a shelf label.
  const genre = t.match(new RegExp(`^(.{2,30}?)\\s+${DASH}\\s+(.+)$`));
  if (genre && isGenreLabel(genre[1]!)) t = genre[2]!.trim();

  // "Name: A, B & C" → "Name"; for a long-running series, "Series: A".
  const split = t.match(new RegExp(`^(.+?)(:\\s+|\\s${DASH}\\s)(.+)$`));
  if (split) {
    const [, head, sep, rest] = split as [string, string, string, string];
    if (head.length >= 3 && !isLineup(head) && isLineup(rest)) {
      t = ctx.series?.has(head) ? `${head}${sep.trim() === ":" ? ": " : " — "}${headliner(rest)}` : head;
    }
  } else {
    const feat = t.match(/^(.+?)\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i);
    if (feat && feat[1]!.length >= 3) t = feat[1]!.trim();
  }

  t = mask(unshout(t.replace(/\s+/g, " ").trim()));
  return t || mask(raw.trim());
}

/**
 * Slurs the page never prints. Add to this list rather than editing a title by
 * hand. It also catches the word run into another ("Niggaz4Life", "Niggerati",
 * "FieldNiggas") but not "snigger" or "niggardly".
 */
const SLUR = /(?<!s)nigg(?:ah|uh|er|a(?!rd))[sz]?/gi;

/** The first letter, then a star for each letter after it. */
function mask(t: string): string {
  return t.replace(SLUR, (w) => w.charAt(0) + "*".repeat(w.length - 1));
}

/** True when the text carries a word the page masks: an event link's address, say. */
export function hasSlur(s: string): boolean {
  return mask(s) !== s;
}

/**
 * A title as the duplicate checks compare it. A stored title is masked and a
 * freshly scraped one isn't, so both are masked here and the stars read as
 * letters: "Field Niggas" from the venue and "Field N*****" in events.json
 * come out the same, word for word.
 */
export function comparableTitle(s: string): string {
  return mask(s).replace(/\*/g, "x");
}

const KEEP_CAPS = new Set([
  "DJ", "DJS", "MC", "VJ", "TV", "NYC", "NY", "LA", "UK", "USA", "US", "LES", "BAM",
  "DADA", "LPR", "NYU", "AI", "VR", "AR", "3D", "2D", "B&W", "R&B", "Q&A", "DIY",
  "BYOB", "BYOT", "EP", "LP", "CD", "VHS", "VCR", "OK", "RSVP", "NYE", "GIF",
]);
const SMALL = new Set([
  "a", "an", "the", "and", "or", "but", "nor", "of", "to", "in", "on", "at", "by",
  "for", "with", "from", "vs", "via", "as",
]);

/** "PICKLING PARTY" → "Pickling Party". Only a whole title in capitals. */
function unshout(t: string): string {
  // A masked word ("N*****") hides its letters, so the title can't be known to
  // be all capitals. Leaving it alone keeps the rule giving the same answer on
  // a second pass, after the first pass masked a lower-case word.
  if (/[A-Za-z]\*/.test(t)) return t;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return t;
  if (t.split(/[\s/]+/).filter((w) => /[A-Za-z]/.test(w)).length < 2) return t;
  let afterBreak = true;
  return t
    .split(/(\s+)/)
    .map((tok) => {
      if (/^\s+$/.test(tok)) return tok;
      const word = tok.replace(/[^A-Za-z0-9&.']/g, "");
      let out: string;
      if (KEEP_CAPS.has(word) || /^[IVXL]+$/.test(word)) out = tok;
      else if (!afterBreak && SMALL.has(word.toLowerCase())) out = tok.toLowerCase();
      else out = tok.toLowerCase().replace(/(^|[-/("“'])([a-z])/g, (_, b, c) => b + c.toUpperCase());
      afterBreak = /[:—–.!?]$/.test(tok) || /\($/.test(tok);
      return out;
    })
    .join("");
}

/**
 * Prefixes that three or more different events share. "BRIC Celebrate
 * Brooklyn!:" in front of six different nights is a series; "Transatlantik
 * II:" in front of two is a name.
 */
export function seriesPrefixes(titles: Iterable<string>): Set<string> {
  const seen = new Map<string, Set<string>>();
  for (const title of titles) {
    const m = title.match(/^(.+?):\s+(.+)$/);
    if (!m) continue;
    const [, head, rest] = m as [string, string, string];
    if (!seen.has(head)) seen.set(head, new Set());
    seen.get(head)!.add(rest.toLowerCase());
  }
  return new Set([...seen].filter(([, rests]) => rests.size >= 3).map(([h]) => h));
}
