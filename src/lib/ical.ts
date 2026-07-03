import type { CalEvent } from "../types";

const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const YEAR = 2026;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function icsDate(month: number, day: number): string {
  return `${YEAR}${pad(month)}${pad(day)}`;
}

function icsDateTime(month: number, day: number, hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${YEAR}${pad(month)}${pad(day)}T${h}${m}00`;
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function nowStamp(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

export function buildICal(events: CalEvent[]): string {
  const stamp = nowStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NYC Creative Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  events.forEach((e, i) => {
    const parts = e.date.split(" ");
    const month = MONTHS[parts[0] ?? ""];
    const day = Number(parts[1]);
    if (!month || !day) return;
    const uid = `${YEAR}${pad(month)}${pad(day)}-${i}@nyc-creative-calendar`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    if (e.start) {
      lines.push(
        `DTSTART;TZID=America/New_York:${icsDateTime(month, day, e.start)}`,
      );
      const endTime = e.end ?? addHours(e.start, 2);
      lines.push(
        `DTEND;TZID=America/New_York:${icsDateTime(month, day, endTime)}`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(month, day)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.event)}`);
    lines.push(`LOCATION:${escapeText(e.where)}`);
    const descParts: string[] = [];
    if (e.note) descParts.push(e.note);
    descParts.push(`Cost: ${e.cost}`);
    descParts.push(`Category: ${e.category} · ${e.mode}`);
    lines.push(`DESCRIPTION:${escapeText(descParts.join("\n"))}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${pad(nh)}:${pad(nm)}`;
}

export function downloadICal(
  events: CalEvent[],
  filename = "nyc-creative-calendar.ics",
): void {
  const ics = buildICal(events);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
