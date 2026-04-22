// Hover + pin interactions: ancestor lineage rendering with persistent pin.

import {
  buildLabel,
  buildPath,
  clearDynamicEdges,
  getActivePane,
} from "./dom";
import {
  edgesFor,
  getPinned,
  getSort,
  graphData,
  incoming,
  isEdgeTypeEnabled,
  type Orient,
  setPinned,
} from "./state";

let allNodeLinks: HTMLAnchorElement[] = [];

export function expandAncestors(start: string, orient: Orient): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    const parents = incoming()[orient][cur] ?? [];
    for (const p of parents) {
      if (!seen.has(p)) {
        seen.add(p);
        queue.push(p);
      }
    }
  }
  return seen;
}

export function renderHover(slug: string) {
  const active = getActivePane();
  if (!active) {
    console.warn("[ai-tree:hover] no active pane found for", slug);
    return;
  }
  const { orient, edgesGroup, labelsGroup } = active;
  clearDynamicEdges();

  // Re-append the hovered card to the end of its parent <g class="nodes">
  // so its overhanging zoom + pin buttons render on TOP of the adjacent
  // column's cards (SVG has no z-index — last drawn wins).
  // Scope to the ACTIVE pane — both panes have a card with this slug, but
  // only the visible one matters; matching the wrong one moves an invisible
  // node and leaves the visible card's buttons translucent under neighbors.
  const activePaneEl = document.querySelector<HTMLElement>(
    `.orient-pane[data-orient="${orient}"][data-sort="${getSort()}"]`,
  );
  const hoveredLink = activePaneEl?.querySelector<SVGAElement>(
    `.node-link[data-slug="${CSS.escape(slug)}"]`,
  );
  if (hoveredLink?.parentNode) {
    hoveredLink.parentNode.appendChild(hoveredLink);
  }

  const ancestors = expandAncestors(slug, orient);
  const data = graphData();

  // Render every edge whose endpoints are both in the ancestor lineage.
  // EVERY rendered edge gets its labeled pill (§VII invariant: 1:1 edge to label).
  let drawn = 0;
  for (const e of edgesFor(orient)) {
    if (!ancestors.has(e.v) || !ancestors.has(e.w)) continue;
    if (!isEdgeTypeEnabled(e.type)) continue;
    const style = data.edgeStyle[e.type];
    if (!style) continue;
    edgesGroup.appendChild(buildPath(e.d, style, orient, e.type));
    labelsGroup.appendChild(buildLabel(e.midX, e.midY, style));
    drawn++;
  }
  console.log(
    `[ai-tree:hover] ${slug} (${orient}): ${ancestors.size} ancestors, ${drawn} edges → group <g class="edges"> in pane`,
    edgesGroup.parentElement,
  );

  // Fade non-ancestor nodes
  allNodeLinks.forEach((n) => {
    const s = n.getAttribute("data-slug")!;
    n.style.opacity = ancestors.has(s) ? "1" : "0.18";
    n.style.filter =
      s === slug ? "drop-shadow(0 0 6px rgba(15,23,42,0.25))" : "";
  });
}

function clearHoverActual() {
  clearDynamicEdges();
  allNodeLinks.forEach((n) => {
    n.style.opacity = "1";
    n.style.filter = "";
  });
}

export function clearHover() {
  // If a path is pinned, restore its highlight on mouseleave instead of wiping.
  // The user wants the pinned lineage to persist while scrolling.
  const pinned = getPinned();
  if (pinned) {
    renderHover(pinned);
  } else {
    clearHoverActual();
  }
}

function refreshPinButtonStates() {
  const pinned = getPinned();
  document.querySelectorAll<SVGGElement>(".pin-btn").forEach((b) => {
    const s = b.getAttribute("data-pin-slug");
    if (s && s === pinned) b.classList.add("active");
    else b.classList.remove("active");
  });
  // Tag the pinned link itself so CSS can keep its hover behavior alive
  // (pinned card may still want zoom button), and hide hover-reveal on
  // every other card via .has-pin on the figure.
  document.querySelectorAll<SVGAElement>(".node-link.pinned-card").forEach((l) =>
    l.classList.remove("pinned-card"),
  );
  const figures = document.querySelectorAll<HTMLElement>(".ai-tree-graph");
  if (pinned) {
    figures.forEach((f) => f.classList.add("has-pin"));
    // Tag the pinned card in EVERY pane (orient × sort) — when the user
    // toggles orient or sort, the pinned card stays visually marked.
    document
      .querySelectorAll<SVGAElement>(`.node-link[data-slug="${CSS.escape(pinned)}"]`)
      .forEach((l) => l.classList.add("pinned-card"));
  } else {
    figures.forEach((f) => f.classList.remove("has-pin"));
  }
}

export function attachInteractions() {
  allNodeLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".node-link"),
  );

  allNodeLinks.forEach((n) => {
    const slug = n.getAttribute("data-slug")!;
    n.addEventListener("mouseenter", () => {
      // While a path is pinned, hover on OTHER cards is locked out — the
      // user is studying the pinned lineage and doesn't want it disturbed.
      // Re-enabled when they click "highlight this path" again to unpin.
      if (getPinned()) return;
      renderHover(slug);
    });
    n.addEventListener("mouseleave", () => {
      if (getPinned()) return;
      clearHover();
    });
  });

  // Pin button: lock highlight to this slug. Click again to unpin.
  document.querySelectorAll<SVGGElement>(".pin-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const slug = btn.getAttribute("data-pin-slug");
      if (!slug) return;
      if (getPinned() === slug) {
        setPinned(null);
        clearHoverActual();
      } else {
        setPinned(slug);
        renderHover(slug);
      }
      refreshPinButtonStates();
    });
  });
}

// Called from orient toggle to drop the pin (positions differ across panes).
export function clearPinOnOrientChange() {
  setPinned(null);
  refreshPinButtonStates();
}
