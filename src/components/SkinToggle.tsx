import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSkin } from "../lib/skin";

export function SkinToggle() {
  const { skin, toggle } = useSkin();
  const devils = skin === "devils";
  return (
    <button
      type="button"
      className="skin-toggle"
      onClick={toggle}
      aria-pressed={devils}
      aria-label={`Design: ${devils ? "The Devils" : "Original"}. Click to switch.`}
      title={devils ? "Back to the original design" : "Switch to The Devils"}
    >
      <span className="skin-toggle-icon" aria-hidden="true">
        {devils ? "✠" : "✳"}
      </span>
      {devils ? "The Devils" : "Original"}
    </button>
  );
}

/**
 * Mounts the toggle into the header's action row from outside <App/>.
 *
 * It lives here rather than inline in App.tsx so the seasonal skin can ship
 * without sweeping the in-flight App.tsx work into its commit. Once that work
 * lands, fold <SkinToggle/> into App's header-actions and delete this.
 */
export function SkinToggleMount() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const find = () => document.querySelector(".header-actions");
    const now = find();
    if (now) {
      setTarget(now);
      return;
    }
    const mo = new MutationObserver(() => {
      const t = find();
      if (t) {
        setTarget(t);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  return target ? createPortal(<SkinToggle />, target) : null;
}
