import { useEffect, useId, useRef, useState } from "react";
import { isPublicNote } from "../lib/notes";
import type { CalEvent } from "../types";
import { formatDaysUntil } from "../lib/dates";
import { formatCost } from "../lib/cost";
import { downloadEventICal, googleCalendarUrl } from "../lib/ical";
import { track } from "../lib/usage";

interface Props {
  event: CalEvent;
  daysUntil?: number | null;
  past?: boolean;
  picked?: boolean;
  onTogglePick?: () => void;
  isCurator?: boolean;
  note?: string;
  onSetNote?: (text: string) => void;
}

function flagLabel(flag: CalEvent["flag"]): string | null {
  if (flag === "urgent") return "buy now";
  if (flag === "decide") return "decide";
  if (flag === "priority") return "★";
  return null;
}

function formatTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === "00" ? `${h12}${suffix}` : `${h12}:${m}${suffix}`;
}

function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  // Some scrapes repeat the start as the end; "7:30pm–7:30pm" says nothing.
  if (!end || end === start) return formatTime(start);
  return `${formatTime(start)}–${formatTime(end)}`;
}

/**
 * "+ Cal": adds this one event to the visitor's own calendar, as an .ics file
 * (Apple Calendar, Outlook, most others) or through Google Calendar's
 * new-event form. Both carry the same times and UID as the feeds.
 */
function AddToCalendar({ event, googleUrl }: { event: CalEvent; googleUrl: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    // A row at the bottom of a phone screen would open its menu out of sight.
    menuRef.current?.scrollIntoView({ block: "nearest" });
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const chose = (via: "ics" | "google") => {
    track("add-to-calendar", { via, mode: event.mode });
    // Close once the click has done its work. A link taken out of the page
    // during its own click isn't guaranteed to open in every browser.
    setTimeout(() => {
      setOpen(false);
      buttonRef.current?.focus();
    });
  };

  return (
    <div
      className="addcal"
      ref={wrapRef}
      onBlur={(e) => {
        // Tabbing out closes it. A click elsewhere is handled above: Safari
        // doesn't focus a clicked button, so relatedTarget is empty there and
        // closing on it would swallow the click on an option.
        const next = e.relatedTarget as Node | null;
        if (next && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="addcal-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Add ${event.event} to your calendar`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title="Add to your calendar"
      >
        <span className="addcal-label">+ Cal</span>
      </button>
      {open ? (
        <div className="addcal-menu" id={menuId} ref={menuRef}>
          <button
            type="button"
            className="addcal-option"
            onClick={() => {
              downloadEventICal(event);
              chose("ics");
            }}
          >
            Apple or Outlook (.ics) <span aria-hidden="true">↓</span>
          </button>
          <a
            className="addcal-option"
            href={googleUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => chose("google")}
            aria-label="Google Calendar, opens in a new tab"
          >
            Google Calendar <span aria-hidden="true">↗</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function EventRow({
  event,
  daysUntil,
  past = false,
  picked = false,
  onTogglePick,
  isCurator = false,
  note,
  onSetNote,
}: Props) {
  const label = flagLabel(event.flag);
  const cost = formatCost(event.cost);
  const timeStr = formatTimeRange(event.start, event.end);
  const countdown =
    typeof daysUntil === "number" ? formatDaysUntil(daysUntil) : null;
  const countdownClass =
    typeof daysUntil === "number"
      ? daysUntil < 0
        ? "countdown-past"
        : daysUntil === 0
          ? "countdown-today"
          : daysUntil <= 3
            ? "countdown-soon"
            : "countdown-far"
      : "";
  // Nothing to add once it's over. A date that can't be read has no link.
  const googleUrl = past ? null : googleCalendarUrl(event);

  return (
    <div
      className={`event-row cat-${event.category}${past ? " is-past" : ""}${picked ? " is-picked" : ""}`}
    >
      {onTogglePick ? (
        <button
          type="button"
          className={`pick-btn${picked ? " picked" : ""}`}
          onClick={onTogglePick}
          aria-label={picked ? "Remove from picks" : "Add to picks"}
          aria-pressed={picked}
          title={picked ? "Remove from picks" : "Add to picks"}
        >
          {picked ? "★" : "☆"}
        </button>
      ) : null}
      <div className="event-day">
        <span className="event-day-name">{event.day}</span>
        <span>{event.date}</span>
        {timeStr ? <span className="event-time">{timeStr}</span> : null}
        {countdown ? (
          <span className={`countdown ${countdownClass}`}>{countdown}</span>
        ) : null}
      </div>
      <div className="event-main">
        <div className="event-title">
          {event.url ? (
            <a href={event.url} target="_blank" rel="noreferrer">
              {event.event}
            </a>
          ) : (
            event.event
          )}
        </div>
        <div className="event-where">{event.where}</div>
        {/* Upcoming only: notes on past events were never reviewed for the
            public and some are private planning ("Tickets bought."). */}
        {isPublicNote(event.note) && !past ? (
          <div className="event-note" title={event.note}>
            {event.note}
          </div>
        ) : null}
        {isCurator && picked && onSetNote ? (
          <input
            type="text"
            className="curator-note-input"
            defaultValue={note ?? ""}
            placeholder="Add a curator note — why this one…"
            onBlur={(e) => onSetNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : note ? (
          <div className="event-picknote">{note}</div>
        ) : null}
      </div>
      {cost ? (
        <div className={`event-cost cost-${cost.kind}`}>{cost.text}</div>
      ) : (
        <span />
      )}
      <span className={`pill pill-${event.category}`}>{event.category}</span>
      {label ? (
        <span className={`flag flag-${event.flag}`}>{label}</span>
      ) : (
        <span />
      )}
      {googleUrl ? <AddToCalendar event={event} googleUrl={googleUrl} /> : null}
    </div>
  );
}
