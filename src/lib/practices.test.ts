import { test } from "node:test";
import assert from "node:assert/strict";
import type { Practice, Schedule, Weekday } from "../types/practice";
import {
  PRACTICES,
  formatLastChecked,
  formatSchedule,
  isStale,
  lastCheckedOn,
} from "./practices";

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

// Every time string in practices.json today, on the days it runs there.
test("the Directory writes days and times the way the calendar does", () => {
  const cases: [Schedule, string][] = [
    [{ kind: "weekly", days: ["mon"], time: "19:00-22:00" }, "Mon, 7–10pm"],
    [{ kind: "weekly", days: ["tue"], time: "19:00-21:00" }, "Tue, 7–9pm"],
    [{ kind: "weekly", days: ["mon"], time: "18:00-20:00" }, "Mon, 6–8pm"],
    [{ kind: "weekly", days: ["mon"], time: "15:00-17:00" }, "Mon, 3–5pm"],
    [{ kind: "weekly", days: ["tue", "wed", "thu", "fri", "sat"], time: "12:00-20:00" }, "Tue–Sat, 12–8pm"],
    [{ kind: "weekly", days: ["mon", "thu"], time: "18:30" }, "Mon/Thu, 6:30pm"],
    [{ kind: "weekly", days: ["mon", "wed", "fri"], time: "19:40-21:00" }, "Mon/Wed/Fri, 7:40–9pm"],
    [{ kind: "weekly", days: ["fri", "sat"], time: "Fri 15:00, Sat 12:00" }, "Fri 3pm, Sat 12pm"],
    [{ kind: "weekly", days: ["mon", "tue", "wed", "thu", "fri"], time: "evenings" }, "Weeknights"],
    [{ kind: "weekly", days: ["mon", "tue", "wed", "thu", "fri", "sat"], time: "varies" }, "Mon–Sat, varies"],
    [{ kind: "monthly-nth", nth: 2, day: "sun", time: "12:00-18:00" }, "second Suns, 12–6pm"],
    [{ kind: "monthly-nth", nth: 2, day: "sun", time: "14:00-17:00" }, "second Suns, 2–5pm"],
  ];
  for (const [s, want] of cases) assert.equal(formatSchedule(s), want);
});

test("day sets read as ranges, weekdays and weekends", () => {
  const weekly = (days: Weekday[], time?: string) => formatSchedule({ kind: "weekly", days, time });
  assert.equal(weekly(["mon", "tue", "wed", "thu", "fri"]), "Weekdays");
  assert.equal(weekly(["mon", "tue", "wed", "thu", "fri"], "18:00-21:00"), "Weekdays, 6–9pm");
  assert.equal(weekly(["sun", "sat"]), "Weekends");
  assert.equal(weekly(["thu", "mon"]), "Mon/Thu");
  assert.equal(weekly(["fri", "sat"]), "Fri/Sat");
  assert.equal(weekly(["mon", "tue", "wed", "fri"]), "Mon–Wed/Fri");
});

test("times on either side of noon and midnight", () => {
  const at = (time: string) => formatSchedule({ kind: "weekly", days: ["sat"], time });
  assert.equal(at("10:00-14:00"), "Sat, 10am–2pm");
  assert.equal(at("12:00"), "Sat, 12pm");
  assert.equal(at("00:00"), "Sat, 12am");
  assert.equal(at("11:30-12:30"), "Sat, 11:30am–12:30pm");
  assert.equal(at("9:00-11:00"), "Sat, 9–11am");
});

test("no schedule in the Directory is left in 24-hour time", () => {
  for (const p of PRACTICES) {
    const out = formatSchedule(p.schedule);
    assert.doesNotMatch(out, /\b(?:0\d|1[3-9]|2[0-3]):\d{2}\b/, `${p.id}: ${out}`);
    assert.doesNotMatch(out, /\d:\d{2}\s*-\s*\d/, `${p.id}: ${out}`);
  }
});
