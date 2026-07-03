import eventsData from "../data/events.json";
import type { CategoryFilter, EventsData } from "../types";
import { findConflicts } from "../lib/conflicts";
import { EventRow } from "./EventRow";
import { WeekSummary } from "./WeekSummary";

const data = eventsData as EventsData;

interface Props {
  filter: CategoryFilter;
}

export function Calendar({ filter }: Props) {
  return (
    <div className="calendar">
      {data.weeks.map((week) => {
        const visible =
          filter === "all"
            ? week.events
            : week.events.filter((e) => e.category === filter);
        if (visible.length === 0) return null;
        const conflicts = findConflicts(visible);
        return (
          <section key={week.label} className="week">
            <div className="week-head">
              <h3 className="week-header">{week.label}</h3>
              <WeekSummary events={visible} />
            </div>
            {visible.map((event, idx) => (
              <EventRow
                key={`${event.date}-${event.event}-${idx}`}
                event={event}
                conflict={conflicts.has(idx)}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
