/**
 * An organisation's identity, taken from its web address.
 *
 * Names are the least reliable way to tell whether an event and a directory row
 * are the same place. The events feed says "RBPMW", the directory says "Robert
 * Blackburn Printmaking Workshop"; one says "Flux IV", the other "Flux
 * Factory"; one says "Downtown Brooklyn" (a neighborhood the scrape mistook for
 * a venue) where the directory says "Mono No Aware". No amount of fuzzy string
 * matching gets those right without also matching "Downtown Brooklyn" to
 * "Artshack Brooklyn", which is wrong.
 *
 * Both sides already carry a URL, and rbpmw-efanyc.org is rbpmw-efanyc.org
 * whatever you call it. So the host is the join key, and names are only a
 * fallback for events with no link.
 */

/** Same organisation, second domain. Verified by hand, not guessed. */
const HOST_ALIASES: Record<string, string> = {
  // RBPMW's older Squarespace address, still used by some listing pages.
  "efa-rbpmw.squarespace.com": "rbpmw-efanyc.org",
};

/**
 * Repair a mangled URL. Scrapes that join a base to an already-absolute href
 * produce "http://https//host/path", which parses as host "https" and silently
 * defeats any host comparison.
 */
export function repairUrl(url: string): string {
  return url
    .replace(/^(https?:\/\/)https?:?\/\/+/i, "https://")
    .replace(/^(https?):\/(?!\/)/i, "$1://");
}

/** The registrable host, lowercased, without "www." — "" when there isn't one. */
export function hostOf(url: string | undefined | null): string {
  if (!url) return "";
  try {
    const h = new URL(repairUrl(url)).hostname.replace(/^www\./i, "").toLowerCase();
    return HOST_ALIASES[h] ?? h;
  } catch {
    return "";
  }
}

/**
 * Hosts that host other people's events. Two events sharing eventbrite.com tell
 * you nothing about whether they're the same organisation, so these never join.
 */
const AGGREGATORS = new Set([
  "eventbrite.com",
  "eventbrite.co.uk",
  "withfriends.co",
  "dice.fm",
  "ra.co",
  "linktr.ee",
  "instagram.com",
  "facebook.com",
  "meetup.com",
  "partiful.com",
  "lu.ma",
]);

export function isAggregator(host: string): boolean {
  return AGGREGATORS.has(host);
}
