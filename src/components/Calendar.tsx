import { useEffect, useMemo, useState } from "react";
import type { CalEvent, CategoryFilter, TabMode } from "../types";
import {
  daysUntil as daysUntilFn,
  groupEventsIntoWeeks,
  isCurrentWeek,
  isPast,
  isPastWeek,
  isThisWeekend,
  parseEventDate,
  today,
} from "../lib/dates";
import { isFree } from "../lib/cost";
import { PAST_COUNT, type PastStatus } from "../lib/events";
import { buildPickIndex, pickId } from "../lib/picks";
import { showPastFinds } from "../lib/show-past";
import { matchesTab } from "../lib/tab";
import { EventRow } from "./EventRow";
import { WeekSummary } from "./WeekSummary";

interface Props {
  /**
   * From two weeks before this week's Monday on, plus the older events once
   * "Show past" has loaded them.
   */
  events: CalEvent[];
  filter: CategoryFilter;
  tab: TabMode;
  picks: Set<string>;
  picksOnly: boolean;
  freeOnly: boolean;
  weekendOnly: boolean;
  /** Owned by App, so the filter counts can match what is listed here. */
  showPast: boolean;
  /** The past download "Show past" starts, if it's under way or failed. */
  pastStatus: PastStatus;
  /** Whether that download has come, so `events` holds every event. */
  pastLoaded: boolean;
  onToggleShowPast: () => void;
  onTogglePick: (id: string) => void;
  isCurator?: boolean;
  notes?: Record<string, string>;
  onSetNote?: (id: string, text: string) => void;
}

interface EnrichedWeek {
  label: string;
  range: { start: Date; end: Date };
  past: boolean;
  current: boolean;
  visible: CalEvent[];
  events: CalEvent[];
}

export function Calendar({
  events,
  filter,
  tab,
  picks,
  picksOnly,
  freeOnly,
  weekendOnly,
  showPast,
  pastStatus,
  pastLoaded,
  onToggleShowPast,
  onTogglePick,
  isCurator = false,
  notes = {},
  onSetNote,
}: Props) {
  const [viewMode, setViewMode] = useState<"single" | "all">("single");
  const [userWeekIndex, setUserWeekIndex] = useState<number | null>(null);
  const now = useMemo(() => today(), []);
  // Weeks are derived from event dates (Monday-start), not the raw buckets in
  // events.json, which can overlap or misfile events.
  const weeks = useMemo(() => groupEventsIntoWeeks(events), [events]);
  // Every id a loaded event answers to, to tell which picks are here.
  const loadedIds = useMemo(() => buildPickIndex(events), [events]);

  // Reset user selection when filters change
  useEffect(() => {
    setUserWeekIndex(null);
  }, [filter, tab, picksOnly, freeOnly, weekendOnly]);

  // Apply all active filters to a week's events under a given tab. Kept as a
  // function so the focused week can be re-filtered with a widened tab when a
  // single mode leaves it too sparse (see THIN_WEEK below).
  const visibleFor = (
    events: CalEvent[],
    effTab: TabMode,
    withPast: boolean = showPast,
  ) =>
    events
      .filter((e) => filter === "all" || e.category === filter)
      .filter((e) => matchesTab(effTab, e.mode))
      .filter((e) => !picksOnly || picks.has(pickId(e)))
      .filter((e) => !freeOnly || isFree(e))
      .filter((e) => {
        // Hide events that have already happened (unless "show past" is on).
        if (withPast) return true;
        const d = parseEventDate(e.date);
        return !d || !isPast(d, now);
      })
      .filter((e) => {
        if (!weekendOnly) return true;
        const d = parseEventDate(e.date);
        return d ? isThisWeekend(d, now) : false;
      });

  const enrichedWeeks: EnrichedWeek[] = weeks.map((week) => {
    const range = { start: week.start, end: week.end };
    const past = isPastWeek(range, now);
    const current = isCurrentWeek(range, now);
    const visible = visibleFor(week.events, tab);
    return { label: week.label, range, past, current, visible, events: week.events };
  });

  const shownWeeks = enrichedWeeks.filter((w) => {
    if (w.visible.length === 0) return false;
    if (w.past && !showPast) return false;
    return true;
  });

  // Is there anything "Show past" would bring back (lib/show-past)? The check
  // has to look past the hiding above. It used to ask whether a past week had
  // visible events, which the hiding had already emptied, so the answer was
  // always no and the button never appeared.
  const anyPast = showPastFinds({
    matching: visibleFor(events, tab, true),
    now,
    pastLoaded,
    pastCount: PAST_COUNT,
    weekendOnly,
    picksOnly,
    picks,
    loadedIds,
  });
  const pastLabel = showPast
    ? "Hide past"
    : pastStatus === "loading"
      ? "Loading…"
      : pastStatus === "failed"
        ? "Reload to show past"
        : "Show past";

  if (shownWeeks.length === 0) {
    return (
      <div className="calendar">
        <div className="empty-state">
          {picksOnly
            ? "No picks yet. Tap ☆ on events to add them to your picks."
            : weekendOnly
              ? "Nothing this weekend in the current filters."
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
              onClick={onToggleShowPast}
              aria-disabled={pastStatus === "loading" || undefined}
            >
              {pastLabel}
            </button>
          ) : null}
        </div>
      </div>
      {(viewMode === "single" && !weekendOnly ? [focused] : shownWeeks).map((week) => {
        const weekEvents = week.visible;
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
              <WeekSummary events={weekEvents} tab={tab} picks={picks} />
            </div>
            {weekEvents.map((event, idx) => {
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
                  isCurator={isCurator}
                  note={notes[id]}
                  onSetNote={onSetNote ? (t) => onSetNote(id, t) : undefined}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
