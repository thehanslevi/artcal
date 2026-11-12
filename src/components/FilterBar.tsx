import { useEffect, useRef, useState } from "react";
import type { Category, CategoryFilter } from "../types";

interface Props {
  active: CategoryFilter;
  onChange: (next: CategoryFilter) => void;
  counts?: Record<CategoryFilter, number>;
}

const OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sound", label: "Sound" },
  { value: "dance", label: "Dance" },
  { value: "film", label: "Film" },
  { value: "tech", label: "Tech" },
  { value: "making", label: "Making" },
  { value: "theatre", label: "Theatre" },
  { value: "literature", label: "Literature" },
  { value: "community", label: "Community" },
];

export function FilterBar({ active, onChange, counts }: Props) {
  // On a phone the pills scroll sideways inside the bar. A fade at the edge
  // that has more shows there's more; it goes when you reach the end.
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [counts]);

  return (
    <div className="filter-bar-wrap">
    <div className="filter-bar" ref={ref} role="tablist" aria-label="Category filter">
      {OPTIONS.map((opt) => {
        const count = counts ? counts[opt.value] : undefined;
        if (opt.value !== "all" && count === 0) return null;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active === opt.value}
            className={`filter-btn${active === opt.value ? " active" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
            {typeof count === "number" && opt.value !== "all" ? (
              <span className="filter-count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
      {more.left ? <span className="filter-fade filter-fade-left" aria-hidden="true" /> : null}
      {more.right ? <span className="filter-fade filter-fade-right" aria-hidden="true" /> : null}
    </div>
  );
}

export function computeCategoryCounts<T extends { category: Category }>(
  events: T[],
): Record<CategoryFilter, number> {
  const counts: Record<CategoryFilter, number> = {
    all: events.length,
    sound: 0,
    dance: 0,
    film: 0,
    tech: 0,
    making: 0,
    theatre: 0,
    literature: 0,
    community: 0,
  };
  for (const e of events) counts[e.category] += 1;
  return counts;
}
