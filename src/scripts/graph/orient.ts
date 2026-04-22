// Orientation toggle (h/v) with localStorage persistence.
// Pane visibility is jointly determined by current orient + sort mode
// (we render 6 panes — see updateActivePane).

import { clearDynamicEdges } from "./dom";
import { clearPinOnOrientChange } from "./hover";
import { getSort, type Orient } from "./state";
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

  if (scrollEnd) {
    // Defer the scroll to the next frame: updateActivePane just
    // flipped display:none on the panes, so the browser hasn't laid
    // the newly-visible one out yet. Reading scrollWidth/Height
    // synchronously here returns 0 and the scroll lands at the START
    // of the timeline (= year 1957) instead of "today". RAF gives
    // layout one tick to settle.
    requestAnimationFrame(() => {
      const pane = document.querySelector<HTMLElement>(
        `.orient-pane[data-orient="${o}"]`,
      );
      if (!pane) return;
      if (o === "h") pane.scrollLeft = pane.scrollWidth;
      else pane.scrollTop = pane.scrollHeight;
    });
  }
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
