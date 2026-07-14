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

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${pad(nh)}:${pad(nm)}`;
}

export interface BuildICalOptions {
  calendarName?: string;
  calendarDescription?: string;
}

export function buildICal(
  events: CalEvent[],
  options: BuildICalOptions = {},
): string {
  const stamp = nowStamp();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Art Cal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  if (options.calendarName) {
    lines.push(`X-WR-CALNAME:${escapeText(options.calendarName)}`);
  }
  if (options.calendarDescription) {
    lines.push(`X-WR-CALDESC:${escapeText(options.calendarDescription)}`);
  }
  lines.push("X-WR-TIMEZONE:America/New_York");
  lines.push(
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
  );
  const seenUids = new Set<string>();
  for (const e of events) {
    const parts = e.date.split(" ");
    const month = MONTHS[parts[0] ?? ""];
    const day = Number(parts[1]);
    if (!month || !day) continue;
    // Prefer the event's permanent uid. The old scheme derived this from the
    // title, so renaming an event changed its calendar identity and clients
    // treated it as a different event. Falls back to the derived form only for
    // events that predate uids.
    let baseUid = e.uid ?? `${icsDate(month, day)}-${slug(e.event)}`;
    let uid = baseUid;
    let n = 2;
    while (seenUids.has(uid)) {
      uid = `${baseUid}-${n++}`;
    }
    seenUids.add(uid);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}@nyc-creative-calendar`);
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
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICal(
  events: CalEvent[],
  filename = "art-cal.ics",
  options: BuildICalOptions = {},
): void {
  const ics = buildICal(events, options);
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
