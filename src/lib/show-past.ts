import type { CalEvent } from "../types";
import { isPast, parseEventDate } from "./dates";

/**
 * Would "Show past" bring anything back?
 *
 * The page's own events can be checked: is any of them dated before today and
 * through the filters? The older events wait in their own download
 * (lib/events), and until it comes all the page knows is how many there are.
 * That count only says yes while the filters could reach them:
 *   - "This weekend" can't. The download stops more than two weeks before
 *     this week's Monday.
 *   - Picks can only when a pick isn't one of the page's events.
 * Once the download is in, only the first check counts.
 */
export function showPastFinds(o: {
  /** The loaded events that pass every filter, with the days before today kept. */
  matching: CalEvent[];
  now: Date;
  /** Whether the older events have been downloaded. */
  pastLoaded: boolean;
  /** How many older events the download holds. */
  pastCount: number;
  weekendOnly: boolean;
  picksOnly: boolean;
  picks: Set<string>;
  /** Every id a loaded event answers to (lib/picks' buildPickIndex). */
  loadedIds: { has(id: string): boolean };
}): boolean {
  const pastHere = o.matching.some((e) => {
    const d = parseEventDate(e.date);
    return d !== null && isPast(d, o.now);
  });
  if (pastHere) return true;
  if (o.pastLoaded || o.pastCount === 0 || o.weekendOnly) return false;
  if (o.picksOnly) return [...o.picks].some((id) => !o.loadedIds.has(id));
  return true;
}
