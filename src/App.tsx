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
  fetchByHash,
  fetchPicks,
  generateToken,
  hashPassphrase,
  loadPassphrase,
  savePassphrase,
  uploadNotes,
  uploadPicks,
  type PickNotes,
} from "./lib/sync";
import { CURATOR_HASH } from "./lib/curator";
import { matchesTab } from "./lib/tab";
import { Calendar } from "./components/Calendar";
import { ExportButton } from "./components/ExportButton";
import { FilterBar, computeCategoryCounts } from "./components/FilterBar";
import { Spaces } from "./components/Spaces";
import { SubscribePanel } from "./components/SubscribePanel";
import { SubmitPanel } from "./components/SubmitPanel";
import { CuratorPicks } from "./components/CuratorPicks";
import { Directory } from "./components/Directory";
import { SyncPanel, type SyncStatus } from "./components/SyncPanel";

// The two halves of "Making × Witnessing" have different native shapes, so they
// get different data models rather than one `mode` field.
//   Making     — standing practices (practices.json). Derived, never scraped.
//   Witnessing — dated events (events.json). Scraped, because shows publish dates.
type View = "making" | "witnessing";

const data = eventsData as EventsData;
const ALL_EVENTS: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);

const TODAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const UPLOAD_DEBOUNCE_MS = 1500;

function App() {
  // Default to Making — the calendar's reason for being is creative practice,
  // and the venue mix skews heavily toward witness events, so lead with making.
  const [view, setView] = useState<View>("making");
  // The top-level Making/Witnessing switch replaced the old TabBar, which used
  // the same two words one level down and disagreed with it.
  //
  // The real split is now standing practices (Directory) vs dated events (this
  // calendar), not make vs witness. So this view shows every dated event:
  // filtering to "attend" would strand the 79 make-mode events, including
  // starred ones already in someone's subscribed feed.
  const tab: TabMode = "all";
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [picksOnly, setPicksOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [picks, setPicks] = useState<Set<string>>(() => loadPicks());
  const [passphrase, setPassphrase] = useState<string | null>(() => loadPassphrase());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [weekendOnly, setWeekendOnly] = useState(false);
  const [isCurator, setIsCurator] = useState(false);
  const [notes, setNotes] = useState<PickNotes>({});
  const todayLabel = useMemo(() => TODAY_FMT.format(today()), []);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextUpload = useRef(false);

  // Detect the curator (the passphrase whose hash matches CURATOR_HASH) and,
  // if so, load their existing notes so the inline editor is prefilled.
  useEffect(() => {
    if (!passphrase) {
      setIsCurator(false);
      setNotes({});
      return;
    }
    let cancelled = false;
    (async () => {
      const curator = (await hashPassphrase(passphrase)) === CURATOR_HASH;
      if (cancelled) return;
      setIsCurator(curator);
      if (curator) {
        const { notes: remoteNotes } = await fetchByHash(CURATOR_HASH);
        if (!cancelled) setNotes(remoteNotes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passphrase]);

  const handleSetNote = useCallback(
    (id: string, text: string) => {
      if (!passphrase) return;
      setNotes((prev) => {
        const next = { ...prev };
        if (text.trim()) next[id] = text.trim();
        else delete next[id];
        if (notesTimer.current) clearTimeout(notesTimer.current);
        notesTimer.current = setTimeout(() => {
          uploadNotes(passphrase, next).catch(() => {});
        }, UPLOAD_DEBOUNCE_MS);
        return next;
      });
    },
    [passphrase],
  );

  useEffect(() => {
    savePicks(picks);
  }, [picks]);

  useEffect(() => {
    if (!passphrase) return;
    let cancelled = false;
    (async () => {
      setSyncStatus({ kind: "syncing" });
      try {
        const curator = (await hashPassphrase(passphrase)) === CURATOR_HASH;
        const remote = await fetchPicks(passphrase);
        if (cancelled) return;
        if (curator) {
          // The curator's row IS the public "Don't miss" list, so never merge
          // this browser's casual local stars into it — remote is authoritative.
          // Don't miss then shows ONLY events deliberately starred as curator.
          skipNextUpload.current = true;
          setPicks(new Set(remote ?? []));
        } else if (remote && remote.length > 0) {
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
      const curator = (await hashPassphrase(passphrase)) === CURATOR_HASH;
      const remote = await fetchPicks(passphrase);
      if (curator) {
        // Curator: remote is authoritative; don't push local stars up (see the
        // passphrase sync effect above).
        skipNextUpload.current = true;
        setPicks(new Set(remote ?? []));
        setSyncStatus({ kind: "synced", at: new Date() });
        return;
      }
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
              <h1 className="app-title">
                Art Cal
                <span className="app-title-tag">(Making × Witnessing)</span>
              </h1>
              <p className="app-subtitle">
                Classes, collaborations, shows, studios
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
          <p className="howto">
            Star <span className="howto-star">★</span> anything you want, then{" "}
            <button
              type="button"
              className="howto-link"
              onClick={handleCreateLink}
            >
              get a calendar link
            </button>{" "}
            — no account. It stays current in Google or Apple Calendar.
          </p>
        </div>
      </header>
      <nav className="zone zone-band">
        <div className="zone-inner">
          <div className="view-switch" role="tablist" aria-label="Making or Witnessing">
            <button
              type="button"
              role="tab"
              aria-selected={view === "making"}
              className={`view-btn${view === "making" ? " active" : ""}`}
              onClick={() => setView("making")}
            >
              Making
            </button>
            <span className="view-x">×</span>
            <button
              type="button"
              role="tab"
              aria-selected={view === "witnessing"}
              className={`view-btn${view === "witnessing" ? " active" : ""}`}
              onClick={() => setView("witnessing")}
            >
              Witnessing
            </button>
          </div>
        </div>
      </nav>
      <main className="zone zone-main">
        <div className="zone-inner">
      {view === "making" ? <Directory /> : (
      <>
      <CuratorPicks />
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
        <button
          type="button"
          className={`weekend-toggle${weekendOnly ? " active" : ""}`}
          onClick={() => setWeekendOnly((v) => !v)}
          aria-pressed={weekendOnly}
          title={
            weekendOnly ? "Show all dates" : "Show only this weekend"
          }
        >
          This weekend
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
        weekendOnly={weekendOnly}
        onTogglePick={togglePick}
        isCurator={isCurator}
        notes={notes}
        onSetNote={handleSetNote}
      />
      </>
      )}
        </div>
      </main>
      <footer className="zone zone-footer">
        <div className="zone-inner">
          <div className="about">
            <p className="about-title">About</p>
            <p className="about-text">
              Curated calendar of opportunities to both deepen one's artistic
              practice and experience some of the best of what's on offer in
              NYC. Maintained by H.R. Levinson (AI builder, film- and
              theatre-maker, funny philosopher, Prospect Heights denizen).{" "}
              <button
                type="button"
                className="about-submit-link"
                onClick={() => setSubmitOpen(true)}
              >
                Share what you want to see or what you're working on
              </button>{" "}
              and I'll include it here and in the newsletter.
            </p>
          </div>
          {/* On Making, the Directory is the venue list; two would compete. */}
          {view === "witnessing" ? <Spaces filter={filter} tab={tab} /> : null}
          <div className="footer-bar">
            <span>Art Cal (Making × Witnessing)</span>
            <SubmitPanel open={submitOpen} onOpenChange={setSubmitOpen} />
            <span>Last verified {data.lastVerified}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
