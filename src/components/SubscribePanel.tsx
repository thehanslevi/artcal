import { useMemo, useState } from "react";

interface Feed {
  key: string;
  label: string;
  filename: string;
  description: string;
}

const FEEDS: Feed[] = [
  {
    key: "all",
    label: "Everything",
    filename: "feed.ics",
    description: "Every event on the calendar.",
  },
  {
    key: "curated",
    label: "Curated picks",
    filename: "api/feed?curated=1",
    description: "The editor's hand-picked shortlist — updates continuously.",
  },
  {
    key: "attend",
    label: "Attend",
    filename: "feed-attend.ics",
    description: "Shows, concerts, screenings — things to witness.",
  },
  {
    key: "practice",
    label: "Practice",
    filename: "feed-practice.ics",
    description: "Classes and workshops — things to make.",
  },
  {
    key: "free",
    label: "Free",
    filename: "feed-free.ics",
    description: "Only free / no-cost events.",
  },
];

const MEDIUM_FEEDS: { key: string; label: string; filename: string }[] = [
  { key: "sound", label: "Sound", filename: "feed-sound.ics" },
  { key: "dance", label: "Dance", filename: "feed-dance.ics" },
  { key: "film", label: "Film", filename: "feed-film.ics" },
  { key: "tech", label: "Tech", filename: "feed-tech.ics" },
  { key: "making", label: "Making", filename: "feed-making.ics" },
  { key: "theatre", label: "Theatre", filename: "feed-theatre.ics" },
  { key: "literature", label: "Literature", filename: "feed-literature.ics" },
  { key: "community", label: "Community", filename: "feed-community.ics" },
];

function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
  }
  return Promise.resolve(false);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  passphrase: string | null;
  pickCount: number;
  onCreateLink: () => void;
}

export function SubscribePanel({
  open,
  onOpenChange,
  passphrase,
  pickCount,
  onCreateLink,
}: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const myFeedUrl = passphrase
    ? `${origin}/api/feed?key=${encodeURIComponent(passphrase)}`
    : null;

  const handleCopy = async (feed: { key: string; filename: string }) => {
    const ok = await copyText(`${origin}/${feed.filename}`);
    if (ok) {
      setCopiedKey(feed.key);
      setTimeout(() => setCopiedKey(null), 1600);
    }
  };

  const handleCopyMine = async () => {
    if (!myFeedUrl) return;
    const ok = await copyText(myFeedUrl);
    if (ok) {
      setCopiedKey("mine");
      setTimeout(() => setCopiedKey(null), 1600);
    }
  };

  return (
    <div className="subscribe-panel">
      <button
        type="button"
        className="subscribe-badge"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        title="Subscribe from Google or Apple Calendar"
      >
        📅 Subscribe
      </button>
      {open ? (
        <div className="subscribe-popover" role="dialog">
          <p className="subscribe-title">Subscribe from your calendar app</p>
          <p className="subscribe-copy">
            Pick a feed, copy its URL, and subscribe from Google Calendar or
            Apple Calendar. It'll auto-refresh — updates land in your calendar
            within a day of every push.
          </p>
          <p className="subscribe-section-title">Your picks</p>
          {myFeedUrl ? (
            <ul className="subscribe-list">
              <li className="subscribe-item">
                <div className="subscribe-item-head">
                  <span className="subscribe-item-label">
                    My picks ({pickCount})
                  </span>
                  <button
                    type="button"
                    className={`subscribe-copy-btn${copiedKey === "mine" ? " copied" : ""}`}
                    onClick={handleCopyMine}
                  >
                    {copiedKey === "mine" ? "Copied ✓" : "Copy URL"}
                  </button>
                </div>
                <div className="subscribe-item-desc">
                  Your private link — updates as you star and unstar events.
                  Save it to use your picks on another device.
                </div>
                <code className="subscribe-item-url">{myFeedUrl}</code>
              </li>
            </ul>
          ) : (
            <div className="subscribe-cta">
              <p className="subscribe-item-desc">
                Star ★ events you like, then turn them into a private calendar
                that updates itself. No account — you get a secret link.
              </p>
              <button
                type="button"
                className="subscribe-create-btn"
                onClick={onCreateLink}
              >
                Create my calendar link
              </button>
            </div>
          )}
          <p className="subscribe-section-title">Everyone</p>
          <ul className="subscribe-list">
            {FEEDS.map((feed) => {
              const url = `${origin}/${feed.filename}`;
              const copied = copiedKey === feed.key;
              return (
                <li key={feed.key} className="subscribe-item">
                  <div className="subscribe-item-head">
                    <span className="subscribe-item-label">{feed.label}</span>
                    <button
                      type="button"
                      className={`subscribe-copy-btn${copied ? " copied" : ""}`}
                      onClick={() => handleCopy(feed)}
                    >
                      {copied ? "Copied ✓" : "Copy URL"}
                    </button>
                  </div>
                  <div className="subscribe-item-desc">{feed.description}</div>
                  <code className="subscribe-item-url">{url}</code>
                </li>
              );
            })}
          </ul>
          <p className="subscribe-section-title">By medium</p>
          <ul className="subscribe-mediums">
            {MEDIUM_FEEDS.map((feed) => {
              const copied = copiedKey === feed.key;
              return (
                <li key={feed.key}>
                  <button
                    type="button"
                    className={`subscribe-medium-btn${copied ? " copied" : ""}`}
                    onClick={() => handleCopy(feed)}
                    title={`Copy ${origin}/${feed.filename}`}
                  >
                    <span>{feed.label}</span>
                    <span className="subscribe-medium-hint">
                      {copied ? "Copied ✓" : "Copy URL"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <details className="subscribe-help">
            <summary>How to subscribe</summary>
            <p>
              <strong>Google Calendar:</strong> Left sidebar → "Other calendars"
              + → "From URL" → paste. Refreshes ~every 12–24 hours.
            </p>
            <p>
              <strong>Apple Calendar (Mac):</strong> File → New Calendar
              Subscription → paste URL. Set auto-refresh cadence in the dialog.
            </p>
          </details>
        </div>
      ) : null}
    </div>
  );
}
