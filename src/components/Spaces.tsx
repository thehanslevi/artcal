import spacesData from "../data/spaces.json";
import type { CategoryFilter, Space, TabMode } from "../types";
import { matchesTab } from "../lib/tab";

const data = spacesData as Space[];

interface Props {
  filter: CategoryFilter;
  tab: TabMode;
}

export function Spaces({ filter, tab }: Props) {
  const visible = data
    .filter((s) => filter === "all" || s.category === filter)
    .filter((s) => matchesTab(tab, s.mode));
  if (visible.length === 0) return null;
  const heading =
    tab === "attend" ? "Places to see things" : "Places to make things";
  return (
    <section className="spaces" aria-label={heading}>
      <h2 className="spaces-title">{heading}</h2>
      <p className="spaces-lede">
        Ongoing venues, studios, collectives — not one-off events.
      </p>
      <ul className="spaces-list">
        {visible.map((s) => (
          <li key={s.name} className={`space cat-${s.category}`}>
            <div className="space-head">
              <span className="space-name">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </span>
              <span className={`pill pill-${s.category}`}>{s.category}</span>
            </div>
            <div className="space-desc">{s.description}</div>
            <div className="space-note">{s.note}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
