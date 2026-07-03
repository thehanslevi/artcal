import eventsData from "../data/events.json";
import type { CalEvent, CategoryFilter, EventsData, TabMode } from "../types";
import { downloadICal } from "../lib/ical";
import { matchesTab } from "../lib/tab";

const data = eventsData as EventsData;

interface Props {
  filter: CategoryFilter;
  tab: TabMode;
}

function visibleEvents(filter: CategoryFilter, tab: TabMode): CalEvent[] {
  return data.weeks
    .flatMap((w) => w.events as CalEvent[])
    .filter((e) => filter === "all" || e.category === filter)
    .filter((e) => matchesTab(tab, e.mode));
}

export function ExportButton({ filter, tab }: Props) {
  const events = visibleEvents(filter, tab);
  const bits = [
    tab === "all" ? null : tab,
    filter === "all" ? null : filter,
  ].filter(Boolean);
  const scopeText = bits.length ? ` ${bits.join(" ")}` : "";
  const label = `Export ${events.length}${scopeText} events`;
  const filename = `nyc-creative-calendar${bits.length ? "-" + bits.join("-") : ""}.ics`;
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
