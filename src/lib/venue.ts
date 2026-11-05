// Normalizing event titles and venue strings.
//
// Both arrived from scrapes in whatever shape the source page used, which left
// the calendar hard to scan and dedupe fragile:
//   - 66% of titles carried a "Venue: " prefix, 34% didn't, and 13 venues used
//     both conventions, so sorting by title grouped by venue instead of event.
//   - `where` ranged from "Governors Island" to "UnionDocs, 352 Onderdonk
//     Avenue, 352 Onderdonk Avenue, Ridgewood, NY, 11385, United States".
//
// The UI already shows the venue separately, so the prefix was pure noise.

/** Dropped from venue strings: they identify a country, not a place to go. */
const NOISE = new Set([
  "ny", "n.y.", "new york", "new york city", "nyc", "usa", "us",
  "united states", "united states of america",
]);

const STREET =
  /\b(st|st\.|street|ave|ave\.|avenue|blvd|boulevard|rd|rd\.|road|pl|pl\.|place|ln|lane|dr|drive|pkwy|parkway|ct|court|floor|fl\.|suite|ste|apt|unit|#)\b/i;

/** NYC neighborhoods seen in the data, so they aren't mistaken for addresses. */
const HOODS = new Set([
  "bed-stuy", "bedford-stuyvesant", "bushwick", "crown heights", "gowanus",
  "greenpoint", "park slope", "prospect heights", "red hook", "ridgewood",
  "williamsburg", "clinton hill", "fort greene", "windsor terrace",
  "sunset park", "navy yard", "dumbo", "boerum hill", "carroll gardens",
  "south slope", "long island city", "astoria", "corona", "flatiron",
  "lower east side", "east village", "west village", "soho", "noho", "tribeca",
  "midtown", "midtown west", "murray hill", "harlem", "east harlem",
  "washington heights", "hamilton heights", "chelsea", "west farms",
  "governors island", "snug harbor", "downtown brooklyn", "hell's kitchen",
  "brooklyn army terminal", "industry city", "prospect lefferts gardens",
]);

function isZip(s: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(s.trim());
}

/**
 * Trailing postal cruft that arrives glued together rather than as its own
 * comma segment, e.g. "NY 11233 USA" or "New York, NY 10012".
 */
function stripPostal(s: string): string {
  return s
    .replace(/\b(new york|ny)\s*,?\s*\d{5}(-\d{4})?\s*,?\s*(usa|us|united states)?\s*$/i, "")
    .replace(/\b\d{5}(-\d{4})?\s*,?\s*(usa|us|united states)?\s*$/i, "")
    .replace(/\b(usa|united states)\s*$/i, "")
    .replace(/[\s,]+$/, "")
    .trim();
}

function isAddress(s: string): boolean {
  const t = s.trim();
  if (HOODS.has(t.toLowerCase())) return false;
  return /^\d+\s/.test(t) || STREET.test(t) || isZip(t);
}

/**
 * Some scrapes capture a street address where the venue name should be, so the
 * calendar reads "334 Himrod St" instead of "Bushwick Community Darkroom".
 * Recovered by matching the address; the venue is confirmed by the event URL.
 */
const ADDRESS_ALIASES: [RegExp, string][] = [
  [/^334 Himrod/i, "Bushwick Community Darkroom"],
  [/^314 7th St/i, "Interference Archive"],
  [/^2113 Amsterdam/i, "Word Up Books"],
];

export interface VenueParts {
  /** Canonical short name, e.g. "Brooklyn Art Haus". */
  venue: string;
  /** Neighborhood when identifiable, e.g. "Williamsburg". */
  neighborhood: string | null;
  /** Street address when present, kept out of the display string. */
  address: string | null;
  /** What the UI shows: "Venue, Neighborhood" or just the venue. */
  where: string;
}

/**
 * Split a free-text venue string into its parts. The first segment is the
 * venue; the rest are sorted into address, neighborhood, or dropped as noise.
 */
export function parseVenue(raw: string): VenueParts {
  // Scrapes separate venue from address with a comma, a middot, or a dash
  // depending on the source page. 49 rows use "·" and would otherwise keep the
  // street address glued to the venue name.
  const segments = raw
    .split(/[,·]|\s[—–]\s/)
    .map((s) => stripPostal(s.replace(/\s+/g, " ").trim()))
    .filter(Boolean)
    .filter((s) => !NOISE.has(s.toLowerCase()));

  if (segments.length === 0) {
    return { venue: raw.trim(), neighborhood: null, address: null, where: raw.trim() };
  }

  let venue = segments[0]!;
  let rest = segments.slice(1);

  const alias = ADDRESS_ALIASES.find(([re]) => re.test(venue));
  if (alias) {
    // The captured address becomes the address; the real name becomes the venue.
    rest = [venue, ...rest];
    venue = alias[1];
  }

  const addressParts: string[] = [];
  const hoodParts: string[] = [];
  for (const s of rest) {
    // Scrapes repeat the street line; keep one.
    if (addressParts.includes(s) || hoodParts.includes(s)) continue;
    if (isAddress(s)) addressParts.push(s);
    else hoodParts.push(s);
  }

  // Prefer a known neighborhood when several candidates survive.
  const known = hoodParts.find((h) => HOODS.has(h.toLowerCase()));
  const neighborhood = known ?? hoodParts[0] ?? null;
  const address = addressParts.length ? addressParts.join(", ") : null;

  return {
    venue,
    neighborhood,
    address,
    where: neighborhood ? `${venue}, ${neighborhood}` : venue,
  };
}

/**
 * Drop a leading "Venue: " or "Venue — " from a title when it just repeats the
 * venue shown alongside it. Returns the title unchanged when the prefix is not
 * the venue, so "Riso 101: Two-Colour Posters" keeps its colon.
 */
export function stripVenuePrefix(title: string, venue: string): string {
  const t = title.trim();
  const v = venue.trim();
  if (!v) return t;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // "The Tank" should also match a "Tank:" prefix, and vice versa.
  const candidates = [v, v.replace(/^the\s+/i, ""), "The " + v];

  for (const c of candidates) {
    for (const sep of [":", " —", " -", " –"]) {
      const prefix = c + sep;
      if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = t.slice(prefix.length).trim();
        // Never strip down to nothing.
        if (rest.length >= 3) return rest;
      }
    }
  }
  // The venue naming itself as host: "Wonderville's 2nd Annual Alt.Ctrl
  // Festival", "The Tank's Annual Gala". The venue is shown beside the title.
  for (const c of candidates) {
    for (const possessive of ["'s ", "’s "]) {
      const prefix = c + possessive;
      if (t.toLowerCase().startsWith(prefix.toLowerCase())) {
        const rest = t.slice(prefix.length).trim();
        if (rest.length >= 3) return rest;
      }
    }
  }
  // Venue name flowing straight into the title with no separator, e.g.
  // "Brooklyn Metal Works Open Studios". Conservative: the remainder must be
  // substantial and must not start with a connector, so "Film Forum Presents X"
  // is left alone rather than becoming "Presents X".
  for (const c of candidates) {
    if (t.toLowerCase().startsWith(c.toLowerCase() + " ")) {
      const rest = t.slice(c.length).trim();
      const connector = /^(presents?|at|with|in|on|and|&|for|by)\b/i.test(rest);
      if (rest.length >= 6 && !connector) return rest;
    }
  }

  // Prefix may be a shortened venue name ("Abrons Arts" for "Abrons Arts Center").
  const colon = t.indexOf(":");
  if (colon > 1 && colon <= 40) {
    const head = t.slice(0, colon);
    const hn = norm(head);
    const vn = norm(v);
    if (hn.length >= 4 && (vn.startsWith(hn) || hn.startsWith(vn))) {
      const rest = t.slice(colon + 1).trim();
      if (rest.length >= 3) return rest;
    }
  }
  return t;
}
