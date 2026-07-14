import type { CalEvent } from "../types";

const KEY = "nyc-cal:picks:v1";

/**
 * A pick's identity is the event's permanent uid, never its title.
 *
 * This used to return `date|title`, which meant a saved star broke the moment
 * anything renamed the event — a dedupe merge, a typo fix, a venue relabelling
 * its show. The star didn't error; it silently stopped resolving and dropped
 * out of the owner's subscribed calendar feed.
 */
export function pickId(e: Pick<CalEvent, "uid">): string {
  return e.uid;
}

/** The old, fragile key. Still read so pre-uid picks keep resolving. */
export function legacyPickId(e: Pick<CalEvent, "date" | "event">): string {
  return `${e.date}|${e.event}`;
}

/**
 * Every identity an event answers to: its uid, ids merged into it, and its
 * legacy `date|title` key. Stored picks are looked up through this, so a pick
 * saved under any past identity still finds its event.
 */
export function buildPickIndex(events: CalEvent[]): Map<string, CalEvent> {
  const index = new Map<string, CalEvent>();
  for (const e of events) {
    index.set(e.uid, e);
    index.set(legacyPickId(e), e);
    for (const a of e.aliases ?? []) index.set(a, e);
  }
  return index;
}

/**
 * Rewrite stored picks to canonical uids, so a legacy `date|title` pick or one
 * saved against a since-merged duplicate upgrades itself on first load.
 *
 * Unresolvable ids are kept, not dropped. An event can be absent from the
 * bundle for reasons that say nothing about the user's intent, and quietly
 * deleting someone's star and re-uploading the shortened list is exactly the
 * silent data loss this whole change exists to stop.
 */
export function canonicalizePicks(
  picks: Iterable<string>,
  index: Map<string, CalEvent>,
): Set<string> {
  const out = new Set<string>();
  for (const id of picks) {
    const e = index.get(id);
    out.add(e ? e.uid : id);
  }
  return out;
}

export function loadPicks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function savePicks(picks: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(picks)));
  } catch {
    /* quota */
  }
}
