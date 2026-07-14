import { useMemo, useState } from "react";
import type { Category } from "../types";
import type { Discipline, Practice } from "../types/practice";
import {
  PRACTICES,
  availableThisWeek,
  formatAvailability,
  formatCost,
  formatCostGap,
  formatSchedule,
  formatVerified,
  isAffordable,
  isNearby,
  isStale,
} from "../lib/practices";
import { today } from "../lib/dates";

// Reuse the existing eight-ink palette rather than inventing colours for all
// sixteen disciplines.
const INK: Record<Discipline, Category> = {
  ceramics: "making",
  printmaking: "making",
  "book-arts": "making",
  textiles: "making",
  glass: "making",
  woodworking: "making",
  zines: "making",
  darkroom: "film",
  film: "film",
  sound: "sound",
  voice: "sound",
  code: "tech",
  writing: "literature",
  dance: "dance",
  theatre: "theatre",
  community: "community",
};

const DISCIPLINE_LABEL: Record<Discipline, string> = {
  ceramics: "Ceramics",
  printmaking: "Printmaking",
  "book-arts": "Book arts",
  textiles: "Textiles",
  glass: "Glass",
  woodworking: "Woodworking",
  darkroom: "Darkroom",
  film: "Film",
  sound: "Sound",
  code: "Code",
  zines: "Zines",
  writing: "Writing",
  dance: "Dance",
  theatre: "Theatre",
  voice: "Voice",
  community: "Community",
};

type DisciplineFilter = "all" | Discipline;

export function Directory() {
  const now = useMemo(() => today(), []);
  const [discipline, setDiscipline] = useState<DisciplineFilter>("all");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [thisWeekOnly, setThisWeekOnly] = useState(false);

  const thisWeekIds = useMemo(
    () => new Set(availableThisWeek(now).map((x) => x.practice.id)),
    [now],
  );

  const visible = useMemo(() => {
    return PRACTICES.filter(
      (p) => discipline === "all" || p.disciplines.includes(discipline),
    )
      .filter((p) => !affordableOnly || isAffordable(p))
      .filter((p) => !nearbyOnly || isNearby(p))
      .filter((p) => !thisWeekOnly || thisWeekIds.has(p.id))
      .sort((a, b) => {
        // Closest first; unmeasured travel sinks to the bottom.
        const at = a.travelMin ?? 999;
        const bt = b.travelMin ?? 999;
        return at - bt || a.name.localeCompare(b.name);
      });
  }, [discipline, affordableOnly, nearbyOnly, thisWeekOnly, thisWeekIds]);

  const counts = useMemo(() => {
    const c = new Map<Discipline, number>();
    for (const p of PRACTICES) {
      for (const d of p.disciplines) c.set(d, (c.get(d) ?? 0) + 1);
    }
    return c;
  }, []);

  const disciplines = useMemo(
    () =>
      (Object.keys(DISCIPLINE_LABEL) as Discipline[])
        .filter((d) => counts.has(d))
        .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)),
    [counts],
  );

  return (
    <section className="directory" aria-label="Where to make things in NYC">
      <div className="directory-lede">
        <p className="directory-title">Where to make things</p>
      </div>

      <div className="directory-filters">
        <div className="dir-chips">
          <button
            type="button"
            className={`dir-chip${discipline === "all" ? " active" : ""}`}
            onClick={() => setDiscipline("all")}
          >
            All <span>({PRACTICES.length})</span>
          </button>
          {disciplines.map((d) => (
            <button
              key={d}
              type="button"
              className={`dir-chip cat-${INK[d]}${discipline === d ? " active" : ""}`}
              onClick={() => setDiscipline(d)}
            >
              {DISCIPLINE_LABEL[d]} <span>({counts.get(d)})</span>
            </button>
          ))}
        </div>
        <div className="dir-toggles">
          <button
            type="button"
            className={`dir-toggle${affordableOnly ? " active" : ""}`}
            onClick={() => setAffordableOnly((v) => !v)}
            aria-pressed={affordableOnly}
            title="Free, sliding scale, scholarship, or work-study"
          >
            Money isn’t a barrier
          </button>
          <button
            type="button"
            className={`dir-toggle${nearbyOnly ? " active" : ""}`}
            onClick={() => setNearbyOnly((v) => !v)}
            aria-pressed={nearbyOnly}
            title="Within 25 minutes of Crown Heights"
          >
            Close to home
          </button>
          <button
            type="button"
            className={`dir-toggle${thisWeekOnly ? " active" : ""}`}
            onClick={() => setThisWeekOnly((v) => !v)}
            aria-pressed={thisWeekOnly}
            title="Has a standing session in the next 7 days"
          >
            On this week <span>({thisWeekIds.size})</span>
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">Nothing matches those filters.</div>
      ) : (
        <ul className="dir-list">
          {visible.map((p) => (
            <PracticeRow
              key={p.id}
              practice={p}
              onThisWeek={thisWeekIds.has(p.id)}
              now={now}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PracticeRow({
  practice: p,
  onThisWeek,
  now,
}: {
  practice: Practice;
  onThisWeek: boolean;
  now: Date;
}) {
  const stale = isStale(p, now);
  const cost = formatCost(p.cost);
  const gap = formatCostGap(p.cost);
  const avail = formatAvailability(p.availability);
  const dormant = p.availability && p.availability.status !== "running";
  const ink = INK[p.disciplines[0]!];
  return (
    <li className={`dir-item cat-${ink}${dormant ? " is-dormant" : ""}`}>
      <div className="dir-when">
        <span className="dir-sched">{formatSchedule(p.schedule)}</span>
        {onThisWeek ? <span className="dir-live">this week</span> : null}
        {avail ? <span className="dir-avail">{avail}</span> : null}
      </div>
      <div className="dir-body">
        <div className="dir-name">
          <a href={p.url} target="_blank" rel="noreferrer">
            {p.name}
          </a>
        </div>
        <div className="dir-what">{p.what}</div>
        <div className="dir-meta">
          {p.neighborhood}
          {p.travelMin !== null ? (
            <span className="dir-travel"> · ~{p.travelMin} min</span>
          ) : null}
          {cost ? <span className="dir-cost"> · {cost}</span> : null}
          {gap ? <span className="dir-gap"> · {gap}</span> : null}
        </div>
        {p.availability && p.availability.status !== "running" ? (
          <div className="dir-dormant-note">{p.availability.note}</div>
        ) : null}
        {p.access.length ? (
          <div className="dir-access">
            {p.access
              .filter((a) =>
                ["free", "sliding-scale", "scholarship", "work-study", "drop-in"].includes(a),
              )
              .map((a) => (
                <span key={a} className={`dir-tag dir-tag-${a}`}>
                  {a.replace("-", " ")}
                </span>
              ))}
          </div>
        ) : null}
        {p.caveat ? <div className="dir-caveat">{p.caveat}</div> : null}
        {stale ? (
          <div className="dir-stale">
            Suspect: {formatVerified(p, now)}. Reconfirm before relying on this.
          </div>
        ) : null}
      </div>
    </li>
  );
}
