import { useEffect, useMemo, useRef, useState } from "react";
import eventsData from "../data/events.json";
import type { CalEvent, CategoryFilter, EventsData, TabMode } from "../types";
import { findConflicts } from "../lib/conflicts";
import {
  daysUntil as daysUntilFn,
  isCurrentWeek,
  isPast,
  isPastWeek,
  parseEventDate,
  parseWeekRange,
  today,
} from "../lib/dates";
import { matchesTab } from "../lib/tab";
import { EventRow } from "./EventRow";
import { WeekSummary } from "./WeekSummary";

const data = eventsData as EventsData;

interface Props {
  filter: CategoryFilter;
  tab: TabMode;
}

export function Calendar({ filter, tab }: Props) {
  const [showPast, setShowPast] = useState(false);
  const now = useMemo(() => today(), []);
  const currentWeekRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, []);

  const anyPast = data.weeks.some((week) => {
    const range = parseWeekRange(week.label);
    return range ? isPastWeek(range, now) : false;
  });

  return (
    <div className="calendar">
      {anyPast ? (
        <div className="past-toggle">
          <button
            type="button"
            className="past-toggle-btn"
            onClick={() => setShowPast((s) => !s)}
          >
            {showPast ? "Hide past events" : "Show past events"}
          </button>
        </div>
      ) : null}
      {data.weeks.map((week) => {
        const range = parseWeekRange(week.label);
        const past = range ? isPastWeek(range, now) : false;
        const current = range ? isCurrentWeek(range, now) : false;
        if (past && !showPast) return null;
        const visible = week.events
          .filter((e) => filter === "all" || e.category === filter)
          .filter((e) => matchesTab(tab, e.mode as "make" | "watch"));
        if (visible.length === 0) return null;
        const conflicts = findConflicts(visible);
        return (
          <section
            key={week.label}
            className={`week${current ? " is-current-week" : ""}${past ? " is-past-week" : ""}`}
            ref={current ? currentWeekRef : undefined}
          >
            <div className="week-head">
              <h3 className="week-header">
                {week.label}
                {current ? (
                  <span className="current-chip">This week</span>
                ) : null}
              </h3>
              <WeekSummary events={visible} tab={tab} />
            </div>
            {visible.map((event, idx) => {
              const d = parseEventDate(event.date);
              const du: number | null = d ? daysUntilFn(d, now) : null;
              const evPast = d ? isPast(d, now) : false;
              return (
                <EventRow
                  key={`${event.date}-${event.event}-${idx}`}
                  event={event as CalEvent}
                  conflict={conflicts.has(idx)}
                  daysUntil={du}
                  past={evPast}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
