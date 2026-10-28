import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSkin, type Skin } from "../lib/skin";

const LABEL: Record<Skin, string> = {
  original: "Original",
  "devils-a": "Devils A",
  "devils-b": "Devils B",
};

export function SkinToggle() {
  const { skin, cycle } = useSkin();
  return (
    <button
      type="button"
      className="skin-toggle"
      onClick={cycle}
      aria-label={`Design: ${LABEL[skin]}. Click to switch.`}
      title={`Design: ${LABEL[skin]} — click to switch`}
    >
      {LABEL[skin]}
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
