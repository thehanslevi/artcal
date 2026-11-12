# Art Cal

Built by Hannah Levinson • more at [hrlevinson.com](https://hrlevinson.com)

**A personal calendar for making and seeing art in New York.**

Live: https://nyc-art-cal.vercel.app

Subscribe from Google Calendar or Apple Calendar:
- All events → `/feed.ics`
- Just shows to attend → `/feed-attend.ics`
- Just classes and workshops → `/feed-practice.ics`

---

## Why I built it

I wanted a personalized instrument for moving through the artworld and my own art practice in New York.

## What it is

- A weekly calendar of events across media and venues including theatre, dance, film, music, workshops, readings, and more.
- Two modes: **Make** (classes and workshops) and **Witness** (shows and screenings).
- A picks / shortlist system with passphrase-based cross-device sync: star on your phone, see it on your laptop.
- A self-updating ICS feed.

## What it does

- **Groups events by week, one week at a time by default.** auto-focuses on the current week; arrows to move; jump-to-week dropdown.
- **Every event carries structured metadata:** category, mode, start / end time, category-color left border.
- **Weekly summary strip:** event count, cost range, making %, picked count and cost.
- **Past events dim and hide by default** with a "show past" toggle.
- **Places to make / see things:** comprehensive list of venues also provided as an ongoing resource, collapsed below the calendar.
- **Cross-device picks sync via Supabase**, keyed to a passphrase hash, no account, no email.
- **Filterable exportable feeds** that GCal auto-refreshes.

## The categories

- **sound:** concerts, sound art, opera
- **dance:** dance classes and shows
- **film:** screenings, workshops
- **tech:** hardware, generative visuals, live-coding
- **make:** book arts, darkroom, printmaking, woodworking
- **stage:** performance art, theatre
- **word:** readings, writing groups
- **circle:** communal meals, meditations, social practice

## What Art Cal is not

- **Not a listings site.** It's a curated personal map, not a scraped aggregator.
- **Not a social product.** The picks-sync is one person's picks shared across their own devices. No feed, other people, or sharing links.
- **Not automated.** New events go in by editing a JSON in a GitHub web editor. No scraping cron, no email-parsing pipeline (for now).

## How it's specific to me

The tech build is generic; what's included in the calendar is a reflection of my personal practice and preferences.

Fork the code, rewrite the JSON.

## How it's built

- **Vite + React + TypeScript**, strict mode, no CSS framework, hand-written stylesheet on CSS custom properties.
- **All events in JSON:** `src/data/events.json`, `spaces.json`, `fall.json`. I edit these directly in GitHub's web editor and commit, no admin UI, no forms.
- **Supabase for picks sync.** SHA-256 hash of a user-chosen passphrase is the row key. The passphrase is never sent to the server, only its hash. Nothing else is stored in the backend.
- **Build-time ICS generation.** A `tsx` script (`scripts/generate-feeds.ts`) runs after Vite build and emits three `.ics` files into `dist/`, served with `Content-Type: text/calendar` from Vercel via `vercel.json`.
- **Stable event UIDs** derived from date + slug of event name, so calendar apps update existing events instead of duplicating them on each refresh.
- **Today-aware everywhere.** Days-until countdowns on events, current-week highlight, past-event dimming, all keyed to `today()` at load.
- **Deployed on Vercel** with continuous deploy from `main`. Editing JSON on GitHub triggers a Vercel rebuild within a minute; GCal picks up feed changes on its next refresh (typically 12–24 hours).

## Scanning

A scheduled GitHub Action (`scripts/scan-events.ts`) sweeps the venue list in `scripts/scanner/venues.ts` and extracts upcoming events. It tries the cheapest, most reliable source first and only falls back when it must:

1. **Published iCal feeds** (`icsUrl` on a venue): parsed directly, no LLM.
2. **JSON-LD** structured data on the listing page.
3. **Detail-page crawl:** follows event links to pages that carry JSON-LD even when the listing doesn't.
4. **Platform parsers:** server-rendered Squarespace event lists and WordPress "The Events Calendar" markup.
5. **LLM extraction:** last resort for JS-rendered venues with no structured data.

Every candidate passes gates (real future date present in source, title tokens present, valid category/mode) and a fuzzy dedupe check; dense performance runs collapse to one opening-night entry. An LLM reading also has to show the title and the date together on the page, and keeps its link only if that link is on the page it read. Anything in `scripts/scanner/removed-events.json` is rejected, so a listing taken down stays down.

### No-pay LLM setup

Step 5 uses whichever free API key is present, preferring the largest free tier. Set **one** as a GitHub Actions secret:

- `GROQ_API_KEY`: [Groq](https://console.groq.com) free tier (thousands of requests/day; covers every LLM-needing venue each run). **Recommended.**
- `CEREBRAS_API_KEY` (+ optional `CEREBRAS_MODEL`, default `llama-3.3-70b`): [Cerebras](https://cloud.cerebras.ai) free tier; a strong alternative if Groq signup is down.
- `GOOGLE_API_KEY`: Gemini free tier (~20 requests/day; venues rotate across runs via `scan-state.json`).
- `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_API_KEY` (+ optional `OPENAI_COMPAT_MODEL`): any OpenAI-compatible endpoint (OpenRouter, Together, …).

With no key set, steps 1–4 still run, so feed/JSON-LD/CMS venues keep updating for free.

## Keeping it accurate

Four scheduled jobs keep what's listed true. Each one fixes what it safely can and puts the rest in front of a person.

| When | Job | What it does |
|---|---|---|
| Sunday | Scan events | Adds new events. Won't push a calendar that fails `validate-events.ts`. |
| After each scan, and Wednesday | Check events | Opens every upcoming listing's own page. Two checks in a row with the page gone, or not listing that event on that date, and the listing comes down into `removed-events.json` with the reason. Stops itself if more than a quarter fail at once (that's an outage, not bad listings). Sets "Last verified" when it has read everything. |
| Monday | Refresh practices | Confirms every Directory link still answers; sets the Directory's "Updated" date. |
| Thursday | Discover practices | Reads every Directory row's site, checks its listed price is still there, proposes changes, and opens the "Directory proposals" issue with every row that didn't pass. |

**Prices and links:** Check events fills in the price of a listing still at TBD when its page states one, and replaces a link to a venue's calendar with the event's own page. `npm run events:prices` does the same on demand.

**When the "Directory proposals" issue is open:** run `npm run practices:review`. Accept or reject each proposal. For a row that didn't pass, open its site: fix the link or price, or take the row out. A row stays marked "Last checked …" on the site until it passes again.

**To take an event down by hand:** move it from `src/data/events.json` into `scripts/scanner/removed-events.json` with a `why`. Deleting it alone isn't enough; the next scan would find it again.

**After changing the title rule** (`src/lib/title.ts`): `npm run events:tidy`, then read the changes before committing.

`npm run lint` checks all of it: titles, removed events, Directory dates and fields, and the tests.

## Editing

Any event or venue lives in `src/data/`. Edit in the GitHub web editor, click Commit, Vercel rebuilds automatically and your subscribed calendar reflects the change on its next refresh cycle.

## Where it lives

- **App:** https://nyc-art-cal.vercel.app
- **Author:** [hrlevinson.com](https://hrlevinson.com)
