import type { CalEvent } from "../types";

export interface WeekSummary {
  count: number;
  costLow: number;
  costHigh: number;
  makingCount: number;
  formattedCost: string;
  makingRatio: number;
}

const NUMBER_RE = /\$?(\d+(?:\.\d+)?)/g;

export function parseCostRange(cost: string): [number, number] {
  if (!cost) return [0, 0];
  const matches = [...cost.matchAll(NUMBER_RE)].map((m) => Number(m[1]));
  if (matches.length === 0) return [0, 0];
  if (matches.length === 1) return [matches[0], matches[0]];
  return [Math.min(...matches), Math.max(...matches)];
}

export function summarize(events: CalEvent[]): WeekSummary {
  let costLow = 0;
  let costHigh = 0;
  let makingCount = 0;
  for (const e of events) {
    const [lo, hi] = parseCostRange(e.cost);
    costLow += lo;
    costHigh += hi;
    if (e.mode === "make") makingCount += 1;
  }
  const count = events.length;
  const formattedCost =
    costLow === 0 && costHigh === 0
      ? "free"
      : costLow === costHigh
        ? `$${costLow}`
        : `$${costLow}–${costHigh}`;
  const makingRatio = count === 0 ? 0 : Math.round((makingCount / count) * 100);
  return { count, costLow, costHigh, makingCount, formattedCost, makingRatio };
}
