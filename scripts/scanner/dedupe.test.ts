import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalEvent } from "../../src/types.ts";
import { canonicalDate, canonicalUrl, isLikelyDuplicate } from "./dedupe.ts";

// Regression: one Soul Summit concert at The Shed landed on the calendar FIVE
// times — scraped with four different titles, the date written both "Aug 7" and
// "Aug 07", and the venue as "The Shed" / "The Shed Outdoor Plaza". Dedup bailed
// on the raw date-string mismatch and never saw the shared event URL. These pin
// the fix and, just as importantly, that it does NOT over-merge a venue's
// distinct same-day classes.

function ev(p: Partial<CalEvent>): CalEvent {
  return {
    day: "Fri", date: "Aug 7", event: "", where: "", cost: "FREE",
    category: "sound", mode: "witness", uid: "e_x", ...p,
  } as CalEvent;
}

test("canonicalDate collapses 'Aug 07' and 'Aug 7' to one key", () => {
  assert.equal(canonicalDate("Aug 07"), canonicalDate("Aug 7"));
  assert.equal(canonicalDate("Aug 07"), "aug 7");
});

test("canonicalUrl keeps a specific event path", () => {
  assert.equal(
    canonicalUrl("https://www.theshed.org/program/522-latinx-freedom"),
    "theshed.org/program/522-latinx-freedom",
  );
});

test("canonicalUrl returns '' for a bare domain or tracking redirect", () => {
  // A newsletter's click.tracker.org/?qs=… links differ only by opaque query;
  // treating them as an event id would merge every event in the newsletter.
  assert.equal(canonicalUrl("https://click.92yemail.org/?qs=AB12"), "");
  assert.equal(canonicalUrl("https://example.org"), "");
});

const SHED = "https://www.theshed.org/program/522-latinx-freedom";

test("the same Shed concert, scraped four ways, is one event", () => {
  const a = ev({ date: "Aug 7", start: "17:00", event: "Summer Fridays w/ Soul Summit – Aug 7", where: "The Shed Outdoor Plaza (New York, NY)", url: SHED });
  const b = ev({ date: "Aug 07", start: "17:00", event: "Soul Summit – Latinx Freedom (DJ collective)", where: "The Shed", url: SHED });
  assert.equal(isLikelyDuplicate(a, b), true);
});

test("a shared SERIES url across different days stays separate", () => {
  const jul = ev({ date: "Jul 24", start: "17:00", event: "Summer Fridays w/ Soul Summit – July 24", where: "The Shed", url: SHED });
  const aug = ev({ date: "Aug 7", start: "17:00", event: "Summer Fridays w/ Soul Summit – Aug 7", where: "The Shed", url: SHED });
  assert.equal(isLikelyDuplicate(jul, aug), false);
});

const MONO = "http://mononoawarefilm.com/community-workshops";

test("distinct same-day classes on ONE listing url do NOT merge (start time differs)", () => {
  const nine = ev({ date: "Sep 19", start: "09:00", event: "Bolex Rex5 (extended day, S3 of 5)", where: "Downtown Brooklyn", url: MONO, category: "film", mode: "make" });
  const ten = ev({ date: "Sep 19", start: "10:00", event: "Intro to 16MM Macro Cinematography", where: "Downtown Brooklyn", url: MONO, category: "film", mode: "make" });
  assert.equal(isLikelyDuplicate(nine, ten), false);
});

test("two unrelated classes at the same time on one listing url do NOT merge", () => {
  // Same place, same start, same url, but no shared title words → different.
  const a = ev({ date: "Sep 19", start: "18:00", event: "Wheel Throwing", where: "Studio", url: MONO, mode: "make" });
  const b = ev({ date: "Sep 19", start: "18:00", event: "Handbuilding Basics", where: "Studio", url: MONO, mode: "make" });
  assert.equal(isLikelyDuplicate(a, b), false);
});
