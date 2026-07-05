import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import events from "../src/data/events.json" with { type: "json" };
import { isFree } from "../src/lib/cost.ts";
import { buildICal } from "../src/lib/ical.ts";
import type { CalEvent, Category, EventsData } from "../src/types.ts";

const data = events as EventsData;
const allEvents: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);

const OUT_DIR = resolve("dist");
mkdirSync(OUT_DIR, { recursive: true });

interface Feed {
  filename: string;
  events: CalEvent[];
  name: string;
  description: string;
}

const feeds: Feed[] = [
  {
    filename: "feed.ics",
    events: allEvents,
    name: "NYC Art Practice & Programming Calendar",
    description:
      "Every event on the NYC Art Practice & Programming Calendar. Classes, workshops, shows, screenings, everything.",
  },
  {
    filename: "feed-attend.ics",
    events: allEvents.filter((e) => e.mode === "witness"),
    name: "NYC Art Practice & Programming Calendar — Attend",
    description:
      "Shows, plays, concerts, screenings — things to witness.",
  },
  {
    filename: "feed-practice.ics",
    events: allEvents.filter((e) => e.mode === "make"),
    name: "NYC Art Practice & Programming Calendar — Practice",
    description: "Classes, workshops, participatory practice.",
  },
  {
    filename: "feed-free.ics",
    events: allEvents.filter(isFree),
    name: "NYC Art Practice & Programming Calendar — Free",
    description: "Only free / no-cost events.",
  },
];

const CATEGORIES: { category: Category; label: string; description: string }[] = [
  { category: "sound", label: "Sound", description: "Concerts, sound art, listening sessions." },
  { category: "dance", label: "Dance", description: "Dance performances and movement practice." },
  { category: "film", label: "Film", description: "Screenings and moving image." },
  { category: "tech", label: "Tech", description: "Creative technology and code." },
  { category: "making", label: "Making", description: "Printmaking, craft, hands-on making." },
  { category: "theatre", label: "Theatre", description: "Plays, performance, live theatre." },
  { category: "literature", label: "Literature", description: "Readings, writing, small press." },
  { category: "community", label: "Community", description: "Gatherings, mutual aid, open studios." },
];

for (const { category, label, description } of CATEGORIES) {
  feeds.push({
    filename: `feed-${category}.ics`,
    events: allEvents.filter((e) => e.category === category),
    name: `NYC Art Practice & Programming Calendar — ${label}`,
    description,
  });
}

console.log("Generating .ics feeds → dist/");
for (const feed of feeds) {
  const ics = buildICal(feed.events, {
    calendarName: feed.name,
    calendarDescription: feed.description,
  });
  writeFileSync(resolve(OUT_DIR, feed.filename), ics, "utf8");
  console.log(`  wrote ${feed.filename} (${feed.events.length} events)`);
}
