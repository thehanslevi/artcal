import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeListing } from "./listing-check.ts";

const opts = { year: 2026, daysAway: 5, sharedPage: false };
const page = (text: string, status = 200) => ({ status, text: text + " menu about contact donate".repeat(10) });

test("title and date together on the page: confirmed", () => {
  const shoe = "Thu 12 Nov / 6:00 PM – 8:00 PM / 2-hour Introduction to Shoe Making / Sat 14 Nov / 10:00 AM";
  assert.equal(judgeListing({ event: "Introduction to Shoe Making", date: "Nov 12" }, page(shoe), opts), "ok");
  assert.equal(judgeListing({ event: "Ceramic Candelabras!", date: "Dec 11" }, page("December 11, 2026 7:00 PM Ceramic Candelabras!"), opts), "ok");
  assert.equal(judgeListing({ event: "Qasim Naqvi", date: "Nov 18" }, page("Wed 11/18 8pm — Qasim Naqvi, Roulette Commission"), opts), "ok");
});

test("a dead page or a 'not found' page is dead", () => {
  assert.equal(judgeListing({ event: "Earth", date: "Nov 20" }, page("", 404), opts), "dead");
  assert.equal(judgeListing({ event: "Earth", date: "Nov 20" }, page("Page not found. Nothing found for the requested page."), opts), "dead");
});

test("title and date both on the page but apart: not a listing", () => {
  // The darkroom's homepage mentions orientations, and elsewhere a date.
  const home = "Darkroom orientation is required for members. " + "x ".repeat(800) + "Open house Dec 17";
  assert.equal(judgeListing({ event: "Darkroom Orientation", date: "Dec 17" }, page(home), opts), "unconfirmed");
});

test("a festival page that names other dates doesn't confirm this one", () => {
  const moves = "La MaMa Moves! Dance Festival. The 21st annual dance festival begins April 9 – May 10, 2026";
  assert.equal(judgeListing({ event: "Moves! Dance Festival", date: "Dec 13" }, page(moves), opts), "unconfirmed");
});

test("blocked or empty says nothing about the event", () => {
  assert.equal(judgeListing({ event: "Novel Writing III", date: "Dec 6" }, page("", 403), opts), "unreachable");
  assert.equal(judgeListing({ event: "Novel Writing III", date: "Dec 6" }, { status: 200, text: "Loading…" }, opts), "unreachable");
});

test("a month calendar can't vouch for an event weeks out", () => {
  const nov = "November 2026 · Nov 22 12:00 PM Screen Printing";
  assert.equal(
    judgeListing({ event: "Ceramic Slumber Party", date: "Dec 10" }, page(nov), { year: 2026, daysAway: 30, sharedPage: true }),
    "too-early",
  );
  assert.equal(
    judgeListing({ event: "Ceramic Slumber Party", date: "Dec 10" }, page(nov), { year: 2026, daysAway: 10, sharedPage: true }),
    "unconfirmed",
  );
});

test("venues' other ways of writing a date", () => {
  const grid = "November 2026 Sun Mon Tue 16 17 ceramic sampler at heart of gold 8:00 pm – 9:30 pm 18 19 20 pasta body 6:00 pm – 9:30 pm 21 22";
  assert.equal(judgeListing({ event: "Pasta Body", date: "Nov 20" }, page(grid), opts), "ok");
  assert.equal(judgeListing({ event: "Pasta Body", date: "Nov 21" }, page(grid), opts), "unconfirmed");
  const donyc = { status: 200, url: "https://donyc.com/events/2026/11/10/michelle-collins-in-big-letters-tour-tickets", text: "Michelle Collins: In Big Letters Tour today | 9:30 pm Joe's Pub" + " menu about contact".repeat(12) };
  assert.equal(judgeListing({ event: "Michelle Collins: In Big Letters Tour", date: "Nov 10" }, donyc, opts), "ok");
  const tomorrow = "Bailen: Swim!!! At Your Own Risk Tour tomorrow | 7:30 pm National Sawdust";
  assert.equal(judgeListing({ event: "BAILEN: SWIM!!! At Your Own Risk Tour", date: "Nov 11" }, page(tomorrow), { ...opts, daysAway: 1 }), "ok");
  assert.equal(judgeListing({ event: "BAILEN: SWIM!!! At Your Own Risk Tour", date: "Nov 11" }, page(tomorrow), { ...opts, daysAway: 9 }), "unconfirmed");
});

test("a title word inside a longer word isn't the title", () => {
  assert.equal(judgeListing({ event: "Open Mic", date: "Nov 20" }, page("Fri 11/20 7pm — Opening Reception: Winter Group Show"), opts), "unconfirmed");
  assert.equal(judgeListing({ event: "Isla", date: "Nov 20" }, page("Fri 11/20 8pm — Island Ceramics Pop-Up"), opts), "unconfirmed");
  // A plural, or two of its words run together, still count.
  assert.equal(judgeListing({ event: "Open Studio", date: "Nov 20" }, page("Fri 11/20 6pm — Open Studios"), opts), "ok");
  // worksinprogressnyc.org writes "Silk Screen" as "Silkscreen".
  const wip = "Introduction to Silkscreen\n$150.00\n\nWe supply basic tees and totes.\n\nDate:\nSeptember 26\nOctober 17\nNovember 14";
  assert.equal(judgeListing({ event: "Introduction to Silk Screen", date: "Nov 14" }, page(wip), opts), "ok");
});
