import { events, lastVerified, pastCount } from "virtual:events-current";
import type { CalEvent } from "../types";

// Events reach the app in two parts, split at build time by vite.config.ts.
// The page carries the events from two weeks before this week's Monday on:
// Starting soon reads the two weeks before a class to tell one starting from
// one under way. The rest wait in their own chunk until someone turns on
// "Show past".
//
// Node can't resolve the virtual modules, so tests and scripts must not import
// this file. They read src/data/events.json, which still holds every event.

/**
 * From two weeks before this week's Monday on. Enough for anything that only
 * lists what's ahead, which must still hide the dates before today itself.
 */
export const CURRENT_EVENTS: CalEvent[] = events;
export const LAST_VERIFIED: string = lastVerified;
/** How many events loadPastEvents() brings. */
export const PAST_COUNT: number = pastCount;

/** Everything older than CURRENT_EVENTS, downloaded on first call. */
export function loadPastEvents(): Promise<CalEvent[]> {
  return import("virtual:events-past").then((m) => m.default);
}

/** Where a loadPastEvents() call started by "Show past" stands. */
export type PastStatus = "idle" | "loading" | "failed";
