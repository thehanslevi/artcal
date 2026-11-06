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
  formatLastChecked,
  isAffordable,
  isStale,
} from "../lib/practices";
import { today } from "../lib/dates";
import { datedSessionsFor, sessionTitle } from "../lib/join";
import { track } from "../lib/usage";

// Reuse the existing eight-ink palette rather than inventing colours for all
// seventeen disciplines.
const INK: Record<Discipline, Category> = {
  ceramics: "making",
  printmaking: "making",
  "book-arts": "making",
  textiles: "making",
  glass: "making",
  woodworking: "making",
  metalwork: "making",
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
  metalwork: "Metalwork",
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
      .filter((p) => !thisWeekOnly || thisWeekIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [discipline, affordableOnly, thisWeekOnly, thisWeekIds]);

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
              onClick={() => {
                setDiscipline(d);
                track("filter", { kind: "discipline", value: d });
              }}
            >
              {DISCIPLINE_LABEL[d]} <span>({counts.get(d)})</span>
            </button>
          ))}
        </div>
        <div className="dir-toggles">
          <button
            type="button"
            className={`dir-toggle${affordableOnly ? " active" : ""}`}
            onClick={() => {
              setAffordableOnly((v) => !v);
              track("filter", { kind: "affordable" });
            }}
            aria-pressed={affordableOnly}
            title="Free, sliding scale, scholarship, or work-study"
          >
            Money isn’t a barrier
          </button>
          <button
            type="button"
            className={`dir-toggle${thisWeekOnly ? " active" : ""}`}
            onClick={() => {
              setThisWeekOnly((v) => !v);
              track("filter", { kind: "this-week" });
            }}
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
  // A standing pattern says "8-week sessions"; the events feed knows the actual
  // dates. Borrow them so the row can name the next real session.
  const sessions = useMemo(() => datedSessionsFor(p, now), [p, now]);
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
          {cost ? <span className="dir-cost"> · {cost}</span> : null}
          {gap ? <span className="dir-gap"> · {gap}</span> : null}
        </div>
        {sessions.length ? (
          <div className="dir-sessions">
            <span className="dir-sessions-label">Next</span>
            {sessions.slice(0, 2).map((e) => (
              <span key={e.date + e.event} className="dir-session">
                <b>{e.date}</b>{" "}
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    {sessionTitle(p, e)}
                  </a>
                ) : (
                  sessionTitle(p, e)
                )}
              </span>
            ))}
            {sessions.length > 2 ? (
              <span className="dir-session-more">
                +{sessions.length - 2} more
              </span>
            ) : null}
          </div>
        ) : null}
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
          <div className="dir-stale">{formatLastChecked(p, now)}</div>
        ) : null}
      </div>
    </li>
  );
}
