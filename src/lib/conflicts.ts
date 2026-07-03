import type { CalEvent } from "../types";

const DEFAULT_DURATION_MIN = 120;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function findConflicts(events: CalEvent[]): Set<number> {
  const conflicting = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const a = events[i];
    if (!a.start) continue;
    const aStart = toMinutes(a.start);
    const aEnd = a.end ? toMinutes(a.end) : aStart + DEFAULT_DURATION_MIN;
    for (let j = i + 1; j < events.length; j++) {
      const b = events[j];
      if (a.date !== b.date) continue;
      if (!b.start) continue;
      const bStart = toMinutes(b.start);
      const bEnd = b.end ? toMinutes(b.end) : bStart + DEFAULT_DURATION_MIN;
      if (aStart < bEnd && bStart < aEnd) {
        conflicting.add(i);
        conflicting.add(j);
      }
    }
  }
  return conflicting;
}
