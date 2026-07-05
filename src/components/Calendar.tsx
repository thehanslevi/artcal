import { useEffect, useMemo, useState } from "react";
import eventsData from "../data/events.json";
import type { CalEvent, CategoryFilter, EventsData, TabMode } from "../types";
import {
  daysUntil as daysUntilFn,
  groupEventsIntoWeeks,
  isCurrentWeek,
  isPast,
  isPastWeek,
  parseEventDate,
  today,
} from "../lib/dates";
import { isFree } from "../lib/cost";
import { pickId } from "../lib/picks";
import { matchesTab } from "../lib/tab";
import { EventRow } from "./EventRow";
import { WeekSummary } from "./WeekSummary";

const data = eventsData as EventsData;

// Weeks are derived from event dates (Monday-start), not the raw buckets in
// events.json, which can overlap or misfile events.
const WEEKS = groupEventsIntoWeeks(
  data.weeks.flatMap((w) => w.events as CalEvent[]),
);

interface Props {
  filter: CategoryFilter;
  tab: TabMode;
  picks: Set<string>;
  picksOnly: boolean;
  freeOnly: boolean;
  onTogglePick: (id: string) => void;
}

interface EnrichedWeek {
  label: string;
  range: { start: Date; end: Date };
  past: boolean;
  current: boolean;
  visible: CalEvent[];
}

export function Calendar({
  filter,
  tab,
  picks,
  picksOnly,
  freeOnly,
  onTogglePick,
}: Props) {
  const [viewMode, setViewMode] = useState<"single" | "all">("single");
  const [userWeekIndex, setUserWeekIndex] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);
  const now = useMemo(() => today(), []);

  // Reset user selection when filters change
  useEffect(() => {
    setUserWeekIndex(null);
  }, [filter, tab, picksOnly, freeOnly]);

  const enrichedWeeks: EnrichedWeek[] = WEEKS.map((week) => {
    const range = { start: week.start, end: week.end };
    const past = isPastWeek(range, now);
    const current = isCurrentWeek(range, now);
    const visible = week.events
      .filter((e) => filter === "all" || e.category === filter)
      .filter((e) => matchesTab(tab, e.mode))
      .filter((e) => !picksOnly || picks.has(pickId(e)))
      .filter((e) => !freeOnly || isFree(e));
    return { label: week.label, range, past, current, visible };
  });

  const shownWeeks = enrichedWeeks.filter((w) => {
    if (w.visible.length === 0) return false;
    if (w.past && !showPast) return false;
    return true;
  });

  const anyPast = enrichedWeeks.some((w) => w.past && w.visible.length > 0);

  if (shownWeeks.length === 0) {
    return (
      <div className="calendar">
        <div className="empty-state">
          {picksOnly
            ? "No picks yet. Tap ☆ on events to add them to your picks."
            : freeOnly
              ? "No free events match the current filters."
              : "No events match the current filters."}
        </div>
      </div>
    );
  }

  // Auto-select current/next week if user hasn't chosen
  const autoIndex = (() => {
    const currentIdx = shownWeeks.findIndex((w) => w.current);
    if (currentIdx !== -1) {
      // On the week's final day (Sunday), most of it is behind us — focus
      // next week instead; the arrows still reach today.
      const endsToday =
        daysUntilFn(shownWeeks[currentIdx].range.end, now) <= 0;
      if (endsToday && currentIdx + 1 < shownWeeks.length) {
        return currentIdx + 1;
      }
      return currentIdx;
    }
    const futureIdx = shownWeeks.findIndex((w) => w.range.start >= now);
    if (futureIdx !== -1) return futureIdx;
    return 0;
  })();
  const activeIndex = userWeekIndex ?? autoIndex;
  const safeIndex = Math.min(Math.max(activeIndex, 0), shownWeeks.length - 1);
  const focused = shownWeeks[safeIndex];

  const canPrev = safeIndex > 0;
  const canNext = safeIndex < shownWeeks.length - 1;

  return (
    <div className="calendar">
      <div className="calendar-controls">
        {viewMode === "single" ? (
          <div className="week-nav">
            <button
              type="button"
              className="week-nav-btn"
              onClick={() => canPrev && setUserWeekIndex(safeIndex - 1)}
              disabled={!canPrev}
              aria-label="Previous week"
            >
              ←
            </button>
            <select
              className="week-nav-select"
              value={safeIndex}
              onChange={(e) => setUserWeekIndex(Number(e.target.value))}
              aria-label="Jump to week"
            >
              {shownWeeks.map((w, i) => (
                <option key={w.label} value={i}>
                  {w.label}
                  {w.current ? " · this week" : ""} ({w.visible.length})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="week-nav-btn"
              onClick={() => canNext && setUserWeekIndex(safeIndex + 1)}
              disabled={!canNext}
              aria-label="Next week"
            >
              →
            </button>
          </div>
        ) : (
          <div className="week-nav-placeholder" />
        )}
        <div className="calendar-toggles">
          <button
            type="button"
            className="mini-toggle"
            onClick={() => setViewMode(viewMode === "single" ? "all" : "single")}
          >
            {viewMode === "single" ? "Show all weeks" : "One week at a time"}
          </button>
          {anyPast ? (
            <button
              type="button"
              className="mini-toggle"
              onClick={() => setShowPast((s) => !s)}
            >
              {showPast ? "Hide past" : "Show past"}
            </button>
          ) : null}
        </div>
      </div>
      {(viewMode === "single" ? [focused] : shownWeeks).map((week) => {
        return (
          <section
            key={week.label}
            className={`week${week.current ? " is-current-week" : ""}${week.past ? " is-past-week" : ""}`}
          >
            <div className="week-head">
              <h3 className="week-header">
                {week.label}
                {week.current ? (
                  <span className="current-chip">This week</span>
                ) : null}
              </h3>
              <WeekSummary events={week.visible} tab={tab} picks={picks} />
            </div>
            {week.visible.map((event, idx) => {
              const d = parseEventDate(event.date);
              const du: number | null = d ? daysUntilFn(d, now) : null;
              const evPast = d ? isPast(d, now) : false;
              const id = pickId(event);
              return (
                <EventRow
                  key={`${event.date}-${event.event}-${idx}`}
                  event={event}
                  daysUntil={du}
                  past={evPast}
                  picked={picks.has(id)}
                  onTogglePick={() => onTogglePick(id)}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
