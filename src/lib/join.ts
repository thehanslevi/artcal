import eventsData from "../data/events.json";
import type { CalEvent, EventsData } from "../types";
import type { Practice } from "../types/practice";
import { isPast, parseEventDate } from "./dates";
import { hostOf, isAggregator } from "./host";

const ALL: CalEvent[] = (eventsData as EventsData).weeks.flatMap(
  (w) => w.events as CalEvent[],
);

/**
 * The bridge between the two models.
 *
 * The Directory holds standing patterns: "8-week sessions", "check site".
 * events.json holds dated instances: "Optical Printing Day 1, Jul 18". They
 * describe the same venues at different resolutions, so a Practice row can
 * borrow its venue's next real date instead of saying "check site".
 *
 * Matching is by URL host first (see lib/host) and only falls back to names,
 * because the two datasets were built independently and rarely agree on what a
 * place is called. Name matching alone missed RBPMW's 22 workshops entirely.
 *
 * Only make-mode events count. Pioneer Works runs concerts as well as open
 * studios, and a making directory should not advertise False Harmonics as your
 * next session there.
 */
function matchesVenue(p: Practice, e: CalEvent): boolean {
  const ph = hostOf(p.url);
  const eh = hostOf(e.url);
  // A shared host is proof. A shared aggregator (eventbrite) is not, so those
  // fall through to the name test rather than matching everything.
  if (ph && eh && !isAggregator(eh) && !isAggregator(ph)) return ph === eh;

  const name = p.name.toLowerCase();
  const venue = (e.venue ?? "").toLowerCase().trim();
  if (!venue) return false;
  // Short names are ambiguous inside a free-text venue string ("JACK" would
  // catch "Jack's Bar"), so they must equal the parsed venue outright.
  if (name.length <= 5) return venue === name;
  return venue.includes(name) || name.includes(venue);
}

/** Upcoming dated making sessions at this venue, soonest first. */
export function datedSessionsFor(p: Practice, now: Date): CalEvent[] {
  return ALL.filter((e) => e.mode === "make" && matchesVenue(p, e))
    .map((e) => ({ e, d: parseEventDate(e.date) }))
    .filter((x) => x.d && !isPast(x.d, now))
    .sort((a, b) => a.d!.getTime() - b.d!.getTime())
    .map((x) => x.e);
}

/** Strip the venue prefix: "Mono No Aware: Optical Printing" -> "Optical Printing". */
export function sessionTitle(p: Practice, e: CalEvent): string {
  const prefix = p.name + ":";
  return e.event.toLowerCase().startsWith(prefix.toLowerCase())
    ? e.event.slice(prefix.length).trim()
    : e.event;
}
