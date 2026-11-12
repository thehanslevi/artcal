import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDaysUntil, listingTimes, saysMidnight } from "./dates";

test("a countdown is words, singular at one", () => {
  const cases: [number, string][] = [
    [0, "today"],
    [1, "tomorrow"],
    [2, "in 2 days"],
    [6, "in 6 days"],
    [7, "in 1 week"],
    [10, "in 1 week"],
    [14, "in 2 weeks"],
    [29, "in 4 weeks"],
    [30, "in 1 month"],
    [45, "in 2 months"],
    [90, "in 3 months"],
    [-1, "yesterday"],
    [-2, "2 days ago"],
    [-6, "6 days ago"],
    [-7, "1 week ago"],
    [-21, "3 weeks ago"],
    [-29, "4 weeks ago"],
    [-30, "past"],
  ];
  for (const [days, want] of cases) assert.equal(formatDaysUntil(days), want, `${days} days`);
});

test("no countdown abbreviates, so none reads wrong in capitals", () => {
  for (let days = -60; days <= 400; days++) {
    assert.doesNotMatch(formatDaysUntil(days), /\d\s?(d|w|mo)\b/, `${days} days`);
  }
});

test("a listing at 00:00 that doesn't say midnight has no time", () => {
  assert.deepEqual(listingTimes("00:00", null, "Stop Motion Animation"), { start: null, end: null });
  // All day: The Events Calendar writes 00:00 to 23:59.
  assert.deepEqual(listingTimes("00:00", "23:59", "Made in Clay Holiday Sale"), { start: null, end: null });
});

test("a listing that says midnight keeps it", () => {
  assert.deepEqual(listingTimes("00:00", "02:00", "Midnight Movie: Eraserhead"), { start: "00:00", end: "02:00" });
  assert.deepEqual(listingTimes("00:00", null, "Late-Night Life Drawing"), { start: "00:00", end: null });
});

test("any other time passes through", () => {
  assert.deepEqual(listingTimes("19:00", "21:00", "Open Studio"), { start: "19:00", end: "21:00" });
  assert.deepEqual(listingTimes(null, null, "Open Studio"), { start: null, end: null });
});

test("saysMidnight reads the ways a listing says it", () => {
  for (const s of ["Midnight Movie", "late night jazz", "Late-Night Drawing", "doors 12am", "Doors at 12 a.m.", "12:00 AM set"]) {
    assert.equal(saysMidnight(s), true, s);
  }
  for (const s of ["Evening Celebration", "12 Amazing Prints", "112am", "Midnights of Summer"]) {
    assert.equal(saysMidnight(s), false, s);
  }
  assert.equal(saysMidnight(null, undefined, "Open Studio", "starts at midnight"), true);
});
