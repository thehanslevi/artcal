import type { CalEvent, CategoryFilter, TabMode } from "../types";
import { isFree } from "../lib/cost";
import { downloadICal } from "../lib/ical";
import { pickId } from "../lib/picks";
import { matchesTab } from "../lib/tab";

interface Props {
  /**
   * What the calendar is listing: upcoming events, or everything when "Show
   * past" is on. The button used to export every stored event, so it offered
   * "Export 843" beside a list of 91 and filled a calendar with July.
   */
  events: CalEvent[];
  filter: CategoryFilter;
  tab: TabMode;
  picks: Set<string>;
  picksOnly: boolean;
  freeOnly: boolean;
}

function visibleEvents(
  listed: CalEvent[],
  filter: CategoryFilter,
  tab: TabMode,
  picks: Set<string>,
  picksOnly: boolean,
  freeOnly: boolean,
): CalEvent[] {
  return listed
    .filter((e) => filter === "all" || e.category === filter)
    .filter((e) => matchesTab(tab, e.mode))
    .filter((e) => !picksOnly || picks.has(pickId(e)))
    .filter((e) => !freeOnly || isFree(e));
}

export function ExportButton({
  events: listed,
  filter,
  tab,
  picks,
  picksOnly,
  freeOnly,
}: Props) {
  const events = visibleEvents(listed, filter, tab, picks, picksOnly, freeOnly);
  const tabLabel =
    tab === "practice" ? "making" : tab === "attend" ? "witnessing" : null;
  // On the Practice tab the "making" category repeats the tab's own name;
  // say it once.
  const bits = [
    ...new Set([
      picksOnly ? "picks" : tabLabel,
      filter === "all" ? null : filter,
      freeOnly ? "free" : null,
    ]),
  ].filter(Boolean);
  const scopeText = bits.length ? ` ${bits.join(" ")}` : "";
  const label = `Export ${events.length}${scopeText}`;
  const filename = `art-cal${bits.length ? "-" + bits.join("-") : ""}.ics`;
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
