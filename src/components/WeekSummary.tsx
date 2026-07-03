import type { CalEvent, TabMode } from "../types";
import { summarize } from "../lib/summary";

interface Props {
  events: CalEvent[];
  tab: TabMode;
}

export function WeekSummary({ events, tab }: Props) {
  const { count, formattedCost, makingCount, makingRatio } = summarize(events);
  if (count === 0) return null;
  const makeClass =
    makingRatio >= 40
      ? "week-summary-make-hi"
      : makingRatio >= 20
        ? "week-summary-make-mid"
        : "week-summary-make-lo";
  return (
    <div className="week-summary">
      <span className="week-summary-chip">
        {count} event{count === 1 ? "" : "s"}
      </span>
      <span className="week-summary-chip">{formattedCost}</span>
      {tab === "all" ? (
        <span className={`week-summary-chip ${makeClass}`}>
          {makingCount} making · {makingRatio}%
        </span>
      ) : null}
    </div>
  );
}
