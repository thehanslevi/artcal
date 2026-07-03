import fallData from "../data/fall.json";
import type { FallItem, TabMode } from "../types";
import { matchesTab } from "../lib/tab";

const data = fallData as FallItem[];

interface Props {
  tab: TabMode;
}

export function FallHorizon({ tab }: Props) {
  const items = data.filter((f) => matchesTab(tab, f.mode));
  if (items.length === 0) return null;
  return (
    <section className="band band-pro" aria-label="Fall / winter horizon">
      <h2 className="band-title">Fall 2026 → Winter 2027 horizon</h2>
      <ul className="band-list">
        {items.map((item) => (
          <li key={item.title} className="fall-item">
            <span className="fall-title">
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              ) : (
                item.title
              )}
            </span>
            <span className="fall-detail">{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
