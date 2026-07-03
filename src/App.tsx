import { useState } from "react";
import eventsData from "./data/events.json";
import type { CategoryFilter, EventsData } from "./types";
import { Anchors } from "./components/Anchors";
import { BuyNow } from "./components/BuyNow";
import { Calendar } from "./components/Calendar";
import { Decisions } from "./components/Decisions";
import { ExportButton } from "./components/ExportButton";
import { FallHorizon } from "./components/FallHorizon";
import { FilterBar } from "./components/FilterBar";
import { Spaces } from "./components/Spaces";

const data = eventsData as EventsData;

function App() {
  const [filter, setFilter] = useState<CategoryFilter>("all");

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NYC Creative Calendar</h1>
        <p className="app-subtitle">
          Summer 2026 — classes, studios, events across Brooklyn & Manhattan.
        </p>
        <p className="verified">Last verified {data.lastVerified}</p>
      </header>
      <BuyNow />
      <Decisions />
      <Anchors />
      <div className="filter-row">
        <FilterBar active={filter} onChange={setFilter} />
        <ExportButton filter={filter} />
      </div>
      <Spaces filter={filter} />
      <Calendar filter={filter} />
      <FallHorizon />
    </div>
  );
}

export default App;
