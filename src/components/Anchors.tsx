import anchorsData from "../data/anchors.json";
import type { Anchor, TabMode } from "../types";
import { matchesTab } from "../lib/tab";

const data = anchorsData as Anchor[];

interface Props {
  tab: TabMode;
}

export function Anchors({ tab }: Props) {
  const items = data.filter((a) => matchesTab(tab, a.mode));
  if (items.length === 0) return null;
  return (
    <section className="band band-warn" aria-label="Weekly anchors">
      <h2 className="band-title">Weekly anchors</h2>
      <ul className="band-list">
        {items.map((anchor) => (
          <li key={anchor.name}>
            <span className="anchor-name">
              {anchor.url ? (
                <a href={anchor.url} target="_blank" rel="noreferrer">
                  {anchor.name}
                </a>
              ) : (
                anchor.name
              )}
            </span>{" "}
            <span className="anchor-desc">
              — {anchor.description}. {anchor.note}.
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
