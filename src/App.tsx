import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import eventsData from "./data/events.json";
import type {
  CalEvent,
  CategoryFilter,
  EventsData,
  TabMode,
} from "./types";
import { isFree } from "./lib/cost";
import { today } from "./lib/dates";
import { loadPicks, pickId, savePicks } from "./lib/picks";
import {
  fetchPicks,
  generateToken,
  loadPassphrase,
  savePassphrase,
  uploadPicks,
} from "./lib/sync";
import { matchesTab } from "./lib/tab";
import { Calendar } from "./components/Calendar";
import { ExportButton } from "./components/ExportButton";
import { FilterBar, computeCategoryCounts } from "./components/FilterBar";
import { Spaces } from "./components/Spaces";
import { SubscribePanel } from "./components/SubscribePanel";
import { SyncPanel, type SyncStatus } from "./components/SyncPanel";
import { TabBar } from "./components/TabBar";

const data = eventsData as EventsData;
const ALL_EVENTS: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);

const TODAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const UPLOAD_DEBOUNCE_MS = 1500;

function App() {
  const [tab, setTab] = useState<TabMode>("all");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [picksOnly, setPicksOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [picks, setPicks] = useState<Set<string>>(() => loadPicks());
  const [passphrase, setPassphrase] = useState<string | null>(() => loadPassphrase());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const todayLabel = useMemo(() => TODAY_FMT.format(today()), []);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextUpload = useRef(false);

  useEffect(() => {
    savePicks(picks);
  }, [picks]);

  useEffect(() => {
    if (!passphrase) return;
    let cancelled = false;
    (async () => {
      setSyncStatus({ kind: "syncing" });
      try {
        const remote = await fetchPicks(passphrase);
        if (cancelled) return;
        if (remote && remote.length > 0) {
          const merged = new Set<string>([...loadPicks(), ...remote]);
          skipNextUpload.current = true;
          setPicks(merged);
          await uploadPicks(passphrase, Array.from(merged));
        } else {
          const local = Array.from(loadPicks());
          await uploadPicks(passphrase, local);
        }
        if (!cancelled) setSyncStatus({ kind: "synced", at: new Date() });
      } catch (err) {
        if (!cancelled) {
          setSyncStatus({
            kind: "error",
            message: err instanceof Error ? err.message : "Sync failed",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passphrase]);

  useEffect(() => {
    if (!passphrase) return;
    if (skipNextUpload.current) {
      skipNextUpload.current = false;
      return;
    }
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(async () => {
      setSyncStatus({ kind: "syncing" });
      try {
        await uploadPicks(passphrase, Array.from(picks));
        setSyncStatus({ kind: "synced", at: new Date() });
      } catch (err) {
        setSyncStatus({
          kind: "error",
          message: err instanceof Error ? err.message : "Sync failed",
        });
      }
    }, UPLOAD_DEBOUNCE_MS);
    return () => {
      if (uploadTimer.current) clearTimeout(uploadTimer.current);
    };
  }, [picks, passphrase]);

  const togglePick = useCallback((id: string) => {
    setPicks((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSetPassphrase = useCallback(async (next: string | null) => {
    savePassphrase(next);
    setPassphrase(next);
    if (next === null) {
      setSyncStatus({ kind: "idle" });
    }
  }, []);

  // One-click personal calendar: mint a secret token as the passphrase if
  // none exists (the sync effect then uploads picks), and show the feed URL.
  const handleCreateLink = useCallback(() => {
    if (!passphrase) {
      const token = generateToken();
      savePassphrase(token);
      setPassphrase(token);
    }
    setSubscribeOpen(true);
  }, [passphrase]);

  const handleSyncNow = useCallback(async () => {
    if (!passphrase) return;
    setSyncStatus({ kind: "syncing" });
    try {
      const remote = await fetchPicks(passphrase);
      const local = new Set(loadPicks());
      if (remote) {
        for (const p of remote) local.add(p);
      }
      const arr = Array.from(local);
      await uploadPicks(passphrase, arr);
      skipNextUpload.current = true;
      setPicks(local);
      setSyncStatus({ kind: "synced", at: new Date() });
    } catch (err) {
      setSyncStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Sync failed",
      });
    }
  }, [passphrase]);

  const counts = useMemo(() => {
    const scoped = ALL_EVENTS.filter((e) => matchesTab(tab, e.mode))
      .filter((e) => !picksOnly || picks.has(pickId(e)))
      .filter((e) => !freeOnly || isFree(e));
    return computeCategoryCounts(scoped);
  }, [tab, picks, picksOnly, freeOnly]);

  const pickCount = picks.size;
  const freeCount = useMemo(
    () =>
      ALL_EVENTS.filter((e) => matchesTab(tab, e.mode))
        .filter((e) => !picksOnly || picks.has(pickId(e)))
        .filter(isFree).length,
    [tab, picks, picksOnly],
  );

  return (
    <div className="app">
      <header className="zone zone-header">
        <div className="zone-inner">
          <div className="app-header-row">
            <div>
              <h1 className="app-title">NYC Art Practice &amp; Programming Calendar</h1>
              <p className="app-subtitle">
                Summer–Fall 2026 — classes, studios, shows across NYC.
              </p>
              <p className="verified">
                Today {todayLabel} · last verified {data.lastVerified}
              </p>
            </div>
            <div className="header-actions">
              <SubscribePanel
                open={subscribeOpen}
                onOpenChange={setSubscribeOpen}
                passphrase={passphrase}
                pickCount={picks.size}
                onCreateLink={handleCreateLink}
              />
              <SyncPanel
                passphrase={passphrase}
                onSet={handleSetPassphrase}
                onSyncNow={handleSyncNow}
                status={syncStatus}
              />
            </div>
          </div>
          <ol className="howto">
            <li className="howto-step">
              <span className="howto-num howto-num-1">1</span>
              Star <span className="howto-star">★</span> the events you want
            </li>
            <li className="howto-step">
              <span className="howto-num howto-num-2">2</span>
              <button
                type="button"
                className="howto-link"
                onClick={handleCreateLink}
              >
                Get your calendar link
              </button>
              — one click, no account
            </li>
            <li className="howto-step">
              <span className="howto-num howto-num-3">3</span>
              Subscribe in Google/Apple Cal — it updates itself
            </li>
          </ol>
        </div>
      </header>
      <nav className="zone zone-band">
        <div className="zone-inner">
          <TabBar active={tab} onChange={setTab} />
        </div>
      </nav>
      <main className="zone zone-main">
        <div className="zone-inner">
      <div className="filter-row">
        <FilterBar active={filter} onChange={setFilter} counts={counts} />
        <button
          type="button"
          className={`picks-toggle${picksOnly ? " active" : ""}`}
          onClick={() => setPicksOnly((v) => !v)}
          aria-pressed={picksOnly}
          disabled={pickCount === 0 && !picksOnly}
          title={
            pickCount === 0
              ? "No picks yet"
              : picksOnly
                ? "Show all events"
                : "Show only my picks"
          }
        >
          ★ Picks <span>({pickCount})</span>
        </button>
        <button
          type="button"
          className={`free-toggle${freeOnly ? " active" : ""}`}
          onClick={() => setFreeOnly((v) => !v)}
          aria-pressed={freeOnly}
          disabled={freeCount === 0 && !freeOnly}
          title={
            freeOnly ? "Show all events" : "Show only free/no-cost events"
          }
        >
          Free <span>({freeCount})</span>
        </button>
        <ExportButton
          filter={filter}
          tab={tab}
          picks={picks}
          picksOnly={picksOnly}
          freeOnly={freeOnly}
        />
      </div>
      <Calendar
        filter={filter}
        tab={tab}
        picks={picks}
        picksOnly={picksOnly}
        freeOnly={freeOnly}
        onTogglePick={togglePick}
      />
        </div>
      </main>
      <footer className="zone zone-footer">
        <div className="zone-inner">
          <div className="about">
            <p className="about-title">About</p>
            <p className="about-text">
              A hand-checked calendar of NYC's artist-run corners — workshops,
              small-room theatre, riso and print, noise shows, readings. The
              filter: things you do or see up close, mostly cheap, never an
              arena. Kept by Hans — AI builder, film- and theatre-maker, funny
              philosopher; recently, a black metal choral musical.{" "}
              <a href="mailto:thehanslevi@proton.me?subject=Event%20for%20the%20calendar&body=What%3A%0AWhen%3A%0AWhere%3A%0ACost%3A%0ALink%3A%0A">
                Send me things worth listing
              </a>
              .
            </p>
          </div>
          <Spaces filter={filter} tab={tab} />
          <div className="footer-bar">
            <span>NYC Art Practice &amp; Programming Calendar</span>
            <a
              className="footer-submit"
              href="mailto:thehanslevi@proton.me?subject=Event%20for%20the%20calendar&body=What%3A%0AWhen%3A%0AWhere%3A%0ACost%3A%0ALink%3A%0A"
            >
              Submit an event
            </a>
            <span>Last verified {data.lastVerified}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
