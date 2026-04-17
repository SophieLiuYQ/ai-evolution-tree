// Orientation toggle (h/v) with localStorage persistence.
// Pane visibility is jointly determined by current orient + sort mode
// (we render 6 panes — see updateActivePane).

import { clearDynamicEdges } from "./dom";
import { clearPinOnOrientChange } from "./hover";
import { getSort, type Orient } from "./state";
import { updateActivePane } from "./sort";

const STORAGE_KEY = "ai-tree:orient";

let _currentOrient: Orient = "h";

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

  updateActivePane(); // toggles which of the 6 panes is visible

  if (scrollEnd) {
    const pane = document.querySelector<HTMLElement>(
      `.orient-pane[data-orient="${o}"][data-sort="${getSort()}"]`,
    );
    if (!pane) return;
    if (o === "h") pane.scrollLeft = pane.scrollWidth;
    else pane.scrollTop = pane.scrollHeight;
  }
}

export function attachOrientHandlers() {
  let initial: Orient = "h";
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
