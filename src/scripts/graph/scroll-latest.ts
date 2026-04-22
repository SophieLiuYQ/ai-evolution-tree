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

// Anchor-element approach: instead of computing container scrollHeight
// (which is fragile across the .ai-tree-graph → graph-body → canvas-area
// → orient-pane chain when display:none has just been flipped), we find
// the LAST node card in the active view and call scrollIntoView on it.
// The browser handles all the container math itself. Works equally for
// SVG <a> in tree view and HTML <a> in compact view.

function applyScroll() {
  const fig = document.querySelector<HTMLElement>(".ai-tree-graph");
  if (!fig) return;

  // Compact view: last tile in the last year row.
  if (fig.classList.contains("compact-mode")) {
    const tiles = fig.querySelectorAll<HTMLElement>(
      ".compact-list .compact-tile:not(.card-filtered)",
    );
    const last = tiles[tiles.length - 1];
    if (last) {
      last.scrollIntoView({ block: "end", inline: "nearest" });
    } else {
      // No filter-passing tile — fall back to bottom of the list.
      const list = fig.querySelector<HTMLElement>(".compact-list");
      if (list) list.scrollTop = list.scrollHeight;
    }
    return;
  }

  // Tree view: last placed card in the active orient pane. Cards are
  // rendered in date-asc order by computeLayout, so the last DOM card
  // is the most recent year.
  const orient = getOrient();
  const pane = document.querySelector<HTMLElement>(
    `.orient-pane[data-orient="${orient}"]`,
  );
  if (!pane) return;

  // Prefer a non-filtered card so we anchor on something the user can
  // actually see; fall back to the last card overall.
  const cards = pane.querySelectorAll<HTMLElement>(".node-link");
  if (cards.length === 0) return;
  let target: HTMLElement | null = null;
  for (let i = cards.length - 1; i >= 0; i--) {
    if (!cards[i].classList.contains("card-filtered")) {
      target = cards[i];
      break;
    }
  }
  if (!target) target = cards[cards.length - 1];

  target.scrollIntoView({
    block: orient === "v" ? "end" : "nearest",
    inline: orient === "h" ? "end" : "nearest",
  });
}

/** Scroll the active view to the most-recent-date end. Called on
 *  page load, on filter change, on compact-mode toggle. Fires twice
 *  (now + RAF) so layout has a chance to settle when we're called
 *  immediately after a display:none flip. */
export function scrollToMostRecent() {
  applyScroll();
  requestAnimationFrame(applyScroll);
}
