import { useMemo, useState } from "react";
import eventsData from "./data/events.json";
import type { CategoryFilter, EventsData, TabMode } from "./types";
import { today } from "./lib/dates";
import { Anchors } from "./components/Anchors";
import { BuyNow } from "./components/BuyNow";
import { Calendar } from "./components/Calendar";
import { Decisions } from "./components/Decisions";
import { ExportButton } from "./components/ExportButton";
import { FallHorizon } from "./components/FallHorizon";
import { FilterBar } from "./components/FilterBar";
import { Spaces } from "./components/Spaces";
import { TabBar } from "./components/TabBar";

const data = eventsData as EventsData;

const TODAY_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function App() {
  const [tab, setTab] = useState<TabMode>("all");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const todayLabel = useMemo(() => TODAY_FMT.format(today()), []);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NYC Creative Calendar</h1>
        <p className="app-subtitle">
          Summer 2026 — classes, studios, events across Brooklyn & Manhattan.
        </p>
        <p className="verified">
          Today {todayLabel} · last verified {data.lastVerified}
        </p>
      </header>
      <TabBar active={tab} onChange={setTab} />
      <BuyNow tab={tab} />
      <Decisions tab={tab} />
      <Anchors tab={tab} />
      <div className="filter-row">
        <FilterBar active={filter} onChange={setFilter} />
        <ExportButton filter={filter} tab={tab} />
      </div>
      <Spaces filter={filter} tab={tab} />
      <Calendar filter={filter} tab={tab} />
      <FallHorizon tab={tab} />
    </div>
  );
}

export default App;
