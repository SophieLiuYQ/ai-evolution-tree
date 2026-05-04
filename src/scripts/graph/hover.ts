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
  nodePosFor,
  type Orient,
  outgoing,
  setPinned,
} from "./state";
import type { Segment } from "./route";
import {
  boundarySide,
  labelCandidates,
  pickLabelPoint,
  quadraticEdge,
} from "./route";

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

export function oneHopNeighborhood(start: string, orient: Orient): Set<string> {
  const out = new Set<string>([start]);
  const parents = incoming()[orient][start] ?? [];
  const children = outgoing()[orient][start] ?? [];
  parents.forEach((p) => out.add(p));
  children.forEach((c) => out.add(c));
  return out;
}

function isoYear(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

function isoTime(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

export function renderHover(slug: string) {
  const active = getActivePane();
  if (!active) return;
  const { orient, edgesGroup, labelsGroup } = active;
  clearDynamicEdges();

  // Re-append the hovered card to the end of its parent <g class="nodes">
  // so its overhanging pin button renders on TOP of the adjacent
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

  // Show only ±1 hop (parents + children), and cap to a small set of
  // edges so the view stays readable even for hubs.
  const neighborhood = oneHopNeighborhood(slug, orient);
  const data = graphData();

  // Candidate edges = edges incident to the hovered node.
  const incident = edgesFor(orient)
    .filter((e) => (e.v === slug || e.w === slug))
    .filter((e) => neighborhood.has(e.v) && neighborhood.has(e.w))
    .filter((e) => isEdgeTypeEnabled(e.type));

  const meta = (data as any).nodes ?? {};
  const slugIso = meta?.[slug]?.date as string | undefined;
  const slugYear = isoYear(slugIso);
  const slugT = isoTime(slugIso);

  const typeWeight = (t: string) => (t === "builds_on" ? 100 : 40);

  const scoreEdge = (e: (typeof incident)[number]) => {
    const other = e.v === slug ? e.w : e.v;
    const oIso = meta?.[other]?.date as string | undefined;
    const oYear = isoYear(oIso);
    const oT = isoTime(oIso);
    const sameYear = slugYear != null && oYear != null && slugYear === oYear;
    const dt = slugT != null && oT != null ? Math.abs(slugT - oT) : 0;
    // Prefer: builds_on > alternative; same-year edges;
    // and closer releases within the year.
    return (
      typeWeight(e.type) +
      (sameYear ? 20 : 0) +
      // dt in ms: subtract a small normalized penalty
      Math.max(0, 15 - Math.floor(dt / (1000 * 60 * 60 * 24 * 30)))
    );
  };

  const picked = incident
    .map((e) => ({ e, s: scoreEdge(e) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.e);

  // Alternative edges are symmetric. If both directions exist between the
  // same pair, keep only one so we don't render perfectly overlapping lines.
  const deduped: typeof picked = [];
  const seenAlt = new Set<string>();
  for (const e of picked) {
    if (e.type !== "competes_with") {
      deduped.push(e);
      continue;
    }
    const a = e.v < e.w ? e.v : e.w;
    const b = e.v < e.w ? e.w : e.v;
    const key = `${a}|${b}|${e.type}`;
    if (seenAlt.has(key)) continue;
    seenAlt.add(key);
    deduped.push(e);
  }

  // If multiple relationship types exist for the same node pair in the
  // picked set, keep only one to avoid exact edge overlap. Preference:
  // builds_on > alternative.
  const pairBest = new Map<string, (typeof deduped)[number]>();
  for (const e of deduped) {
    const a = e.v < e.w ? e.v : e.w;
    const b = e.v < e.w ? e.w : e.v;
    const key = `${a}|${b}`;
    const prev = pairBest.get(key);
    if (!prev) {
      pairBest.set(key, e);
      continue;
    }
    if (prev.type !== "builds_on" && e.type === "builds_on") {
      pairBest.set(key, e);
    }
  }
  const finalPicked = Array.from(pairBest.values());

  const visibleNodes = new Set<string>([slug]);
  finalPicked.forEach((e) => {
    visibleNodes.add(e.v);
    visibleNodes.add(e.w);
  });

  const pos = nodePosFor(orient);
  const avoidRects = Array.from(visibleNodes)
    .map((s) => pos[s])
    .filter(Boolean);
  const placedLabels: Array<{ x: number; y: number }> = [];

  // Precompute routes so label placement can avoid OTHER edge segments.
  const srcOff: number[] = Array(finalPicked.length).fill(0);
  const tgtOff: number[] = Array(finalPicked.length).fill(0);
  const bulge: number[] = Array(finalPicked.length).fill(0);

  // De-overlap: spread ports along each (node,side) and add a small
  // perpendicular bulge so near-parallel edges don't stack.
  const PORT_PITCH = 10;
  const BULGE_PITCH = 14;
  const srcGroups = new Map<string, number[]>();
  const tgtGroups = new Map<string, number[]>();
  finalPicked.forEach((e, i) => {
    const src = pos[e.v];
    const tgt = pos[e.w];
    if (!src || !tgt) return;
    const sSide = boundarySide(src, tgt);
    const tSide = boundarySide(tgt, src);
    const sKey = `${e.v}:${sSide}`;
    const tKey = `${e.w}:${tSide}`;
    (srcGroups.get(sKey) ?? srcGroups.set(sKey, []).get(sKey)!).push(i);
    (tgtGroups.get(tKey) ?? tgtGroups.set(tKey, []).get(tKey)!).push(i);
  });
  for (const idxs of srcGroups.values()) {
    if (idxs.length <= 1) continue;
    idxs.forEach((i, k) => {
      srcOff[i] = (k - (idxs.length - 1) / 2) * PORT_PITCH;
      bulge[i] = (k - (idxs.length - 1) / 2) * BULGE_PITCH;
    });
  }
  for (const idxs of tgtGroups.values()) {
    if (idxs.length <= 1) continue;
    idxs.forEach((i, k) => {
      tgtOff[i] = (k - (idxs.length - 1) / 2) * PORT_PITCH;
      // Add a smaller bulge component on the target side too so
      // incoming bundles don't stack perfectly.
      bulge[i] += (k - (idxs.length - 1) / 2) * (BULGE_PITCH * 0.6);
    });
  }

  const routes = finalPicked.map((e, i) => {
    const src = pos[e.v];
    const tgt = pos[e.w];
    if (!src || !tgt) return { e, d: e.d, segments: [] as Segment[], start: null as any, end: null as any };
    const r = quadraticEdge(src, tgt, srcOff[i], tgtOff[i], bulge[i]);
    return { e, d: r.d, segments: r.segments, start: r.start, end: r.end };
  });

  // Render each chosen edge (and its label).
  // EVERY rendered edge gets its labeled pill (§VII invariant: 1:1 edge to label).
  for (let i = 0; i < routes.length; i++) {
    const { e, d, start, end } = routes[i];
    const style = data.edgeStyle[e.type];
    if (!style) continue;
    edgesGroup.appendChild(buildPath(d || e.d, style, orient, e.type));
    const preferUp = i % 2 === 0;
    const baseA = start ?? { x: e.midX - 10, y: e.midY };
    const baseB = end ?? { x: e.midX + 10, y: e.midY };
    const candidates = labelCandidates(baseA, baseB, preferUp);
    const avoidSegs = routes.flatMap((r, j) => (j === i ? [] : r.segments));
    const chosen = pickLabelPoint(candidates, placedLabels, avoidRects, avoidSegs);
    placedLabels.push(chosen);
    labelsGroup.appendChild(buildLabel(chosen.x, chosen.y, style));
  }

  // Fade non-selected nodes (light dim — keep spatial context).
  const DIM_OPACITY = "0.5";
  const DIM_FILTER = "grayscale(0.25)";
  allNodeLinks.forEach((n) => {
    const s = n.getAttribute("data-slug")!;
    if (visibleNodes.has(s)) {
      n.style.opacity = "1";
      n.style.filter = s === slug
        ? "drop-shadow(0 0 6px rgba(15,23,42,0.25))"
        : "";
    } else {
      n.style.opacity = DIM_OPACITY;
      n.style.filter = DIM_FILTER;
    }
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
  // Tag the pinned link itself so CSS can keep its hover behavior alive,
  // and hide hover-reveal on
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

  // Hover-to-highlight is a desktop-only interaction. On touch devices,
  // synthesized mouseenter from the first tap renders the lineage and
  // iOS Safari then treats that tap as "show hover state" rather than
  // triggering the <a>'s navigation — so the user has to tap twice to
  // open a node page. Detecting `(hover: hover)` skips the listeners on
  // touch so a single tap navigates immediately.
  const isHoverCapable = window.matchMedia("(hover: hover)").matches;
  if (isHoverCapable) {
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
  }

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
