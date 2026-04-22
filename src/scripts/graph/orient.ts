// Orientation toggle (h/v) with localStorage persistence.
// Pane visibility is jointly determined by current orient + sort mode
// (we render 6 panes — see updateActivePane).

import { clearDynamicEdges } from "./dom";
import { clearPinOnOrientChange } from "./hover";
import { scrollToMostRecent } from "./scroll-latest";
import { type Orient } from "./state";
import { updateActivePane } from "./sort";

const STORAGE_KEY = "ai-tree:orient";

let _currentOrient: Orient = "v";

export function getOrient(): Orient {
  return _currentOrient;
}

export function setOrient(o: Orient, scrollEnd = true) {
  _currentOrient = o;
  document.querySelectorAll<HTMLButtonElement>(".orient-btn").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.orient === o ? "true" : "false");
  });
  try {
    localStorage.setItem(STORAGE_KEY, o);
  } catch {}

  updateActivePane(); // toggles which pane is visible

  // Anchor to the most-recent-date end via the shared helper, which
  // uses scrollIntoView on the last card so it doesn't depend on
  // container math (the brittle scrollHeight/Width approach was
  // unreliable across the figure → graph-body → canvas-area → pane
  // chain right after a display:none flip).
  if (scrollEnd) scrollToMostRecent();
}

export function attachOrientHandlers() {
  let initial: Orient = "v";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "h" || saved === "v") initial = saved;
  } catch {}
  setOrient(initial, true);

  document.querySelectorAll<HTMLButtonElement>(".orient-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const o = btn.dataset.orient as Orient;
      setOrient(o, true);
      clearDynamicEdges();
      clearPinOnOrientChange();
    });
  });
}
