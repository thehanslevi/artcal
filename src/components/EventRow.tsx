import type { CalEvent } from "../types";

interface Props {
  event: CalEvent;
  conflict?: boolean;
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
  if (!end) return formatTime(start);
  return `${formatTime(start)}–${formatTime(end)}`;
}

export function EventRow({ event, conflict = false }: Props) {
  const label = flagLabel(event.flag);
  const isFree = event.cost.toUpperCase() === "FREE";
  const timeStr = formatTimeRange(event.start, event.end);
  const modeChip = event.mode === "make" ? "make" : null;

  return (
    <div className={`event-row cat-${event.category}${conflict ? " has-conflict" : ""}`}>
      <div className="event-day">
        <span className="event-day-name">{event.day}</span>
        <span>{event.date}</span>
        {timeStr ? <span className="event-time">{timeStr}</span> : null}
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
          {modeChip ? <span className="mode-chip">make</span> : null}
          {conflict ? <span className="conflict-chip">time conflict</span> : null}
        </div>
        {event.note ? <div className="event-note">{event.note}</div> : null}
        <div className="event-where">{event.where}</div>
      </div>
      <div className={`event-cost${isFree ? " free" : ""}`}>{event.cost}</div>
      <span className={`pill pill-${event.category}`}>{event.category}</span>
      {label ? (
        <span className={`flag flag-${event.flag}`}>{label}</span>
      ) : (
        <span />
      )}
    </div>
  );
}
