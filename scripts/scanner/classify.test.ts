import { test } from "node:test";
import assert from "node:assert/strict";
import { categorySignal } from "../../src/lib/mode-signals";
import { classifyEvent } from "./classify";

// UnionDocs' real feed, 2026-11-05: five "Screenings & Events" to one
// "Workshops & Labs", and no title that says which is which.
test("a venue's own category files its workshops as make", () => {
  assert.equal(
    classifyEvent("Camera Ministry: Lens-based Encounters", "witness", "film", "Workshops & Labs").mode,
    "make",
  );
  assert.equal(
    classifyEvent("A Radical Thread", "witness", "film", "Screenings & Events").mode,
    "witness",
  );
});

test("the category also corrects a default that's wrong the other way", () => {
  assert.equal(classifyEvent("Hospital", "make", "film", "Screenings & Events").mode, "witness");
});

test("a decisive title still wins, so a label never contradicts its title", () => {
  assert.equal(
    classifyEvent("Opening Panel: New York In Transition", "make", "film", "Workshops & Labs").mode,
    "witness",
  );
  assert.equal(
    classifyEvent("16mm Workshop", "witness", "film", "Screenings & Events").mode,
    "make",
  );
});

test("no category, or one that says nothing, leaves the venue default", () => {
  assert.equal(classifyEvent("People Movers", "witness", "community").mode, "witness");
  assert.equal(classifyEvent("People Movers", "make", "community", "Homepage Events").mode, "make");
  assert.equal(categorySignal("Flux IV,Homepage Events"), "none");
  // Both kinds at once is no answer.
  assert.equal(categorySignal("Workshops,Screenings"), "both");
  assert.equal(classifyEvent("People Movers", "make", "film", "Workshops,Screenings").mode, "make");
});

test("category words are whole words", () => {
  // "Classical" is not a class, "Collaborations" is not a lab.
  assert.equal(categorySignal("Classical Music"), "none");
  assert.equal(categorySignal("Collaborations"), "none");
});
