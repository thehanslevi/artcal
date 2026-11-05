import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVenue, stripVenuePrefix } from "./venue";

// parseVenue splits a scraped "where" into venue / neighborhood / address;
// stripVenuePrefix removes a redundant venue prefix from a title. Both must be
// conservative — over-stripping mangles real titles.

test("parseVenue splits a comma-separated where", () => {
  const p = parseVenue("Brooklyn Art Haus, 25 Marcy Ave, Williamsburg");
  assert.equal(p.venue, "Brooklyn Art Haus");
  assert.equal(p.neighborhood, "Williamsburg");
  assert.match(p.address ?? "", /25 Marcy Ave/);
});

test("parseVenue strips postal cruft down to a clean where", () => {
  const p = parseVenue(
    "UnionDocs, 352 Onderdonk Avenue, Ridgewood, NY, 11385, United States",
  );
  assert.equal(p.venue, "UnionDocs");
  assert.doesNotMatch(p.where, /11385|United States/);
});

test("parseVenue handles a middot separator", () => {
  const p = parseVenue("Pioneer Works · Red Hook");
  assert.equal(p.venue, "Pioneer Works");
  assert.equal(p.neighborhood, "Red Hook");
});

test("stripVenuePrefix removes a redundant 'Venue: ' prefix", () => {
  assert.equal(
    stripVenuePrefix("Mono No Aware: Optical Printing", "Mono No Aware"),
    "Optical Printing",
  );
});

test("stripVenuePrefix leaves a title whose colon is not the venue", () => {
  // "Riso 101" is not the venue — the colon is part of the title.
  assert.equal(
    stripVenuePrefix("Riso 101: Two-Colour Posters", "Secret Riso Club"),
    "Riso 101: Two-Colour Posters",
  );
});

test("stripVenuePrefix matches across a leading 'The'", () => {
  assert.equal(stripVenuePrefix("Tank: Late Night", "The Tank"), "Late Night");
});

test("stripVenuePrefix keeps the original when the remainder is too short", () => {
  // A remainder under 3 chars is treated as not-a-real-title and left intact,
  // rather than emitting a stub.
  assert.equal(stripVenuePrefix("The Tank: Hi", "The Tank"), "The Tank: Hi");
});

test("stripVenuePrefix drops a possessive venue", () => {
  assert.equal(
    stripVenuePrefix("Wonderville's 2nd Annual Alt.Ctrl Festival", "Wonderville"),
    "2nd Annual Alt.Ctrl Festival",
  );
  assert.equal(stripVenuePrefix("The Tank’s Annual Gala", "The Tank"), "Annual Gala");
  assert.equal(stripVenuePrefix("The Tank's Gala", "The Tank"), "Gala");
  // Too little left to stand as a title.
  assert.equal(stripVenuePrefix("The Tank's 10", "The Tank"), "The Tank's 10");
  // Someone else's possessive isn't the venue's.
  assert.equal(stripVenuePrefix("Fay Victor's Black Sonic Space", "FourOneOne"), "Fay Victor's Black Sonic Space");
});

test("stripVenuePrefix leaves a connector-led remainder alone", () => {
  // "Film Forum Presents X" must not become "Presents X".
  assert.equal(
    stripVenuePrefix("Film Forum Presents White Nights", "Film Forum"),
    "Film Forum Presents White Nights",
  );
});
