import type { TabMode } from "../types";

interface Props {
  active: TabMode;
  onChange: (next: TabMode) => void;
}

const OPTIONS: {
  value: TabMode;
  label: string;
  sub: string;
}[] = [
  { value: "practice", label: "Practice", sub: "Classes + creative practice" },
  { value: "attend", label: "Attend", sub: "Shows, plays, screenings" },
  { value: "all", label: "All", sub: "Everything" },
];

export function TabBar({ active, onChange }: Props) {
  return (
    <div className="tab-bar" role="tablist" aria-label="Mode">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={active === opt.value}
          className={`tab-btn${active === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          <span className="tab-label">{opt.label}</span>
          <span className="tab-sub">{opt.sub}</span>
        </button>
      ))}
    </div>
  );
}
