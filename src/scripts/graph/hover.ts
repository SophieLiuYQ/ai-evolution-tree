// Hover + pin interactions: ancestor lineage rendering with persistent pin.

import {
  buildLabel,
  buildPath,
  clearDynamicEdges,
  getActivePane,
} from "./dom";
import {
  getPinned,
  graphData,
  incoming,
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
  if (!active) return;
  const { orient, edgesGroup, labelsGroup } = active;
  clearDynamicEdges();

  const ancestors = expandAncestors(slug, orient);
  const data = graphData();

  // Render every edge whose endpoints are both in the ancestor lineage.
  // EVERY rendered edge gets its labeled pill (§VII invariant: 1:1 edge to label).
  for (const e of data[orient]) {
    if (!ancestors.has(e.v) || !ancestors.has(e.w)) continue;
    const style = data.edgeStyle[e.type];
    if (!style) continue;
    edgesGroup.appendChild(buildPath(e.d, style, orient, e.type));
    labelsGroup.appendChild(buildLabel(e.midX, e.midY, style));
  }

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
}

export function attachInteractions() {
  allNodeLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".node-link"),
  );

  allNodeLinks.forEach((n) => {
    const slug = n.getAttribute("data-slug")!;
    n.addEventListener("mouseenter", () => renderHover(slug));
    n.addEventListener("mouseleave", () => clearHover());
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
