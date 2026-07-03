# NYC Art Practice & Programming Calendar

Built by Hannah Levinson • more at [hrlevinson.com](https://hrlevinson.com)

**A personal calendar for a summer-and-fall of making and seeing art in New York.**

Live: https://nyc-art-practice-programming.vercel.app

Subscribe from Google Calendar or Apple Calendar:
- All events → `/feed.ics`
- Just shows to attend → `/feed-attend.ics`
- Just classes and workshops → `/feed-practice.ics`

---

## Why I built it

I wanted to leave a summer of analyzing / consuming / reacting to art and enter a summer of doing and making it. That meant more classes, more open studios, more participatory work — and the discipline to see fewer concerts so the balance actually shifted.

Every existing tool for NYC arts programming is a listing site. Time Out has everything. Broadway World, DoNYC, StageSpotlightNYC. None of them let me hold my own map: my anchors, my picks, the venues I keep returning to, the fall horizon I'm planning toward. None of them let me *see* how much of a given week is watching vs. making.

So this is that map. It's specific to me. The shape of it — mode-first, venue-first, picks-first — could work for anyone else running a single-user creative practice plan, but the data would need to be rewritten.

## What it is

- A weekly calendar of ~170 dated events across ~45 NYC venues — theater, dance, film, music, workshops, readings, community.
- Two modes: **Practice** (classes and workshops, `mode: make`) and **Attend** (shows and screenings, `mode: watch`).
- A picks / shortlist system with passphrase-based cross-device sync — star on my phone, see it on my laptop.
- A self-updating ICS feed so the whole thing lives in Google Calendar alongside everything else.

## What it does

- **Groups events by week, one week at a time by default.** Auto-focuses on the current week; arrows to move; jump-to-week dropdown.
- **Every event carries structured metadata:** category, mode, start / end time, category-color left border.
- **Weekly summary strip:** event count, cost range, making %, picked count and cost.
- **Time conflict detection:** two events overlapping on the same day get a warning chip.
- **Past events dim and hide by default** with a "show past" toggle.
- **Places to make / see things:** every venue as an ongoing resource, collapsed below the calendar so it doesn't wall off the events.
- **Cross-device picks sync via Supabase**, keyed to a passphrase hash — no account, no email.
- **Filterable exportable feeds** that GCal auto-refreshes.

## The categories

I made up eight because the standard "music / theater / dance / film" split hides the differences I care about:

- **sound** — concerts, experimental music, opera
- **dance** — dance shows and classes
- **film** — screenings, workshops, cinemas
- **tech** — live-coding, generative visuals, AI, hardware
- **make** — printmaking, book arts, woodworking, darkroom
- **stage** — theater, performance, clown
- **word** — writing groups, readings, poetry
- **circle** — social practice, hospitality, contemplation

Each shows in a distinct color so I can scan a week in a second.

## What it is not

- **Not a listings site.** It's a curated personal map. Every entry landed here because I directly verified it on the venue's own site — not from a scraped aggregator.
- **Not a social product.** The picks-sync is one person's picks shared across their own devices. No feed, no other people, no sharing links.
- **Not automated.** New events go in by editing JSON in the GitHub web editor. No scraping cron, no email-parsing pipeline. The friction of adding an event forces me to consider whether it belongs.

## How it's specific to me

- **Crown Heights-anchored.** Notes flag which venues are walkable or bikeable from my neighborhood; anything past 30 minutes gets an honest travel note.
- **Dance is narrow and personal.** Only breaking, voguing, afro, house, waacking, k-pop, heels. No contemporary, no modern, no partner dance (I already know bachata / salsa / tango).
- **Attend tilts avant-garde, downtown, experimental.** The theater ecosystem I care about is The Brick, The Tank, HERE, Target Margin, JACK, Wendy's Subway, Bushwick Starr, and the constellation around them.
- **The fall / winter horizon points at Prototype, Under the Radar, Exponential, PhysFest** — the January festival cluster is treated as a roadmap, not just a note.

Fork it and the engine will still work; the map won't. Rewrite the JSON.

## How it's built

- **Vite + React + TypeScript**, strict mode, no CSS framework — hand-written stylesheet on CSS custom properties.
- **All events in JSON** — `src/data/events.json`, `spaces.json`, `anchors.json`, `decisions.json`, `fall.json`. I edit these directly in GitHub's web editor and commit — no admin UI, no forms.
- **Supabase for picks sync.** SHA-256 hash of a user-chosen passphrase is the row key. The passphrase is never sent to the server, only its hash. Nothing else is stored in the backend.
- **Build-time ICS generation.** A `tsx` script (`scripts/generate-feeds.ts`) runs after Vite build and emits three `.ics` files into `dist/`, served with `Content-Type: text/calendar` from Vercel via `vercel.json`.
- **Stable event UIDs** derived from date + slug of event name, so calendar apps update existing events instead of duplicating them on each refresh.
- **Today-aware everywhere.** Days-until countdowns on events and decisions, current-week highlight, past-event dimming — all keyed to `today()` at load.
- **Deployed on Vercel** with continuous deploy from `main`. Editing JSON on GitHub triggers a Vercel rebuild within a minute; GCal picks up feed changes on its next refresh (typically 12–24 hours).

## Editing

Any event, venue, decision, or fall-horizon item lives in `src/data/`. Edit in the GitHub web editor, click Commit — Vercel rebuilds automatically and your subscribed calendar reflects the change on its next refresh cycle.

## Where it lives

- **App:** https://nyc-art-practice-programming.vercel.app
- **Author:** [hrlevinson.com](https://hrlevinson.com)
