import { useState } from "react";

const EMAIL = "thehanslevi@proton.me";
const MAILTO =
  "mailto:thehanslevi@proton.me?subject=Event%20for%20the%20calendar&body=What%3A%0AWhen%3A%0AWhere%3A%0ACost%3A%0ALink%3A%0A";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// mailto: silently fails when there's no OS-registered mail client (common
// with webmail like Proton), so we always surface the address to copy.
// Rendered in the footer (outside prose) so the popover isn't nested in a <p>.
export function SubmitPanel({ open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* denied */
    }
  };

  return (
    <div className="submit-panel">
      <button
        type="button"
        className="footer-submit-btn"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        Submit an event
      </button>
      {open ? (
        <div className="submit-popover" role="dialog">
          <p className="submit-title">Submit an event</p>
          <p className="submit-copy">
            Share something you want to see, or something you're making. Email
            the details — what, when, where, cost, link — and I'll add worthy
            ones here.
          </p>
          <div className="submit-email-row">
            <code className="submit-email">{EMAIL}</code>
            <button
              type="button"
              className={`submit-copy-btn${copied ? " copied" : ""}`}
              onClick={handleCopy}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <a className="submit-mailto" href={MAILTO}>
            Open in mail app →
          </a>
        </div>
      ) : null}
    </div>
  );
}
