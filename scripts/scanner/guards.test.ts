import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalEvent, EventsData } from "../../src/types.ts";
import { atOtherVenue } from "./extract-jsonld.ts";
import { groundUrl } from "./extract.ts";
import { makeGateRunner } from "./gates.ts";

const PAGE = "https://brooklynpoets.org/workshops/all";

test("a model's link survives only if it's a link on the page it read", () => {
  const html = `<a href="/workshop/p/han-poetics">Han Poetics</a><a href="https://www.brooklynpoets.org/workshop/p/clean-lines/">x</a>`;
  assert.equal(groundUrl("https://brooklynpoets.org/workshop/p/han-poetics", html, PAGE), "https://brooklynpoets.org/workshop/p/han-poetics");
  assert.equal(groundUrl("https://brooklynpoets.org/workshop/p/clean-lines", html, PAGE), "https://brooklynpoets.org/workshop/p/clean-lines");
  // Invented: the real 404 that started this.
  assert.equal(groundUrl("https://brooklynpoets.org/workshops/art-fall26", html, PAGE), PAGE);
  assert.equal(groundUrl(null, html, PAGE), PAGE);
  assert.equal(groundUrl(PAGE + "/", html, PAGE), PAGE + "/");
});

test("an aggregator's event at a different venue isn't ours", () => {
  const lamama = { url: "https://www.lamama.org/whats-on", altSources: [{ url: "https://donyc.com/venues/la-mama-etc" }] };
  assert.equal(atOtherVenue({ "@id": "https://donyc.com/venues/palladium-times-square#place" }, lamama), true);
  assert.equal(atOtherVenue({ "@id": "https://donyc.com/venues/la-mama-etc#place" }, lamama), false);
  assert.equal(atOtherVenue({ name: "Ellen Stewart Theatre" }, lamama), false);
  assert.equal(atOtherVenue({ "@id": "https://donyc.com/venues/kings-theatre#place" }, { url: "https://example.org/" }), false);
});

const ev = (o: Partial<CalEvent>): CalEvent => ({
  day: "Thu", date: "Dec 17", event: "Darkroom Orientation", where: "Bushwick Community Darkroom, Bushwick",
  cost: "TBD", category: "making", flag: null, mode: "make", start: "19:00", end: null, note: null,
  url: "https://www.bushwickcommunitydarkroom.com/events", uid: "e_x", venue: "Bushwick Community Darkroom", ...o,
});

test("an event a person removed doesn't come back", () => {
  const empty = { weeks: [] } as unknown as EventsData;
  const html = "Darkroom Orientation Dec 17 7pm";
  const gate = makeGateRunner(empty, "2026-11-10", 2026, [{ ...ev({}), why: "not on the site" } as CalEvent]);
  const r = gate({ event: ev({ uid: undefined as unknown as string }), venue: {} as never, sourceHtml: html, source: "llm" });
  assert.equal(r.pass, false);
  assert.match(r.reason ?? "", /removed by a person: not on the site/);
  const other = gate({ event: ev({ date: "Dec 18", day: "Fri" }), venue: {} as never, sourceHtml: "Darkroom Orientation Dec 18", source: "llm" });
  assert.equal(other.pass, true);
});

test("children's and teens' programmes stay off", () => {
  const gate = makeGateRunner({ weeks: [] } as unknown as EventsData, "2026-11-10", 2026);
  for (const t of ["Mozart for Munchkins: Gratitude through Music", "Socrateens Fall/Winter – final day", "Printmaking for Teens"]) {
    const r = gate({ event: ev({ event: t }), venue: {} as never, sourceHtml: t + " Dec 17", source: "llm" });
    assert.equal(r.reason, "children's programming", t);
  }
});
