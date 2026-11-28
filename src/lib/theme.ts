import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const KEY = "artcal-theme";

function systemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode / blocked storage — fall through to default */
  }
  return "system";
}

// Reflect the chosen mode onto <html data-theme> as a resolved light|dark value.
// The inline script in index.html does this first (pre-paint); this keeps it
// current as the user changes the mode.
function apply(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && systemDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);

  useEffect(() => {
    apply(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  // While in Auto, follow the OS as it flips.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // Auto → Light → Dark → Auto
  const cycle = useCallback(() => {
    setMode((m) => (m === "system" ? "light" : m === "light" ? "dark" : "system"));
  }, []);

  return { mode, setMode, cycle };
}
