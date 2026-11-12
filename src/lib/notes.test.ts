import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicNote } from "./notes.ts";

test("plain facts about the event are shown", () => {
  for (const n of [
    "Runs Nov 12–14.",
    "Two new works for modular synthesizer and chamber ensemble.",
    "Runs Nov 19–21. Cunningham's RainForest in two parts, with new dances.",
    "Runs Nov 24–Jan 10. By Nicole Taylor, directed by John Tiffany.",
    "Relief printing, collage, and embossing.",
    "RSVP at bklynlibrary.org.",
    "Leads into Roulette",
  ]) assert.equal(isPublicNote(n), true, n);
});

test("notes-to-self, venue blurbs and pointers stay off the page", () => {
  for (const n of [
    "Tickets bought.",
    "Tickets bought. Lynch sound collaborator. Live to picture.",
    "Same night as Mono No Aware; pick one.",
    "Boo! Haha, gotcha! It's spooky season and XSW is back to go bump in the night, with some frights and fights!",
    "PILLARS POLE DANCE COMPANY welcomes you to BLOODBATH",
    "Part of a 6-week series. See URL for full details.",
    "Landmark 50th-anniversary concert version.",
    "Join us for a night of music",
    "Is this the right date?",
    "x".repeat(120),
    "",
    null,
  ]) assert.equal(isPublicNote(n), false, String(n));
});
