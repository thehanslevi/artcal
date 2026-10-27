import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./skins/devils.css";
import App from "./App.tsx";
import { SkinToggleMount } from "./components/SkinToggle.tsx";
import { applySkin, readSkin } from "./lib/skin.ts";

// Resolve the seasonal skin before anything renders so there is no flash of
// the other design. (The light/dark theme does the same from index.html.)
applySkin(readSkin());

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <App />
    <SkinToggleMount />
  </StrictMode>,
);
