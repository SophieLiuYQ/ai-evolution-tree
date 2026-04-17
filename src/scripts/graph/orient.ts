// Orientation toggle (h/v) with localStorage persistence.

import { clearDynamicEdges } from "./dom";
import { clearPinOnOrientChange } from "./hover";
import type { Orient } from "./state";

const STORAGE_KEY = "ai-tree:orient";

function setOrient(o: Orient, scrollEnd = true) {
  document.querySelectorAll<HTMLElement>(".orient-pane").forEach((p) => {
    p.style.display = p.dataset.orient === o ? "" : "none";
  });
  document.querySelectorAll<HTMLButtonElement>(".orient-btn").forEach((b) => {
    b.setAttribute(
      "aria-selected",
      b.dataset.orient === o ? "true" : "false",
    );
  });
  try {
    localStorage.setItem(STORAGE_KEY, o);
  } catch {}

  if (scrollEnd) {
    const pane = document.querySelector<HTMLElement>(
      `.orient-pane[data-orient="${o}"]`,
    );
    if (!pane) return;
    // h: scroll right (latest year). v: scroll down (latest year).
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
