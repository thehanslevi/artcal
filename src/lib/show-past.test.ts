import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalEvent } from "../types";
import { buildPickIndex } from "./picks";
import { showPastFinds } from "./show-past";

// Real listings from events.json. The page carries Oct 26 on (vite.config.ts,
// built Thu Nov 12); Oct 4 is in the download "Show past" starts.
function ev(uid: string, date: string, event: string): CalEvent {
  return {
    uid,
    date,
    day: "",
    event,
    where: "Somewhere",
    venue: "Somewhere",
    neighborhood: null,
    address: null,
    cost: "TBD",
    category: "making",
    flag: null,
    mode: "make",
    start: null,
    end: null,
    note: null,
    url: null,
  };
}
const WOODCUT = ev("e_ffc2bfdb14db", "Oct 4", "Intro to Woodcut Printing with Anat Keinan");
const SCRATCH = ev("e_78d90ffb9b48", "Nov 8", "Scratch Ceramics x LESP: Screenprinting on Ceramics with Nathan Catlin");
const STOP_MOTION = ev("e_07410092f93e", "Nov 14", "Stop Motion Animation");
const HAND_BUILDING = ev("e_014a8cb9b6fa", "Nov 15", "Hand Building Course");
const HOLIDAY_CARD = ev("e_c75976663fc7", "Nov 21", "Holiday Card Workshop with Evan Bellantone");
const PAGE = [SCRATCH, STOP_MOTION, HAND_BUILDING, HOLIDAY_CARD];

const THURSDAY = new Date(2026, 10, 12);
const SUNDAY = new Date(2026, 10, 15);

/** No filters, the download not in yet, 900 events in it. */
function args(more: Partial<Parameters<typeof showPastFinds>[0]> = {}) {
  return {
    matching: [HOLIDAY_CARD],
    now: THURSDAY,
    pastLoaded: false,
    pastCount: 900,
    weekendOnly: false,
    picksOnly: false,
    picks: new Set<string>(),
    loadedIds: buildPickIndex(PAGE),
    ...more,
  };
}

test("before the download, the count of older events says there's something", () => {
  assert.equal(showPastFinds(args()), true);
  assert.equal(showPastFinds(args({ pastCount: 0 })), false);
});

test("This weekend never reaches the download, so only the page's own days count", () => {
  // Thursday: the weekend is all ahead.
  assert.equal(showPastFinds(args({ weekendOnly: true, matching: [STOP_MOTION, HAND_BUILDING] })), false);
  // Sunday: Saturday is behind, and on the page.
  assert.equal(
    showPastFinds(args({ weekendOnly: true, now: SUNDAY, matching: [STOP_MOTION, HAND_BUILDING] })),
    true,
  );
  assert.equal(showPastFinds(args({ weekendOnly: true, now: SUNDAY, matching: [HAND_BUILDING] })), false);
});

test("with Picks on, the download counts only when a pick isn't on the page", () => {
  const picksOnly = true;
  // Every pick is ahead and on the page, even one saved under its old key.
  const ahead = new Set([HOLIDAY_CARD.uid, "Nov 21|Holiday Card Workshop with Evan Bellantone"]);
  assert.equal(showPastFinds(args({ picksOnly, picks: ahead })), false);
  assert.equal(showPastFinds(args({ picksOnly, picks: new Set() })), false);
  // A pick the page doesn't have may be in the download.
  assert.equal(showPastFinds(args({ picksOnly, picks: new Set([HOLIDAY_CARD.uid, WOODCUT.uid]) })), true);
  // A pick already past and on the page.
  assert.equal(
    showPastFinds(args({ picksOnly, picks: new Set([SCRATCH.uid]), matching: [SCRATCH] })),
    true,
  );
});

test("once the download is in, only what's loaded counts", () => {
  assert.equal(showPastFinds(args({ pastLoaded: true })), false);
  assert.equal(showPastFinds(args({ pastLoaded: true, matching: [WOODCUT, HOLIDAY_CARD] })), true);
  assert.equal(showPastFinds(args({ pastLoaded: true, matching: [SCRATCH] })), true);
});
