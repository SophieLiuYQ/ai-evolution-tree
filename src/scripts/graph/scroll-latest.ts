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

export function scrollToMostRecent() {
  const fig = document.querySelector<HTMLElement>(".ai-tree-graph");
  if (!fig) return;

  // Compact view has its own scroll container. Defer to it when
  // compact-mode is active.
  if (fig.classList.contains("compact-mode")) {
    const list = fig.querySelector<HTMLElement>(".compact-list");
    if (list) list.scrollTop = list.scrollHeight;
    return;
  }

  // Otherwise scroll the currently-visible orient pane.
  const orient = getOrient();
  const pane = document.querySelector<HTMLElement>(
    `.orient-pane[data-orient="${orient}"]`,
  );
  if (!pane) return;
  if (orient === "h") pane.scrollLeft = pane.scrollWidth;
  else pane.scrollTop = pane.scrollHeight;
}
