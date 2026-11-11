// Does a page actually list this event? Shared by the scan's gate (before an
// event goes in) and by scripts/check-events.ts (every listing, every week).
//
// The Nov 10 review found 36 upcoming listings that no venue page carried: links
// the model invented, a festival that ran in April, private one-person classes,
// concerts at other venues. The scan's old test was "half the title's words
// and the date appear somewhere in the HTML", which a darkroom's homepage
// passes for "Darkroom Orientation" on any date it happens to mention. The test
// here is that the title and the date appear together, as a listing would show
// them.
import type { CalEvent } from "../../src/types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** How close the title and the date must sit to read as one listing. */
export const NEAR = 600;

export function plainText(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;|&#x27;|&#39;/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function titleWords(title: string): string[] {
  return plainText(title).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
}

/** Every place the event's date is written, in the ways venues write it. */
export function datePositions(text: string, date: string, year: number, daysAway = -1): number[] {
  const [mon, dayStr] = date.trim().split(/\s+/);
  const mi = MONTHS.indexOf((mon ?? "").toLowerCase().slice(0, 3));
  const d = Number(dayStr);
  if (mi < 0 || !d) return [];
  const mm = String(mi + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  const forms = [
    `${MONTHS[mi]}[a-z]*\\.?,? 0?${d}(?!\\d)`,
    `(?<!\\d)0?${d}(?:st|nd|rd|th)? (?:of )?${MONTHS[mi]}`,
    `(?<![\\d/])0?${mi + 1}/0?${d}(?![\\d])`,
    `${year}-${mm}-${dd}`,
    `${FULL[mi]} 0?${d}(?!\\d)`,
  ];
  // Ticket sites say "today" and "tomorrow" for what's that close.
  if (daysAway === 0) forms.push("\\b(?:today|tonight)\\b");
  if (daysAway === 1) forms.push("\\btomorrow\\b");
  // A month grid ("November 2026 … 19 20 pasta body 6:00 pm") writes only the
  // day number, under a heading that names the month.
  if (new RegExp(`${FULL[mi]},? ${year}`).test(text)) forms.push(`(?<![\\d:/.$-])${d}(?= [a-z])`);
  const out: number[] = [];
  for (const f of forms) for (const m of text.matchAll(new RegExp(f, "g"))) out.push(m.index ?? 0);
  return out;
}

/** "/events/2026/11/10/…": a page address that carries the date itself. */
function urlHasDate(url: string, date: string, year: number): boolean {
  const [mon, dayStr] = date.trim().split(/\s+/);
  const mi = MONTHS.indexOf((mon ?? "").toLowerCase().slice(0, 3));
  const d = Number(dayStr);
  return mi >= 0 && new RegExp(`/${year}/0?${mi + 1}/0?${d}(?:/|$)`).test(url);
}

/** Share of the title's words found in this stretch of text. */
function titleShare(words: string[], text: string): number {
  if (!words.length) return 1;
  return words.filter((w) => text.includes(w)).length / words.length;
}

export type ListingResult = "ok" | "dead" | "unconfirmed" | "unreachable" | "too-early";

export interface PageRead {
  /** HTTP status; 0 when nothing answered. */
  status: number;
  /** Visible text (or HTML; it's flattened either way). */
  text: string;
  /** Where the page ended up, after redirects. */
  url?: string;
}

/**
 * - ok: the title and the date sit together on the page.
 * - dead: the page is gone (404/410).
 * - unconfirmed: the page loads but doesn't list this event on this date.
 * - unreachable: blocked, timed out, server error. Says nothing about the event.
 * - too-early: a shared listing page that doesn't reach this far ahead yet
 *   (a month calendar showing November can't confirm a January class).
 */
export function judgeListing(
  e: Pick<CalEvent, "event" | "date">,
  page: PageRead,
  opts: { year: number; daysAway: number; sharedPage: boolean },
): ListingResult {
  if (page.status === 404 || page.status === 410) return "dead";
  if (page.status === 0 || page.status >= 500 || page.status === 403 || page.status === 429) {
    return "unreachable";
  }
  const text = plainText(page.text);
  if (text.length < 200) return "unreachable";
  if (/page (?:not|can.?t be) found|we couldn.?t find the page|nothing (?:was )?found|404 error/.test(text.slice(0, 600))) {
    return "dead";
  }
  const words = titleWords(e.event);
  // An event page whose own address carries the date, and that names the event.
  if (page.url && urlHasDate(page.url, e.date, opts.year) && titleShare(words, text) >= 0.8) return "ok";
  for (const at of datePositions(text, e.date, opts.year, opts.daysAway)) {
    const near = text.slice(Math.max(0, at - NEAR), at + NEAR);
    if (titleShare(words, near) >= 0.6) return "ok";
  }
  if (opts.sharedPage && opts.daysAway > 21) return "too-early";
  return "unconfirmed";
}
