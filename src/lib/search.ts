import type { CalEvent } from "../types";

// Free-text search over the fields a person would actually type: the event
// name, where it is, its neighborhood, and any note. Multiple words are ANDed,
// so "print crown" matches a printmaking event in Crown Heights.
export function matchesQuery(event: CalEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    event.event,
    event.where,
    event.venue,
    event.neighborhood,
    event.note,
    event.category,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
