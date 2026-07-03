import eventsData from "../data/events.json";
import type { CalEvent, CategoryFilter, EventsData } from "../types";
import { downloadICal } from "../lib/ical";

const data = eventsData as EventsData;

interface Props {
  filter: CategoryFilter;
}

function visibleEvents(filter: CategoryFilter): CalEvent[] {
  const all = data.weeks.flatMap((w) => w.events);
  return filter === "all" ? all : all.filter((e) => e.category === filter);
}

export function ExportButton({ filter }: Props) {
  const events = visibleEvents(filter);
  const label =
    filter === "all"
      ? `Export ${events.length} events`
      : `Export ${events.length} ${filter} events`;
  const filename =
    filter === "all"
      ? "nyc-creative-calendar.ics"
      : `nyc-creative-calendar-${filter}.ics`;
  return (
    <button
      type="button"
      className="export-btn"
      onClick={() => downloadICal(events, filename)}
      disabled={events.length === 0}
      title="Download .ics — import to Apple Calendar or Google Calendar"
    >
      {label} ↓
    </button>
  );
}
