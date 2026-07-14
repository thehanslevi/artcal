import { useEffect, useMemo, useState } from "react";
import eventsData from "../data/events.json";
import type { CalEvent, EventsData } from "../types";
import { isPast, parseEventDate, today } from "../lib/dates";
import { formatCost } from "../lib/cost";
import { buildPickIndex, pickId } from "../lib/picks";
import { CURATOR_HASH } from "../lib/curator";
import { fetchByHash, type PickNotes } from "../lib/sync";

const data = eventsData as EventsData;
const ALL: CalEvent[] = data.weeks.flatMap((w) => w.events as CalEvent[]);
// Indexed by every identity an event answers to, so a pick starred before a
// rename or a dedupe merge still resolves here.
const BY_ID = buildPickIndex(ALL);

// The editorial lede: the events the CURATOR has starred (under the shared
// curator passphrase, synced to Supabase — the same identity that powers the
// public "Curated Picks" feed). Starring on the live site is the curation and
// the note is written inline when starring — no data editing anywhere.
export function CuratorPicks() {
  const now = useMemo(() => today(), []);
  const [ids, setIds] = useState<string[] | null>(null);
  const [notes, setNotes] = useState<PickNotes>({});

  useEffect(() => {
    let cancelled = false;
    fetchByHash(CURATOR_HASH)
      .then(({ picks, notes: n }) => {
        if (cancelled) return;
        setIds(picks);
        setNotes(n);
      })
      .catch(() => {
        if (!cancelled) setIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const picks = useMemo(() => {
    if (!ids) return [];
    return ids
      .map((id) => BY_ID.get(id))
      .filter((e): e is CalEvent => !!e)
      .map((e) => ({ e, d: parseEventDate(e.date) }))
      .filter((x) => x.d && !isPast(x.d, now))
      .sort((a, b) => a.d!.getTime() - b.d!.getTime())
      .slice(0, 6)
      .map((x) => x.e);
  }, [ids, now]);

  if (picks.length === 0) return null;

  return (
    <section className="curator" aria-label="Curator's picks">
      <p className="curator-title">Don't miss</p>
      <ul className="curator-list">
        {picks.map((e) => {
          const cost = formatCost(e.cost);
          return (
            <li key={pickId(e)} className={`curator-item cat-${e.category}`}>
              <div className="curator-when">
                {e.day} {e.date}
              </div>
              <div className="curator-body">
                <div className="curator-event">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer">
                      {e.event}
                    </a>
                  ) : (
                    e.event
                  )}
                </div>
                {notes[pickId(e)] ? (
                  <div className="curator-note">{notes[pickId(e)]}</div>
                ) : null}
                <div className="curator-meta">
                  {e.where.split(/[·,]/)[0]?.trim()}
                  {cost ? <span className="curator-cost"> · {cost.text}</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
