// Sort mode controller — picks which of the 6 pre-rendered OrientPane
// SVGs is visible. Each (orient, sort) pair has its own SVG with its
// own bands (year/company/type) and per-mode card positions.

import { clearDynamicEdges } from "./dom";
import { clearPinOnOrientChange, renderHover } from "./hover";
import { getOrient } from "./orient";
import { getPinned, getSort, setPinned, setSort, type SortMode } from "./state";

const STORAGE_KEY = "ai-tree:sort";

// Show only the pane matching (current orient, current sort); hide the rest.
export function updateActivePane() {
  const orient = getOrient();
  const sort = getSort();
  document.querySelectorAll<HTMLElement>(".orient-pane").forEach((p) => {
    const match = p.dataset.orient === orient && p.dataset.sort === sort;
    p.style.display = match ? "" : "none";
  });
}

function setSortMode(mode: SortMode, persist = true) {
  if (mode === getSort()) return;
  setSort(mode);

  // Different sort = different bands, edges, positions. Drop pin (its
  // anchor card is in a different pane now) + clear stale dynamic edges.
  setPinned(null);
  clearPinOnOrientChange();
  clearDynamicEdges();

  updateActivePane();

  // Sync segmented control state.
  document.querySelectorAll<HTMLButtonElement>(".sort-btn").forEach((b) =>
    b.setAttribute(
      "aria-selected",
      b.dataset.sort === mode ? "true" : "false",
    ),
  );

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }

  // If something was pinned at the moment of switch, the user lost their
  // anchor — that's expected (the pinned card may not even be in the same
  // semantic group). Re-hovering the same slug would re-render in new layout.
  void getPinned;
  void renderHover;
}

export function attachSortHandlers() {
  let initial: SortMode = "chronological";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (
      saved === "chronological" ||
      saved === "byOrg" ||
      saved === "byType" ||
      saved === "byLicense"
    ) {
      initial = saved;
    }
  } catch {}

  if (initial !== "chronological") {
    setSortMode(initial, false);
  } else {
    updateActivePane();
  }

  document.querySelectorAll<HTMLButtonElement>(".sort-btn").forEach((btn) => {
    btn.setAttribute(
      "aria-selected",
      btn.dataset.sort === initial ? "true" : "false",
    );
    btn.addEventListener("click", () => {
      const m = btn.dataset.sort as SortMode;
      if (m) setSortMode(m);
    });
  });
}
