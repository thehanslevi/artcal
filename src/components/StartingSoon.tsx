import { useMemo } from "react";
import { today } from "../lib/dates";
import { CURRENT_EVENTS } from "../lib/events";
import { datedSessionsFor } from "../lib/join";
import { PRACTICES } from "../lib/practices";
import { startingSoon } from "../lib/starting";

// datedSessionsFor lists a row's sessions from a date on. From the epoch it
// lists every one the page has, earlier ones included, which is what tells a
// class starting from a class already running.
const EVERY_SESSION = new Date(0);

// Classes and series whose first session is in the next three weeks (see
// lib/starting). Practice only. Renders nothing when nothing qualifies.
export function StartingSoon() {
  const items = useMemo(
    () =>
      startingSoon({
        events: CURRENT_EVENTS,
        practices: PRACTICES,
        eventsAt: (p) => datedSessionsFor(p, EVERY_SESSION),
        today: today(),
      }),
    [],
  );

  if (items.length === 0) return null;

  return (
    <section className="starting" aria-labelledby="starting-title">
      <p className="starting-title" id="starting-title">
        Starting soon
      </p>
      <ul className="starting-list">
        {items.map((it) => {
          const where = [it.venue, it.neighborhood].filter(Boolean).join(" · ");
          return (
            <li
              key={it.key}
              className={`starting-item${it.category ? ` cat-${it.category}` : ""}`}
            >
              <div className="starting-when">{it.when}</div>
              <div className="starting-body">
                <div className="starting-what">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noreferrer">
                      {it.what}
                    </a>
                  ) : (
                    it.what
                  )}
                </div>
                <div className="starting-meta">
                  {where}
                  {it.price ? (
                    <span className="starting-price">
                      {where ? " · " : ""}
                      {it.price}
                    </span>
                  ) : null}
                  {it.waitlist ? <span className="starting-tag">Waitlist</span> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
