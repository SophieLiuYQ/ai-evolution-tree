// Compact view toggle — flips `.compact-mode` on the graph figure,
// which CSS uses to swap from the SVG panes to a flat tile grid of
// `.compact-tile` elements (see Graph.astro markup + styles). The
// node-types/company/license filter chain already applies to
// `.compact-tile` because the tiles share the `.node-link[data-cats]`
// grammar — we don't fork filter logic for the compact view.
//
// State intentionally NOT persisted: compact view is a transient
// "see what's selected" flip, not a sticky preference.

import { scrollToMostRecent } from "./scroll-latest";

const ACTIVE_CLASS = "compact-mode";

export function attachCompactHandler() {
  const btn = document.getElementById("compact-toggle");
  if (!btn) return;
  const fig = document.querySelector<HTMLElement>(".ai-tree-graph");
  if (!fig) return;

  btn.addEventListener("click", () => {
    const next = !fig.classList.contains(ACTIVE_CLASS);
    fig.classList.toggle(ACTIVE_CLASS, next);
    btn.setAttribute("aria-pressed", String(next));
    const label = btn.querySelector(".compact-toggle-label");
    if (label) label.textContent = next ? "Tree view" : "Compact view";
    // Always anchor to the most-recent-date edge when the user flips
    // views. The compact list's own scroll container needs its own
    // scrollTop; scrollToMostRecent() handles the branch.
    scrollToMostRecent();
  });
}
