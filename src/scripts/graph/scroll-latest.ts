// Anchor the viewport to the most-recent dates.
//
// The user wants "today" to always be in view regardless of what
// they're doing: on page load, when they toggle orient, when they
// flip a filter, when they enter compact view. Recent dates are the
// anchor; older models are scrolled-away-from.
//
// In v-orient the time axis runs top→bottom, so most-recent = bottom
// (scrollTop = scrollHeight). In h-orient it runs left→right, so
// most-recent = right (scrollLeft = scrollWidth). The compact view
// is a separate HTML grid with its own scrollbar — same rule, scroll
// to the bottom since years are listed asc.

import { getOrient } from "./orient";

function applyScroll() {
  const fig = document.querySelector<HTMLElement>(".ai-tree-graph");
  if (!fig) return;

  // Compact view has its own scroll container. Defer to it when
  // compact-mode is active.
  if (fig.classList.contains("compact-mode")) {
    const list = fig.querySelector<HTMLElement>(".compact-list");
    if (list) list.scrollTop = list.scrollHeight;
    return;
  }

  // Tree view: walk every potentially-scrollable container along the
  // SVG → root chain and push each one to its end. Belt-and-suspenders
  // because depending on viewport size + CSS layout timing, EITHER
  // the pane OR an ancestor may be the actual overflow container —
  // setting all of them costs nothing and guarantees we land at "today".
  const orient = getOrient();
  const targets = document.querySelectorAll<HTMLElement>(
    `.orient-pane[data-orient="${orient}"], .canvas-area, .graph-body`,
  );
  targets.forEach((el) => {
    if (orient === "h") el.scrollLeft = el.scrollWidth;
    else el.scrollTop = el.scrollHeight;
  });
}

/** Scroll the active view to the most-recent-date end. Called on
 *  page load, on filter change, on compact-mode toggle. Internally
 *  fires twice — once now, once after the next paint frame — so the
 *  scroll lands correctly even if layout hasn't settled yet (which
 *  is common on the very first call after display:none flips). */
export function scrollToMostRecent() {
  applyScroll();
  requestAnimationFrame(applyScroll);
}
