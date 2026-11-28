import { useTheme, type ThemeMode } from "../lib/theme";

const LABEL: Record<ThemeMode, string> = {
  system: "Auto",
  light: "Light",
  dark: "Dark",
};

const ICON: Record<ThemeMode, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

export function ThemeToggle() {
  const { mode, cycle } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[mode]}. Click to cycle Auto, Light, Dark.`}
      title={`Theme: ${LABEL[mode]} — click to cycle Auto / Light / Dark`}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {ICON[mode]}
      </span>
      {LABEL[mode]}
    </button>
  );
}
