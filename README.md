# Art Cal (Making × Witnessing)

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

- A weekly calendar of events across venues including theatre, dance, film, music, workshops, readings, and more.
- Two modes: **Practice** (classes and workshops, `mode: make`) and **Attend** (shows and screenings, `mode: witness`).
- A picks / shortlist system with passphrase-based cross-device sync: star on my phone, see it on my laptop.
- A self-updating ICS feed so the whole thing lives in Google Calendar alongside everything else.

## What it does

- **Groups events by week, one week at a time by default.** Auto-focuses on the current week; arrows to move; jump-to-week dropdown.
- **Every event carries structured metadata:** category, mode, start / end time, category-color left border.
- **Weekly summary strip:** event count, cost range, making %, picked count and cost.
- **Past events dim and hide by default** with a "show past" toggle.
- **Places to make / see things:** every venue as an ongoing resource, collapsed below the calendar so it doesn't wall off the events.
- **Cross-device picks sync via Supabase**, keyed to a passphrase hash, no account, no email.
- **Filterable exportable feeds** that GCal auto-refreshes.

## The categories

- **sound:** concerts, sound art, opera
- **dance:** dance shows and classes
- **film:** screenings, workshops
- **tech:** live-coding, generative visuals, AI, hardware
- **make:** printmaking, book arts, woodworking, darkroom
- **stage:** theatre, performance
- **word:** writing groups, readings
- **circle:** social practice, communal meals, meditation

Each shows in a distinct color so I can scan a week in a second.

## What it is not

- **Not a listings site.** It's a curated personal map. Every entry landed here because I directly verified it on the venue's own site, not from a scraped aggregator.
- **Not a social product.** The picks-sync is one person's picks shared across their own devices. No feed, no other people, no sharing links.
- **Not automated.** New events go in by editing JSON in the GitHub web editor. No scraping cron, no email-parsing pipeline. The friction of adding an event forces me to consider whether it belongs.

## How it's specific to me

The engine is generic. What's on the calendar reflects my personal practice and preferences.

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

Every candidate passes gates (real future date present in source, title tokens present, valid category/mode) and a fuzzy dedupe check; dense performance runs collapse to one entry.

### No-pay LLM setup

Step 5 uses whichever free API key is present, preferring the largest free tier. Set **one** as a GitHub Actions secret:

- `GROQ_API_KEY`: [Groq](https://console.groq.com) free tier (thousands of requests/day; covers every LLM-needing venue each run). **Recommended.**
- `CEREBRAS_API_KEY` (+ optional `CEREBRAS_MODEL`, default `llama-3.3-70b`): [Cerebras](https://cloud.cerebras.ai) free tier; a strong alternative if Groq signup is down.
- `GOOGLE_API_KEY`: Gemini free tier (~20 requests/day; venues rotate across runs via `scan-state.json`).
- `OPENAI_COMPAT_BASE_URL` + `OPENAI_COMPAT_API_KEY` (+ optional `OPENAI_COMPAT_MODEL`): any OpenAI-compatible endpoint (OpenRouter, Together, …).

With no key set, steps 1–4 still run, so feed/JSON-LD/CMS venues keep updating for free.

## Editing

Any event or venue lives in `src/data/`. Edit in the GitHub web editor, click Commit, and Vercel rebuilds automatically and your subscribed calendar reflects the change on its next refresh cycle.

## Where it lives

- **App:** https://nyc-art-cal.vercel.app
- **Author:** [hrlevinson.com](https://hrlevinson.com)
