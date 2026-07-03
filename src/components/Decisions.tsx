import decisionsData from "../data/decisions.json";
import type { DecisionsData, TabMode } from "../types";
import {
  daysUntil as daysUntilFn,
  formatDaysUntil,
  parseEventDate,
  today,
} from "../lib/dates";
import { matchesTab } from "../lib/tab";

const data = decisionsData as DecisionsData;

interface Props {
  tab: TabMode;
}

export function Decisions({ tab }: Props) {
  const items = data.open.filter((it) => matchesTab(tab, it.mode));
  if (items.length === 0) return null;
  const now = today();
  return (
    <section className="decisions" aria-label="Open decisions">
      <h2 className="decisions-title">Open decisions</h2>
      <ol className="decisions-list">
        {items.map((item, idx) => {
          const d = item.date ? parseEventDate(item.date) : null;
          const du = d ? daysUntilFn(d, now) : null;
          return (
            <li key={idx}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.text}
                </a>
              ) : (
                item.text
              )}
              {du !== null ? (
                <span
                  className={`countdown-inline ${du <= 3 ? "countdown-soon" : du <= 14 ? "countdown-mid" : ""}`}
                >
                  {" "}
                  · {formatDaysUntil(du)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
