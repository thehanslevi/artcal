// What a listing costs, and where its own page is, read off the page that
// lists it. Used by scripts/check-events.ts on every run and by
// scripts/fill-costs.ts by hand.
//
// On Nov 12, 57 of the 90 upcoming listings said "TBD", which the site shows as
// nothing, while most of their pages state a price. Finding a price on a page
// is easy; finding this event's price is the work, so the rules are narrow and
// anything short of them leaves the listing at TBD:
//
// - The price sits with this event: in its stretch of a listing page (from its
//   title and date up to the next date written on the page), or on a page about
//   this event alone, outside its "Other upcoming classes" and the like.
// - It's labelled as what a ticket, entry or class costs, or it sits right
//   after the event's title, date or start time.
// - Memberships, donations to the venue, merch, deposits, add-on, materials and
//   service fees, "$20 off", gift cards and rentals don't count.
// - "Tickets start at $25" is written "From $25", and "$20 – 21+" is $20.
// - "Free" means free admission, free with RSVP, no cover and the like. Free
//   jazz and free writing don't count, and neither does a free event next door.
//
// A listing whose link is a venue's calendar or a page shared by other events
// gets its own page instead, when the calendar links to one that shows the
// event on its date before it turns to other sessions.
import type { CalEvent } from "../../src/types.ts";
import { comparableTitle } from "../../src/lib/title.ts";
import { datePositions, judgeListing, plainText, showsEvent, wordsIn, type ListingResult, type PageRead } from "./listing-check.ts";

export interface PriceRead {
  /** As events.json writes it: "$25", "$10–12", "FREE", "$10 suggested", "Sliding scale". */
  cost: string;
  /** The words on the page it was read from. */
  quote: string;
}

export interface PriceOpts {
  year: number;
  /** Days from today to the event, so a ticket site's "today" and "tomorrow" count as its date. */
  daysAway?: number;
  /** The page is about this event alone, so all of it counts. */
  ownPage?: boolean;
}

// ---------------------------------------------------------------------------
// Reading the page

interface Text {
  /** Spaces collapsed, line breaks and case kept: quotes are cut from this. */
  raw: string;
  /** Index for index the same as raw: lowercase, no accents, line breaks as spaces. */
  low: string;
}

function prepare(text: string): Text {
  // Read the way the title words are (see plainText): a masked stored title
  // still finds the word the page spells out. Same length, so raw and low
  // stay aligned.
  const raw = comparableTitle(text)
    .replace(/\r/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n\s*/g, "\n")
    // Squarespace runs a year into the time after it: "Nov 13, 202611:00 PM".
    .replace(/\b(20\d\d)(?=\d{1,2}:\d\d)/g, "$1 ")
    .trim();
  let low = "";
  for (const ch of raw) {
    const f = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    low += f.length === ch.length ? f : ch;
  }
  return { raw, low: low.replace(/\n/g, " ") };
}

/** The title's words that say something (as listing-check counts them). */
function titleWords(title: string): string[] {
  return [...new Set(plainText(title).split(/[^a-z0-9]+/).filter((w) => w.length > 3))];
}

function share(words: string[], text: string): number {
  return words.length ? wordsIn(words, text).size / words.length : 0;
}

/** Where the title is written: most of its words, about as close together as in the title. */
function titleSpans(low: string, words: string[], title: string): [number, number][] {
  if (!words.length) return [];
  const need = Math.ceil(words.length * 0.6);
  const reach = Math.max(24, Math.round(title.length * 1.2));
  const hits: { at: number; end: number; w: string }[] = [];
  for (const w of words) {
    for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + 1)) {
      // Whole words or their starts: "pair" isn't in "repair".
      if (i === 0 || !/[a-z0-9]/.test(low[i - 1]!)) hits.push({ at: i, end: i + w.length, w });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const spans: [number, number][] = [];
  for (let i = 0; i < hits.length; i++) {
    const seen = new Set<string>();
    let end = 0;
    for (let j = i; j < hits.length && hits[j]!.end - hits[i]!.at <= reach; j++) {
      if (seen.has(hits[j]!.w)) continue;
      seen.add(hits[j]!.w);
      end = Math.max(end, hits[j]!.end);
    }
    if (seen.size < need) continue;
    const last = spans[spans.length - 1];
    if (last && hits[i]!.at <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([hits[i]!.at, end]);
  }
  return spans;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = MONTHS.join("|");
/** A day of the year to compare by: month * 32 + day. */
const dayKey = (m: number, d: number) => m * 32 + d;

interface DateAt {
  at: number;
  end: number;
  /** First and last day it covers: "November 19–21" and "Dec 21 – Dec 22" cover more than one. */
  from: number;
  to: number;
}

/** Every date written on the page, in the ways venues write them. */
function dateMentions(low: string): DateAt[] {
  const found: DateAt[] = [];
  const add = (at: number, len: number, m: number, d: number, last = d) => {
    if (m >= 0 && m < 12 && d >= 1 && d <= 31 && last >= d && last <= 31) {
      found.push({ at, end: at + len, from: dayKey(m, d), to: dayKey(m, last) });
    }
  };
  const span = "(?: ?[-–—] ?(\\d{1,2})(?![\\d:]))?";
  const monthDay = new RegExp(`\\b(${MON})[a-z]*\\.?,? (\\d{1,2})(?:st|nd|rd|th)?${span}(?![\\d:])(?:,? 20\\d\\d)?`, "g");
  for (const x of low.matchAll(monthDay)) {
    add(x.index, x[0].length, MONTHS.indexOf(x[1]!), Number(x[2]), x[3] ? Number(x[3]) : undefined);
  }
  const dayMonth = new RegExp(`(?<![\\d:/.$-])(\\d{1,2})(?:st|nd|rd|th)?${span} (?:of )?(${MON})[a-z]*\\b(?:,? 20\\d\\d)?`, "g");
  for (const x of low.matchAll(dayMonth)) {
    add(x.index, x[0].length, MONTHS.indexOf(x[3]!), Number(x[1]), x[2] ? Number(x[2]) : undefined);
  }
  // 11/18, but not 1/4" or 1/2 hour.
  const numeric = /(?<![\d/.$:])(\d{1,2})\/(\d{1,2})(?:\/(?:20)?\d\d)?(?![\d/"”'’]| ?(?:inch|in\b|cups?|hours?|hrs?|miles?|lbs?|oz\b|of\b))/g;
  for (const x of low.matchAll(numeric)) add(x.index, x[0].length, Number(x[1]) - 1, Number(x[2]));
  for (const x of low.matchAll(/\b20\d\d-(\d\d)-(\d\d)\b/g)) add(x.index, x[0].length, Number(x[1]) - 1, Number(x[2]));
  found.sort((a, b) => a.at - b.at);
  const out: DateAt[] = [];
  for (const x of found) {
    const prev = out[out.length - 1];
    if (prev && x.at < prev.end) continue;
    // "December 21, 2026 – December 22, 2026" is one stretch of days.
    if (prev && x.from > prev.to && /^ ?(?:[-–—]|to|through|thru|until) ?$/.test(low.slice(prev.end, x.at))) {
      prev.end = x.end;
      prev.to = x.to;
      continue;
    }
    out.push({ ...x });
  }
  return out;
}

/** Where this event's date is written, including "today", "tomorrow" and month grids. */
function ownDates(low: string, date: string, opts: PriceOpts, all: DateAt[]): [number, number][] {
  const [mon, dayStr] = date.trim().split(/\s+/);
  const key = dayKey(MONTHS.indexOf((mon ?? "").toLowerCase().slice(0, 3)), Number(dayStr));
  const spans: [number, number][] = all.filter((x) => x.from <= key && key <= x.to).map((x) => [x.at, x.end]);
  for (const p of datePositions(low, date, opts.year, opts.daysAway ?? -1)) {
    if (spans.some(([a, b]) => p >= a && p < b)) continue;
    spans.push([p, p + (/^[^ ]+/.exec(low.slice(p))?.[0].length ?? 1)]);
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

const TIME = /\b\d{1,2}(?::\d{2})? ?(?:am|pm|a\.m\.|p\.m\.)(?![a-z])|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/y;
const HEADER_FILLER =
  /[\s,.@|·–—-]*(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?|to|until|from|doors|at|20\d\d)(?![a-z0-9])/y;

const timeAt = (low: string, at: number) => {
  TIME.lastIndex = at;
  return TIME.exec(low)?.[0].length ?? 0;
};

/**
 * A heading runs on through the date's other forms and the times beside it,
 * and through the end of a night that runs past midnight: "Fri, Nov 13, 2026
 * 11:00 PM Sat, Nov 14, 2026 3:00 AM".
 */
function headerEnd(low: string, end: number, own: [number, number][], all: DateAt[]): number {
  let afterTime = false;
  for (let guard = 0; guard < 12; guard++) {
    const at = end + /^[\s,.@|·–—-]*/.exec(low.slice(end))![0].length;
    const date = own.find(([a]) => a === at);
    if (date) {
      end = date[1];
      afterTime = false;
      continue;
    }
    const t = timeAt(low, at);
    if (t) {
      end = at + t;
      afterTime = true;
      continue;
    }
    const until = afterTime ? all.find((x) => x.at === at) : undefined;
    const untilTime = until ? timeAt(low, until.end + /^[\s,]*/.exec(low.slice(until.end))![0].length) : 0;
    if (until && untilTime) {
      end = until.end + /^[\s,]*/.exec(low.slice(until.end))![0].length + untilTime;
      continue;
    }
    HEADER_FILLER.lastIndex = end;
    const f = HEADER_FILLER.exec(low);
    if (f && f[0].trim()) {
      end += f[0].length;
      continue;
    }
    break;
  }
  return end;
}

/** How far past its title and date an event's stretch of a listing page can run. */
const AFTER = 400;
/** How far apart a title and a date can sit and still read as one heading. */
const HEAD_GAP = 80;

interface Stretch {
  from: number;
  to: number;
}

/**
 * This event's part of a listing page: its title and date written together,
 * then on until the next date the page gives, which starts the next listing.
 */
function stretches(t: Text, titles: [number, number][], own: [number, number][], all: DateAt[]): Stretch[] {
  const out: Stretch[] = [];
  for (const [ta, tb] of titles) {
    for (const [da, db] of own) {
      const gap = da >= tb ? da - tb : ta >= db ? ta - db : 0;
      if (gap > HEAD_GAP) continue;
      // Another day's date between them means this date is the next listing's.
      const lo = Math.min(tb, db);
      const hi = Math.max(ta, da);
      if (all.some((x) => x.at >= lo && x.end <= hi && !own.some(([a, b]) => a >= x.at && b <= x.end))) continue;
      const from = Math.min(ta, da);
      const head = headerEnd(t.low, Math.max(tb, db), own, all);
      const next = all.find((x) => x.at >= head);
      const to = Math.min(next ? next.at : t.low.length, head + AFTER);
      if (!out.some((s) => s.from === from && s.to === to)) out.push({ from, to });
    }
  }
  return out;
}

/**
 * Where an event's own page turns to other events: "Other upcoming classes",
 * "Earlier Event", and Squarespace's closing "Previous / date / title / Next /
 * date / title", which has only "Next" on the first event of a run.
 */
const ELSEWHERE =
  /\n(?:keep exploring|other upcoming|you (?:may|might) also like|related (?:events|content|classes|programs)|more from\b|more events|upcoming events|see the full calendar|similar (?:events|classes)|earlier event|later event|previous\n|next\n|event navigation|« ?all events)/gi;

/** The end of a page about one event: where it turns to other events, after `from`. */
function turnAt(t: Text, from: number): number {
  const turn = [...t.raw.matchAll(ELSEWHERE)].find((x) => x.index > from);
  return turn ? turn.index : t.low.length;
}

/** Where a page about one event starts on it: its title or its date, whichever comes first. */
function startOn(titles: [number, number][], own: [number, number][]): number {
  const first = Math.min(titles[0]?.[0] ?? Infinity, own[0]?.[0] ?? Infinity);
  return Number.isFinite(first) ? first : 0;
}

// ---------------------------------------------------------------------------
// Prices

// A range's top is a price, not an age or a time: "$20 – 21+" and "$15 - 10pm" are $20 and $15.
const MONEY =
  /\$ ?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d\d))?(?!\d)(?: ?(?:[-–—]|to) ?\$? ?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d\d))?(?![\d:]| ?(?:\+|am\b|pm\b|a\.m\.|p\.m\.|yrs?\b|years?\b|and (?:up|over|older)\b)))?/g;

/** Words that make a price what a ticket, entry or class costs. */
const TICKET =
  /\b(?:tickets?|admission|entry|entrance|cover|cost|costs|price[sd]?|pricing|fee|tuition|general|ga|students?|seniors?|adults?|kids|children|youth|members?|non-?members?|advance|adv|presale|pre-sale|doors?|day of(?: show)?|orchestra|balcony|mezzanine|registration|register|enroll(?:ment)?|class|workshop|course|session|rsvp|livestream|in-person|tier \d|regular|early ?bird|standard|per person|a person|each)\b/;

/** A donation asked of those who come, rather than of the venue's supporters. */
const SUGGESTED =
  /\b(?:suggested|recommended|by donation|donation at the door|pay[- ]what[- ]you[- ](?:can|wish|want)|pwy[cw]|sliding[- ]?scale|sliding)\b/;
/** A donation that isn't asked at the door: "donations of $100 or more", "donating $50". */
const GIFT = /\b(?:donat(?:es?|ed|ing|ions?)|gifts? of)\b/;
/** "Tickets start at $25": the lowest price, not the price. */
const STARTING = /\b(?:start(?:s|ing)?(?: at| from)?|from|as low as)\s*:?\s*$/;

/** Prices that aren't for getting in: tested in the words around each one. */
const NOT_ENTRY = new RegExp(
  [
    "memberships?", "becom\\w* an? (?:member|patron|supporter|sustainer|friend)\\w*", "dues", "patrons?", "donors?",
    "sponsors?", "benefactors?", "supporters?", "sustainers?", "sustaining", "renew(?:al|als|s)?",
    "contribut(?:e|es|ion|ions)",
    "join\\w* (?:as an? |the |our )?(?:member|patron|friend|circle|club|society)\\w*",
    "members? (?:level|tier|benefits?|perks?|program)s?",
    "per (?:month|year|week|hour|night)", "monthly", "annual(?:ly)?", "yearly", "subscri\\w*", "donate",
    "tax[- ]deductible", "make a (?:gift|donation)", "support (?:us|our|the)", "gift ?cards?", "gift certificates?",
    "merch\\w*", "t-?shirts?", "hoodies?", "posters?", "vinyl", "records?", "albums?", "books?", "deposits?",
    "add[- ]?ons?", "upgrades?", "optional", "materials?", "supplies", "kits?", "handling", "surcharge", "off", "discount\\w*", "promo\\w*",
    "coupons?", "codes?", "save", "savings", "rent\\w*", "hourly", "private", "scholarships?", "grants?", "awards?",
    "prizes?", "raised", "goal", "budget", "fund\\w*", "salary", "stipend", "honorari\\w*", "worth", "value",
    "minimum", "drinks?", "beers?", "wine", "cocktails?", "food", "snacks?", "tips?", "parking", "shipping",
    "tourney", "tournament", "refund\\w*", "cancel\\w*", "under", "over", "up to", "each additional", "plus one",
    // Any "… fee" but the cost of the thing itself: service, booking, facility, firing, materials.
    "(?!class|workshop|course|entry|admission|registration|tuition|program|participation|event|ticket)[a-z]+ fees?",
  ].map((w) => `\\b${w}\\b`).join("|") + "|\\/ ?(?:mo|month|yr|year|wk|week|hr|hour|night)\\b",
);

/** Free admission, said in so many words. */
const FREE_SAID = [
  /\bfree (?:admission|entry|entrance|event|of charge|to attend|and open to (?:the public|all|everyone)|(?:with |w\/ ?)?rsvp|tickets?)\b/g,
  /\b(?:admission|entry|entrance|tickets?|cost|price|cover)(?: is| are)?:? ?[-–—]? ?free\b/g,
  /\b(?:the|this) (?:talk|event|program|programme|class|workshop|screening|concert|show|reading|performance|exhibition|opening|reception|session|lecture|panel|party|celebration|sale|fair|market|tour|meetup|gathering) is free\b/g,
  /\bno (?:cover|cost|charge|admission (?:fee|charge)|entry fee)\b/g,
  /\bat no cost\b/g,
  /\$0(?:\.00)?(?![\d.])/g,
];
/** A free day the venue runs, a giveaway, a livestream, a perk: not this event's price. */
const FREE_ELSEWHERE_BEFORE =
  /\b(?:win|giveaway|chance|members? get|members enjoy|livestream|live stream|stream|streaming|online|virtual|recording|archived?)\b[^.]{0,30}$/;
const FREE_ELSEWHERE_AFTER =
  /^[^.\n]{0,30}\b(?:every|on (?:the )?first|on (?:mon|tue|wed|thu|fri|sat|sun)|fridays|thursdays|for members)/;
/** "FREE" on its own line or in a list of tags, as listing pages print it. */
const FREE_TAG = /(?:^|\n|, ?|[|•] ?)(free)(?= ?(?:\n|$|!|\(|[|•]|rsvp\b|with rsvp\b|w\/ ?rsvp\b))/gi;
/** Pay what you can, with or without a figure. */
const SLIDING_SAID = /\b(?:pay[- ]what[- ]you[- ](?:can|wish|want)|pwy[cw]|sliding[- ]?scale)\b/g;

interface Seen {
  kind: "paid" | "suggested" | "sliding" | "free";
  lo: number;
  hi: number;
  at: number;
  end: number;
  /** "Tickets start at $25". */
  starting?: boolean;
}

const amount = (whole: string, cents?: string) => Number(whole.replace(/,/g, "")) + (cents ? Number(cents) / 100 : 0);

// No thousands comma: src/lib/summary.ts reads "$1,300" as 1 and 300.
const dollars = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** The clause a price sits in: back to the last line, sentence or "|" break, and on to the next. */
function clause(raw: string, at: number, end: number): { from: number; to: number } {
  const before = raw.slice(Math.max(0, at - 60), at).split(/\n|[|•;]|[.!?](?= )/).pop() ?? "";
  const after = raw.slice(end, end + 50).split(/\n|[|•;]|[.!?](?= |$)/)[0] ?? "";
  return { from: at - before.length, to: end + after.length };
}

/** The line before, when it's short enough to be a heading: "Admission", "Suggested donations". */
function lineBefore(raw: string, at: number): string {
  const lines = raw.slice(Math.max(0, at - 200), at).split("\n");
  if (lines.length < 2 || lines[lines.length - 1]!.length > 45) return "";
  const prev = lines[lines.length - 2]!.trim();
  return prev.length <= 40 && !prev.includes("$") ? prev : "";
}

const masked = (s: string, words: string[]) => words.reduce((acc, w) => acc.replaceAll(w, " "), s);

/** The lines the evidence sits on, as one quote when they're close together. */
function quoteOf(raw: string, seen: { at: number; end: number }[]): string {
  const lineAt = (at: number, end: number) => {
    let from = raw.lastIndexOf("\n", at - 1) + 1;
    if (at - from > 70) from = raw.indexOf(" ", at - 70) + 1;
    let to = raw.indexOf("\n", end);
    if (to < 0 || to - end > 50) to = Math.max(end, raw.lastIndexOf(" ", end + 50));
    return [from, to] as const;
  };
  const spans = seen.map((s) => lineAt(s.at, s.end));
  const [from] = spans[0]!;
  const to = Math.max(...spans.map(([, b]) => b));
  // A heading line just above, such as "Admission" or "Suggested donations".
  const head = lineBefore(raw, from + 1);
  const lead = head && raw.slice(Math.max(0, from - head.length - 1), from - 1) === head ? `${head} ` : "";
  if (to - from <= 200) return (lead + raw.slice(from, to)).replace(/\s*\n\s*/g, " ").trim();
  return [...new Set(spans.map(([a, b]) => raw.slice(a, b).replace(/\s*\n\s*/g, " ").trim()))].join(" … ").slice(0, 240);
}

/** Prices and free-admission notices on this page that belong to this event. */
function evidence(e: Pick<CalEvent, "event" | "date">, t: Text, opts: PriceOpts): Seen[] {
  const words = titleWords(e.event);
  const all = dateMentions(t.low);
  const own = ownDates(t.low, e.date, opts, all);
  const titles = titleSpans(t.low, words, e.event);
  let zones: Stretch[];
  if (opts.ownPage) {
    // The whole page, up to where it turns to other events.
    zones = [{ from: 0, to: turnAt(t, startOn(titles, own)) }];
  } else {
    zones = stretches(t, titles, own, all);
  }
  if (!zones.length) return [];
  const inZone = (at: number) => zones.some((z) => at >= z.from && at < z.to);
  const inTitle = (at: number) => titles.some(([a, b]) => at >= a && at < b);

  // The date written last before this point, within reach: on a page about one
  // event, a price beside another date is that date's ("December 7 · $95").
  const lastDate = (at: number) => all.filter((x) => x.end <= at && at - x.end <= 100).pop();
  const isOwn = (x: DateAt) => own.some(([a, b]) => a >= x.at && b <= x.end);
  const besideOtherDate = (at: number) => {
    const last = opts.ownPage ? lastDate(at) : undefined;
    return !!last && !isOwn(last);
  };
  const besideOwnDate = (at: number) => {
    const last = lastDate(at);
    return !!last && isOwn(last);
  };

  const besideHeading = (at: number) => {
    const before = t.low.slice(Math.max(0, at - 45), at);
    if (own.some(([, b]) => b <= at && at - b <= 45)) return true;
    if (/(?:\d(?::\d\d)? ?(?:am|pm|a\.m\.|p\.m\.)|\d:\d\d)[^$]{0,30}$/.test(before)) return true;
    return share(words, t.low.slice(Math.max(0, at - 60), at)) >= 0.6;
  };

  const seen: Seen[] = [];
  let otherSessions = 0;
  const moneys = [...t.low.matchAll(MONEY)];
  moneys.forEach((x, i) => {
    const at = x.index;
    const end = at + x[0].length;
    if (!inZone(at)) return;
    if (besideOtherDate(at)) {
      otherSessions += 1;
      return;
    }
    const lo = amount(x[1]!, x[2]);
    const hi = Math.max(lo, x[3] ? amount(x[3], x[4]) : lo);
    const prevEnd = i > 0 ? moneys[i - 1]!.index + moneys[i - 1]![0].length : 0;
    const c = clause(t.raw, at, end);
    const before = t.low.slice(Math.max(prevEnd, c.from), at);
    const after = t.low.slice(end, c.to);
    // A label can sit on the line above: "Admission / General $12".
    const lineStart = t.raw.lastIndexOf("\n", at - 1) + 1;
    const heading = TICKET.test(before) || SUGGESTED.test(before) || at - lineStart > 45 ? "" : lineBefore(t.raw, at);
    const near = masked(`${prepare(heading).low} | ${before} | ${after}`, words);
    if (NOT_ENTRY.test(near) || /\+ ?$/.test(before)) return;
    const suggested = SUGGESTED.test(near);
    if (!suggested && GIFT.test(near)) return;
    if (!suggested && !TICKET.test(near) && !besideHeading(at)) return;
    const kind = !suggested ? "paid" : /sliding|pay|pwy/.test(near) ? "sliding" : "suggested";
    seen.push({ kind, lo, hi, at, end, starting: STARTING.test(before) });
  });

  for (const re of FREE_SAID) {
    for (const x of t.low.matchAll(re)) {
      const at = x.index;
      const end = at + x[0].length;
      if (!inZone(at) || inTitle(at) || besideOtherDate(at)) continue;
      if (FREE_ELSEWHERE_BEFORE.test(t.low.slice(Math.max(0, at - 50), at))) continue;
      if (FREE_ELSEWHERE_AFTER.test(t.low.slice(end))) continue;
      seen.push({ kind: "free", lo: 0, hi: 0, at, end });
    }
  }
  for (const x of t.raw.matchAll(FREE_TAG)) {
    const at = x.index + x[0].length - x[1]!.length;
    if (!inZone(at) || inTitle(at) || besideOtherDate(at)) continue;
    // A tag belongs to the heading it's printed with.
    if (!besideHeading(at) && !titles.some(([a, b]) => Math.abs(a - at) <= 60 || Math.abs(at - b) <= 60)) continue;
    seen.push({ kind: "free", lo: 0, hi: 0, at, end: at + 4 });
  }
  for (const x of t.low.matchAll(SLIDING_SAID)) {
    if (!inZone(x.index) || inTitle(x.index) || besideOtherDate(x.index)) continue;
    // A studio's menu can carry a "Sliding Scale" page; on an event's own page
    // the words have to sit with its heading.
    if (opts.ownPage && !besideHeading(x.index)) continue;
    seen.push({ kind: "sliding", lo: 0, hi: 0, at: x.index, end: x.index + x[0].length });
  }
  seen.sort((a, b) => a.at - b.at);

  // A page that prices each date separately: this date's price is the one.
  if (otherSessions) {
    const session = seen.filter((s) => besideOwnDate(s.at));
    if (session.length) return session;
  }
  return seen;
}

/**
 * What this event costs according to this page, or null when the page doesn't
 * say clearly. `text` is the page's visible text.
 */
export function findPrice(e: Pick<CalEvent, "event" | "date">, text: string, opts: PriceOpts): PriceRead | null {
  const t = prepare(text);
  if (t.low.length < 20) return null;
  const seen = evidence(e, t, opts);
  if (!seen.length) return null;
  const quote = quoteOf(t.raw, seen);
  const free = seen.some((s) => s.kind === "free");
  const paid = seen.filter((s) => s.kind === "paid");
  const asked = seen.filter((s) => s.kind === "suggested" || s.kind === "sliding");
  // Two answers, or prices too far apart to be one event's tiers: not sure.
  if (paid.length && (free || asked.length)) return null;
  if (!paid.length && !asked.length) return free ? { cost: "FREE", quote } : null;
  const pool = paid.length ? paid : asked.filter((s) => s.lo > 0);
  if (!pool.length) return { cost: "Sliding scale", quote };
  const lo = Math.min(...pool.map((s) => s.lo));
  const hi = Math.max(...pool.map((s) => s.hi));
  if (lo <= 0 || hi > lo * 8) return null;
  const range = lo === hi ? `$${dollars(lo)}` : `$${dollars(lo)}–${dollars(hi)}`;
  // src/lib/cost.ts shows "From $25" as it's written.
  if (paid.some((s) => s.starting)) return { cost: `From $${dollars(lo)}`, quote };
  if (paid.length) return { cost: range, quote };
  return { cost: asked.some((s) => s.kind === "sliding") ? `${range} sliding scale` : `${range} suggested`, quote };
}

// ---------------------------------------------------------------------------
// Links

/** Tracking parameters that say nothing about the page. */
const TRACKING = /^(?:utm_.*|mc_.*|fbclid|gclid|dclid|msclkid|igshid|yclid|_ga|_gl|srsltid)$/i;

/** The address without tracking parameters or a #fragment. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

const bareHost = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const path = (u: URL) => u.pathname.replace(/\/+$/, "");
    return bareHost(x) === bareHost(y) && path(x) === path(y) && x.search === y.search;
  } catch {
    return a === b;
  }
}

/** A venue's homepage, calendar, schedule or season page: an index of events, not one event. */
export function isIndexUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
    const last = path.split("/").pop() ?? "";
    return (
      path === "" ||
      /^(?:calendars?|schedule|events?|upcoming(?:-events)?|whats-?on|what-s-on|programs?|programming|programmes|classes|workshops|courses|performances|performing-arts|shows|exhibitions|happenings|listings?|series|season|[\d-]*-season)$/.test(
        last,
      )
    );
  } catch {
    return false;
  }
}

/**
 * Links that are listing pages: an index, or one address shared by events with
 * different titles. The same class on several dates sharing its own page is fine.
 */
export function listingUrls(events: Pick<CalEvent, "event" | "url">[]): Set<string> {
  const titles = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.url) continue;
    const set = titles.get(e.url) ?? new Set<string>();
    set.add(titleWords(e.event).join(" ") || e.event);
    titles.set(e.url, set);
  }
  return new Set([...titles].filter(([url, set]) => set.size > 1 || isIndexUrl(url)).map(([url]) => url));
}

/** The title as a venue would write it: "(World Premiere)", "(theater)", "… opens" and "— Roulette Commission" are ours. */
function linkTitles(title: string): string[] {
  const base = title.replace(/\([^()\d]*\)/g, " ").replace(/\bopens\s*$/i, " ");
  const head = base.split(/\s+[—–|]\s+/)[0]!;
  return head !== base && titleWords(head).length >= 2 ? [base, head] : [base];
}

export interface Link {
  href: string;
  text: string;
}

/** Words in a link's text that don't say which event it is: days, months, "View event". */
const LINK_FILLER =
  /^(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?s?|january|february|march|april|june|july|august|sept(?:ember)?|october|november|december|today|tonight|tomorrow|tickets?|events?|view|more|info|details|book|register|rsvp|learn|read|here|sold|waitlist)$/;

/**
 * The link says little but the title: at least half its words are the
 * title's, or it gives the whole title and then a subtitle ("Open Studio: Play
 * with Paper"). "Open Call for Artists" isn't "Open Mic", though "open" is in it.
 */
function mostlyTitle(text: string, title: string): boolean {
  const said = titleWords(text.replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, "$1$2 ")).filter((w) => !LINK_FILLER.test(w));
  const own = new Set(titleWords(title));
  if (!said.length || said.filter((w) => own.has(w)).length / said.length >= 0.5) return true;
  return linkTitles(title).some((t) => {
    const runs = plainText(t).split(/[^a-z0-9]+/).filter(Boolean);
    return runs.length >= 2 && new RegExp(`(?<![a-z0-9])${runs.join("[^a-z0-9]+")}(?![a-z0-9])`).test(text);
  });
}

/**
 * Links on a listing page to pages of the same site whose text carries the
 * event's title (80% of its words as whole words, every number in it: "Night
 * 2" isn't "Night 1", and little else), the ones that also give its date
 * first, at most `max`.
 */
export function directLinks(e: Pick<CalEvent, "event" | "date">, links: Link[], pageUrl: string, max = 3): string[] {
  let host: string;
  try {
    host = bareHost(new URL(pageUrl));
  } catch {
    return [];
  }
  const sets = linkTitles(e.event)
    .map(titleWords)
    .filter((s) => s.length);
  const title = prepare(e.event).low;
  const numbers = title.match(/\d+/g) ?? [];
  const [mon, dayStr] = e.date.trim().split(/\s+/);
  const key = dayKey(MONTHS.indexOf((mon ?? "").toLowerCase().slice(0, 3)), Number(dayStr));
  const dated: string[] = [];
  const undated: string[] = [];
  for (const l of links) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || bareHost(u) !== host) continue;
    if (/\.(?:pdf|ics|jpe?g|png|gif|webp|zip)$/i.test(u.pathname) || u.searchParams.has("format")) continue;
    const href = cleanUrl(u.toString());
    if (samePage(href, pageUrl) || isIndexUrl(href) || dated.includes(href) || undated.includes(href)) continue;
    // Card text runs a time into the title after it: "6:00 PMCard Holder".
    const text = prepare(l.text.replace(/(\d ?[AaPp]\.?[Mm]\.?)(?=[A-Z\d])/g, "$1 ")).low;
    if (!sets.some((s) => share(s, text) >= 0.8) || !mostlyTitle(text, e.event)) continue;
    const runs = new Set(text.match(/\d+/g) ?? []);
    if (!numbers.every((n) => runs.has(n))) continue;
    // Someone else's booking of the same class.
    if (text.includes("private") && !title.includes("private")) continue;
    // Card text runs together: "Wed 9 Dec6:00 PM".
    const hasDate = dateMentions(text.replace(/([a-z])(?=\d)/g, "$1 ")).some((x) => x.from <= key && key <= x.to);
    (hasDate ? dated : undated).push(href);
  }
  return [...dated, ...undated].slice(0, max);
}

// ---------------------------------------------------------------------------
// Deciding

export interface PageReadWithLinks extends PageRead {
  links?: Link[];
}

export interface Fill {
  uid: string;
  /** Set when the listing said TBD and a page states a price. */
  cost?: string;
  /** Set when the listing's link was a listing page and the event's own page shows it. */
  url?: string;
  /** The words the price was read from. */
  quote?: string;
  /** The page the price was read from. */
  page?: string;
}

export const isTbd = (cost: string) => !cost.trim() || cost.trim().toUpperCase() === "TBD";

/**
 * A page linked as the event's own, cut where it turns to other events (a
 * Squarespace page ends on the dates and titles of the sessions either side),
 * and whether the first date it gives is this event's.
 */
function ownPart(e: Pick<CalEvent, "event" | "date">, text: string, opts: PriceOpts): { text: string; dated: boolean } {
  const t = prepare(text);
  const all = dateMentions(t.low);
  const own = ownDates(t.low, e.date, opts, all);
  const to = turnAt(t, startOn(titleSpans(t.low, titleWords(e.event), e.event), own));
  const first = all.find((x) => x.at < to);
  const [mon, dayStr] = e.date.trim().split(/\s+/);
  const key = dayKey(MONTHS.indexOf((mon ?? "").toLowerCase().slice(0, 3)), Number(dayStr));
  return { text: t.raw.slice(0, to), dated: !!first && first.from <= key && key <= first.to };
}

/**
 * What to change about one upcoming listing, from the pages this run read:
 * `page` is its link, `result` what judgeListing made of it, `reads` every
 * page read for direct links. `why` says what's still missing, and why.
 */
export function planFill(
  e: CalEvent,
  ctx: {
    page?: PageReadWithLinks;
    result: ListingResult;
    listing: boolean;
    reads: Map<string, PageReadWithLinks>;
    year: number;
    daysAway: number;
    /** Fills someone undid by hand for this listing: don't look for that again. */
    declined?: { cost?: boolean; url?: boolean };
  },
): Fill & { why?: string } {
  const opts = { year: ctx.year, daysAway: ctx.daysAway };
  const links =
    ctx.listing && ctx.page?.links && e.url && !ctx.declined?.url ? directLinks(e, ctx.page.links, ctx.page.url || e.url) : [];
  // Every linked page that shows it on its date, read only up to where it turns
  // to other sessions; the one whose own date is this one's comes first.
  const shown: { url: string; page: PageReadWithLinks; dated: boolean }[] = [];
  for (const url of links) {
    const p = ctx.reads.get(url);
    if (p?.status !== 200 || judgeListing(e, p, { ...opts, sharedPage: false }) !== "ok") continue;
    const part = ownPart(e, p.text, opts);
    if (showsEvent(e, plainText(part.text), { ...opts, url: p.url })) shown.push({ url, page: p, dated: part.dated });
  }
  const own = shown.find((s) => s.dated) ?? shown[0];
  const fill: Fill = { uid: e.uid };
  if (own) fill.url = own.url;
  if (isTbd(e.cost) && !ctx.declined?.cost) {
    const tries: { page: PageReadWithLinks; ownPage: boolean; at: string }[] = [];
    if (own) tries.push({ page: own.page, ownPage: true, at: own.url });
    if (ctx.page && ctx.result === "ok") tries.push({ page: ctx.page, ownPage: !ctx.listing, at: e.url ?? "" });
    for (const tr of tries) {
      const price = findPrice(e, tr.page.text, { ...opts, ownPage: tr.ownPage });
      if (price) {
        Object.assign(fill, { cost: price.cost, quote: price.quote, page: tr.at });
        break;
      }
    }
  }
  const needPrice = isTbd(e.cost) && !fill.cost && !ctx.declined?.cost;
  if (!needPrice && (fill.url || !ctx.listing || ctx.declined?.url)) return fill;
  return { ...fill, why: missing(ctx, links, !!own, needPrice) };
}

/** A fill a run made; `replaces` is the link the event's own page took the place of. */
export interface Made {
  uid: string;
  cost?: string;
  url?: string;
  replaces?: string;
}

/** A fill someone undid by hand, with what they turned down. */
export interface Declined {
  uid: string;
  cost?: string;
  url?: string;
}

/**
 * Sort earlier runs' fills against the listings as they are now. A price back
 * at TBD, or a link back on the one it replaced, was undone by hand: that's a
 * decision, so it joins `declined` and the check doesn't make it again. The
 * rest stay on record. Only listings still in `events` are kept.
 */
export function sortFills(
  made: Made[],
  events: Pick<CalEvent, "uid" | "cost" | "url">[],
  declined: Declined[],
): { filled: Made[]; declined: Declined[] } {
  const byUid = new Map(events.map((e) => [e.uid, e]));
  const out = declined.filter((d) => byUid.has(d.uid)).map((d) => ({ ...d }));
  const record = new Map<string, Made>();
  for (const m of made) {
    if (!byUid.has(m.uid)) continue;
    const r = record.get(m.uid) ?? { uid: m.uid };
    if (m.cost) r.cost = m.cost;
    if (m.url) Object.assign(r, { url: m.url, replaces: m.replaces });
    record.set(m.uid, r);
  }
  const turnDown = (uid: string, field: "cost" | "url", value: string) => {
    let d = out.find((x) => x.uid === uid);
    if (!d) out.push((d = { uid }));
    d[field] ??= value;
  };
  for (const r of record.values()) {
    const e = byUid.get(r.uid)!;
    if (r.cost && isTbd(e.cost)) {
      turnDown(r.uid, "cost", r.cost);
      delete r.cost;
    }
    if (r.url && r.replaces && e.url === r.replaces) {
      turnDown(r.uid, "url", r.url);
      delete r.url;
      delete r.replaces;
    }
  }
  return { filled: [...record.values()].filter((r) => r.cost || r.url), declined: out };
}

function missing(
  ctx: { page?: PageReadWithLinks; result: ListingResult; listing: boolean; reads: Map<string, PageReadWithLinks> },
  links: string[],
  own: boolean,
  needPrice: boolean,
): string {
  if (!ctx.page || ctx.result === "unreachable") return "its page didn't load";
  if (ctx.result === "dead") return "its page is gone";
  if (!ctx.listing) return ctx.result === "ok" ? "its page states no price for it" : "its page doesn't show it on that date";
  if (own) return "no price on its own page or beside it on the listing page";
  const linked = !links.length
    ? "links to no page of its own"
    : links.every((u) => ctx.reads.get(u)?.status !== 200)
      ? "links to a page of its own that didn't load"
      : "links to a page of its own that doesn't show it on that date";
  if (!needPrice) return `the listing page ${linked}`;
  return ctx.result === "ok" ? `no price beside it on the listing page, which ${linked}` : `the listing page doesn't show it on that date, and ${linked}`;
}
