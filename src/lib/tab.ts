import type { Mode, SpaceMode, TabMode } from "../types";

export function matchesTab(
  tab: TabMode,
  itemMode: Mode | SpaceMode | undefined,
): boolean {
  if (tab === "all") return true;
  if (!itemMode) return tab === "practice";
  if (itemMode === "both") return true;
  if (tab === "practice") return itemMode === "make";
  if (tab === "attend") return itemMode === "watch";
  return true;
}
