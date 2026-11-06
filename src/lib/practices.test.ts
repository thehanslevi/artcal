import { test } from "node:test";
import assert from "node:assert/strict";
import type { Practice } from "../types/practice";
import { formatLastChecked, isStale, lastCheckedOn } from "./practices";

const ROW = { id: "test-clay", verifiedOn: "2026-07-06" } as Practice;
const NOW = new Date(2026, 10, 5); // Nov 5, 2026: 122 days after Jul 6

test("with no scrape on record, a row is as fresh as its last human check", () => {
  assert.equal(lastCheckedOn(ROW, {}), "2026-07-06");
  assert.equal(isStale(ROW, NOW, {}), true);
  assert.equal(formatLastChecked(ROW, NOW, {}), "Last checked Jul 6");
});

test("a passed scrape counts as a check", () => {
  const checks = { "test-clay": { ok: "2026-11-05", last: "2026-11-05", result: "ok" as const } };
  assert.equal(lastCheckedOn(ROW, checks), "2026-11-05");
  assert.equal(isStale(ROW, NOW, checks), false);
});

test("a failed scrape doesn't, but it keeps the date of the last one that passed", () => {
  const never = { "test-clay": { last: "2026-11-05", result: "price-not-found" as const } };
  assert.equal(lastCheckedOn(ROW, never), "2026-07-06");
  assert.equal(isStale(ROW, NOW, never), true);
  const earlier = { "test-clay": { ok: "2026-10-29", last: "2026-11-05", result: "unreachable" as const } };
  assert.equal(lastCheckedOn(ROW, earlier), "2026-10-29");
  assert.equal(isStale(ROW, NOW, earlier), false);
});

test("a person's check still wins when it's the newer one", () => {
  const fresh = { ...ROW, verifiedOn: "2026-11-05" } as Practice;
  const checks = { "test-clay": { ok: "2026-10-29", last: "2026-10-29", result: "ok" as const } };
  assert.equal(lastCheckedOn(fresh, checks), "2026-11-05");
});

test("the year appears once it isn't this one", () => {
  assert.equal(formatLastChecked(ROW, new Date(2027, 0, 10), {}), "Last checked Jul 6, 2026");
});
