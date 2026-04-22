// Compact view toggle — flips `.compact-mode` on the graph figure,
// which CSS uses to swap from the SVG panes to a flat tile grid of
// `.compact-tile` elements (see Graph.astro markup + styles). The
// node-types/company/license filter chain already applies to
// `.compact-tile` because the tiles share the `.node-link[data-cats]`
// grammar — we don't fork filter logic for the compact view.
//
// View choice persisted in localStorage so it survives reloads,
// matching the persistence story for orient + every filter.

import { scrollToMostRecent } from "./scroll-latest";

const ACTIVE_CLASS = "compact-mode";
const STORAGE_KEY = "ai-tree:compactMode";

function setCompact(fig: HTMLElement, btn: HTMLElement, on: boolean) {
  fig.classList.toggle(ACTIVE_CLASS, on);
  btn.setAttribute("aria-pressed", String(on));
  const label = btn.querySelector(".compact-toggle-label");
  if (label) label.textContent = on ? "Tree view" : "Compact view";
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {}
}

export function attachCompactHandler() {
  const btn = document.getElementById("compact-toggle");
  if (!btn) return;
  const fig = document.querySelector<HTMLElement>(".ai-tree-graph");
  if (!fig) return;

  // Restore saved view choice on load (default = tree view).
  let saved = false;
  try {
    saved = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {}
  if (saved) setCompact(fig, btn, true);

  btn.addEventListener("click", () => {
    const next = !fig.classList.contains(ACTIVE_CLASS);
    setCompact(fig, btn, next);
    // Always anchor to the most-recent-date edge when the user flips
    // views. The compact list's own scroll container needs its own
    // scrollTop; scrollToMostRecent() handles the branch.
    scrollToMostRecent();
  });
}
