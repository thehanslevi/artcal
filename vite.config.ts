import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, normalizePath, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { parseEventDate } from './src/lib/dates.ts'
import type { CalEvent, EventsData } from './src/types.ts'

// The page ships with the events from two weeks before this week's Monday on.
// Everything older is its own chunk, fetched the first time someone turns on
// "Show past" (src/lib/events.ts). Most of events.json is in the past, and most
// visits never ask for it. Scripts and the .ics feeds still read events.json
// whole.
const CURRENT_ID = 'virtual:events-current'
const PAST_ID = 'virtual:events-past'

/**
 * Days before this week's Monday that ship with the page. Starting soon
 * (src/lib/starting.ts) reads the 14 days before a class to tell one starting
 * from one already running, so those days have to be there for every class in
 * its window. A multiple of 7, so weeks stay whole.
 */
export const HISTORY_DAYS = 14

interface Split {
  current: CalEvent[]
  past: CalEvent[]
  lastVerified: string
}

// Today's date in the last timezone on Earth (UTC-12). Vercel builds on UTC
// time, and at 8pm on a Sunday in New York it is already Monday in UTC, so the
// build's own date can be a day ahead of a visitor's. Splitting on the earliest
// date anyone can be on keeps the past chunk past for every visitor.
function earliestDateAnywhere(): Date {
  const t = new Date(Date.now() - 12 * 60 * 60 * 1000)
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

export function splitEvents(data: EventsData, from: Date): Split {
  const all = data.weeks.flatMap((w) => w.events)
  // Whole weeks, Monday to Sunday as the calendar groups them, so a week is
  // never half in one chunk. The current one starts HISTORY_DAYS before the
  // Monday of the week `from` is in.
  const monday = from.getDate() - ((from.getDay() + 6) % 7)
  const cutoff = new Date(from.getFullYear(), from.getMonth(), monday - HISTORY_DAYS)
  const current: CalEvent[] = []
  const past: CalEvent[] = []
  for (const e of all) {
    const d = parseEventDate(e.date)
    // App.tsx lists an event with no readable date as upcoming, so it ships
    // with the page.
    if (d && d < cutoff) past.push(e)
    else current.push(e)
  }

  // Every event in exactly one module. A gap drops events from the site; an
  // overlap lists them twice once the past loads.
  const placed = new Set([...current, ...past])
  const missing = all.filter((e) => !placed.has(e))
  const twice = current.length + past.length - placed.size
  if (missing.length > 0 || twice > 0 || placed.size !== all.length) {
    const sample = missing.slice(0, 5).map((e) => e.uid).join(', ')
    throw new Error(
      `events split: ${all.length} events in events.json became ` +
        `${current.length} current + ${past.length} past. ` +
        `${missing.length} missing${sample ? ` (${sample})` : ''}, ${twice} in both.`,
    )
  }
  return { current, past, lastVerified: data.lastVerified }
}

function eventsSplit(): Plugin {
  let eventsPath = ''
  let cache: { raw: string; split: Split } | null = null
  return {
    name: 'art-cal:events-split',
    configResolved(config) {
      eventsPath = normalizePath(resolve(config.root, 'src/data/events.json'))
    },
    // A fresh date for every build. Within one, both modules share one split.
    buildStart() {
      cache = null
    },
    resolveId(id) {
      if (id === CURRENT_ID || id === PAST_ID) return '\0' + id
    },
    load(id) {
      if (id !== '\0' + CURRENT_ID && id !== '\0' + PAST_ID) return
      // In dev, an edit to events.json reloads both modules.
      this.addWatchFile(eventsPath)
      const raw = readFileSync(eventsPath, 'utf8')
      if (cache?.raw !== raw) {
        const data = JSON.parse(raw) as EventsData
        cache = { raw, split: splitEvents(data, earliestDateAnywhere()) }
      }
      // Plain object literals, as Vite's own JSON import wrote events.json
      // into the bundle. Minified they come out smaller than JSON.parse("...").
      const { current, past, lastVerified } = cache.split
      if (id === '\0' + PAST_ID) return `export default ${JSON.stringify(past)};\n`
      return [
        `export const events = ${JSON.stringify(current)};`,
        `export const lastVerified = ${JSON.stringify(lastVerified)};`,
        `export const pastCount = ${past.length};`,
        '',
      ].join('\n')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), eventsSplit()],
})
