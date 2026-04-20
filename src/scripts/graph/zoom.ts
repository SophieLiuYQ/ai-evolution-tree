// Zoom modal: 1-hop neighborhood (parents + focused + children) re-laid-out
// with a tight depth-based pack, rendered at native pixel size.

import { buildLabel, getActivePane, NS } from "./dom";
import {
  edgesFor,
  getSort,
  graphData,
  incoming,
  isEdgeTypeEnabled,
  nodePosFor,
  type NodePos,
  type Orient,
  outgoing,
} from "./state";

// Collapsed layout constants — modules sit right next to each other.
const Z_NODE_W = 220;
const Z_NODE_H = 64;
const Z_DEPTH_GAP = 110;
const Z_PERP_GAP = 22;
const Z_PERP_MAX = 16;
const Z_PERP_BUDGET = Z_NODE_H * 0.6;

const zPerpOffset = (i: number, n: number) => {
  if (n <= 1) return 0;
  const pitch = Math.min(Z_PERP_MAX, Z_PERP_BUDGET / (n - 1));
  return (i - (n - 1) / 2) * pitch;
};

type ZRaw = { v: string; w: string; type: string; src: NodePos; tgt: NodePos };

// 1-hop neighborhood: focused + direct parents + direct children. Returns the
// relevant set + a depth map (parents=2, focused=1, children=0).
function expandLineage1Hop(slug: string, orient: Orient) {
  const parents = incoming()[orient][slug] ?? [];
  const children = outgoing()[orient][slug] ?? [];
  const relevant = new Set<string>([slug, ...parents, ...children]);
  const depth: Record<string, number> = {};
  depth[slug] = 1;
  for (const p of parents) depth[p] = 2;
  for (const c of children) depth[c] = 0;
  return { relevant, depth };
}

// Tight depth-based layout. Depth slots stack along time axis; siblings stack
// along perp axis with even spacing. Sibling order within a depth follows
// original perp position so the modal mirrors the main graph's left/right order.
function layoutByDepth(
  relevant: Set<string>,
  depthMap: Record<string, number>,
  orient: Orient,
  origPos: Record<string, NodePos>,
): Record<string, NodePos> {
  const byDepth = new Map<number, string[]>();
  for (const a of relevant) {
    const d = depthMap[a];
    if (d == null) continue;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(a);
  }
  const perpKey = orient === "h" ? "y" : "x";
  for (const arr of byDepth.values()) {
    arr.sort(
      (a, b) => (origPos[a]?.[perpKey] ?? 0) - (origPos[b]?.[perpKey] ?? 0),
    );
  }

  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const maxDepth = depths[depths.length - 1];
  const newPos: Record<string, NodePos> = {};

  if (orient === "h") {
    for (const d of depths) {
      const colIdx = maxDepth - d;
      const x = colIdx * (Z_NODE_W + Z_DEPTH_GAP) + Z_NODE_W / 2;
      const arr = byDepth.get(d)!;
      const colSpan = arr.length * Z_NODE_H + (arr.length - 1) * Z_PERP_GAP;
      let y = -colSpan / 2 + Z_NODE_H / 2;
      for (const s of arr) {
        newPos[s] = { x, y, w: Z_NODE_W, h: Z_NODE_H };
        y += Z_NODE_H + Z_PERP_GAP;
      }
    }
  } else {
    for (const d of depths) {
      const rowIdx = maxDepth - d;
      const y = rowIdx * (Z_NODE_H + Z_DEPTH_GAP) + Z_NODE_H / 2;
      const arr = byDepth.get(d)!;
      const rowSpan = arr.length * Z_NODE_W + (arr.length - 1) * Z_PERP_GAP;
      let x = -rowSpan / 2 + Z_NODE_W / 2;
      for (const s of arr) {
        newPos[s] = { x, y, w: Z_NODE_W, h: Z_NODE_H };
        x += Z_NODE_W + Z_PERP_GAP;
      }
    }
  }
  return newPos;
}

function zBezierAt(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
  t: number,
) {
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * x2 + 3 * u * t * t * x3 + t * t * t * x4,
    y: u * u * u * y1 + 3 * u * u * t * y2 + 3 * u * t * t * y3 + t * t * t * y4,
  };
}

// Direct cubic-Bezier route — JS port of the frontmatter directPath (V3.1).
function zRoute(
  src: NodePos,
  tgt: NodePos,
  orient: Orient,
  srcIdx: number, srcTotal: number,
  tgtIdx: number, tgtTotal: number,
) {
  const sOff = zPerpOffset(srcIdx, srcTotal);
  const tOff = zPerpOffset(tgtIdx, tgtTotal);
  if (orient === "h") {
    const sxR = src.x + src.w / 2;
    const sy = src.y + sOff;
    const txL = tgt.x - tgt.w / 2;
    const ty = tgt.y + tOff;
    const dx = txL - sxR;
    if (dx > 4) {
      const c1x = sxR + dx * 0.5;
      const c2x = txL - dx * 0.5;
      const mid = zBezierAt(sxR, sy, c1x, sy, c2x, ty, txL, ty, 0.5);
      return {
        d: `M ${sxR.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${sy.toFixed(1)}, ${c2x.toFixed(1)} ${ty.toFixed(1)}, ${txL.toFixed(1)} ${ty.toFixed(1)}`,
        midX: mid.x, midY: mid.y,
      };
    }
    const arc = 60 + Math.abs(srcIdx) * 8;
    const c1x = sxR + arc, c2x = txL + arc;
    const mid = zBezierAt(sxR, sy, c1x, sy, c2x, ty, txL, ty, 0.5);
    return {
      d: `M ${sxR.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${sy.toFixed(1)}, ${c2x.toFixed(1)} ${ty.toFixed(1)}, ${txL.toFixed(1)} ${ty.toFixed(1)}`,
      midX: mid.x, midY: mid.y,
    };
  }
  const sx = src.x + sOff;
  const syB = src.y + src.h / 2;
  const tx = tgt.x + tOff;
  const tyT = tgt.y - tgt.h / 2;
  const dy = tyT - syB;
  if (dy > 4) {
    const c1y = syB + dy * 0.5;
    const c2y = tyT - dy * 0.5;
    const mid = zBezierAt(sx, syB, sx, c1y, tx, c2y, tx, tyT, 0.5);
    return {
      d: `M ${sx.toFixed(1)} ${syB.toFixed(1)} C ${sx.toFixed(1)} ${c1y.toFixed(1)}, ${tx.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${tyT.toFixed(1)}`,
      midX: mid.x, midY: mid.y,
    };
  }
  const arc = 60 + Math.abs(srcIdx) * 8;
  const c1y = syB + arc, c2y = tyT + arc;
  const mid = zBezierAt(sx, syB, sx, c1y, tx, c2y, tx, tyT, 0.5);
  return {
    d: `M ${sx.toFixed(1)} ${syB.toFixed(1)} C ${sx.toFixed(1)} ${c1y.toFixed(1)}, ${tx.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${tyT.toFixed(1)}`,
    midX: mid.x, midY: mid.y,
  };
}

function buildZoomDefs(): SVGDefsElement {
  const defs = document.createElementNS(NS, "defs") as SVGDefsElement;
  for (const [type, style] of Object.entries(graphData().edgeStyle)) {
    const m = document.createElementNS(NS, "marker");
    m.setAttribute("id", `zoom-arrow-${type}`);
    m.setAttribute("viewBox", "0 0 10 10");
    m.setAttribute("refX", "9");
    m.setAttribute("refY", "5");
    m.setAttribute("markerWidth", "6");
    m.setAttribute("markerHeight", "6");
    m.setAttribute("orient", "auto-start-reverse");
    const tri = document.createElementNS(NS, "path");
    tri.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    tri.setAttribute("fill", style.color);
    m.appendChild(tri);
    defs.appendChild(m);
  }
  return defs;
}

function staggerStaggerAssign(raw: ZRaw[], orient: Orient) {
  const perpAxis: "x" | "y" = orient === "h" ? "y" : "x";
  const orthAxis: "x" | "y" = orient === "h" ? "x" : "y";

  const tgtIdxOf = new Map<ZRaw, number>();
  const tgtTotalOf = new Map<ZRaw, number>();
  const byTarget = new Map<string, ZRaw[]>();
  for (const e of raw) {
    if (!byTarget.has(e.w)) byTarget.set(e.w, []);
    byTarget.get(e.w)!.push(e);
  }
  for (const group of byTarget.values()) {
    group.sort((a, b) => {
      const p = a.src[perpAxis] - b.src[perpAxis];
      if (p !== 0) return p;
      const o = a.src[orthAxis] - b.src[orthAxis];
      if (o !== 0) return o;
      return a.v.localeCompare(b.v);
    });
    group.forEach((e, i) => {
      tgtIdxOf.set(e, i);
      tgtTotalOf.set(e, group.length);
    });
  }

  const srcIdxOf = new Map<ZRaw, number>();
  const srcTotalOf = new Map<ZRaw, number>();
  const bySource = new Map<string, ZRaw[]>();
  for (const e of raw) {
    if (!bySource.has(e.v)) bySource.set(e.v, []);
    bySource.get(e.v)!.push(e);
  }
  for (const group of bySource.values()) {
    group.sort((a, b) => {
      const p = a.tgt[perpAxis] - b.tgt[perpAxis];
      if (p !== 0) return p;
      const o = a.tgt[orthAxis] - b.tgt[orthAxis];
      if (o !== 0) return o;
      return a.w.localeCompare(b.w);
    });
    group.forEach((e, i) => {
      srcIdxOf.set(e, i);
      srcTotalOf.set(e, group.length);
    });
  }

  return { srcIdxOf, srcTotalOf, tgtIdxOf, tgtTotalOf };
}

let modal: HTMLElement | null = null;
let modalSvg: SVGSVGElement | null = null;
let modalTitle: HTMLElement | null = null;

function closeZoom() {
  if (modal) modal.setAttribute("hidden", "");
}

function openZoom(slug: string) {
  if (!modal || !modalSvg) return;
  const active = getActivePane();
  if (!active) return;
  const orient = active.orient;
  const data = graphData();
  const origPos = nodePosFor(orient);

  // 1. 1-hop neighborhood
  const { relevant, depth } = expandLineage1Hop(slug, orient);

  // 2. Re-layout: depth-based packing
  const newPos = layoutByDepth(relevant, depth, orient, origPos);

  // 3. Build raw edges
  const raw: ZRaw[] = [];
  for (const e of edgesFor(orient)) {
    if (!relevant.has(e.v) || !relevant.has(e.w)) continue;
    if (!isEdgeTypeEnabled(e.type)) continue;
    const src = newPos[e.v], tgt = newPos[e.w];
    if (!src || !tgt) continue;
    raw.push({ v: e.v, w: e.w, type: e.type, src, tgt });
  }

  // 4. Spatial-order stagger (prevents X-crossings, §IV V3.3)
  const { srcIdxOf, srcTotalOf, tgtIdxOf, tgtTotalOf } = staggerStaggerAssign(
    raw,
    orient,
  );

  // 5. ViewBox = bbox of compact layout, NATURAL pixel size (never scale)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of Object.keys(newPos)) {
    const p = newPos[s];
    minX = Math.min(minX, p.x - p.w / 2);
    minY = Math.min(minY, p.y - p.h / 2);
    maxX = Math.max(maxX, p.x + p.w / 2);
    maxY = Math.max(maxY, p.y + p.h / 2);
  }
  if (!isFinite(minX)) return;
  const PAD = 60;
  const vbW = maxX - minX + 2 * PAD;
  const vbH = maxY - minY + 2 * PAD;
  modalSvg.setAttribute("viewBox", `${minX - PAD} ${minY - PAD} ${vbW} ${vbH}`);
  modalSvg.removeAttribute("preserveAspectRatio");
  modalSvg.setAttribute("width", String(Math.round(vbW)));
  modalSvg.setAttribute("height", String(Math.round(vbH)));

  while (modalSvg.firstChild) modalSvg.removeChild(modalSvg.firstChild);
  modalSvg.appendChild(buildZoomDefs());

  // 6. Edges + labels with new geometry
  const edgesG = document.createElementNS(NS, "g");
  const labelsG = document.createElementNS(NS, "g");
  for (const e of raw) {
    const style = data.edgeStyle[e.type];
    if (!style) continue;
    const route = zRoute(
      e.src, e.tgt, orient,
      srcIdxOf.get(e)!, srcTotalOf.get(e)!,
      tgtIdxOf.get(e)!, tgtTotalOf.get(e)!,
    );
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", route.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", style.color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("opacity", "0.9");
    path.setAttribute("marker-end", `url(#zoom-arrow-${e.type})`);
    edgesG.appendChild(path);
    labelsG.appendChild(buildLabel(route.midX, route.midY, style));
  }
  modalSvg.appendChild(edgesG);

  // 7. Nodes — clone existing card <g>, update transform to compact coords
  const nodesG = document.createElementNS(NS, "g");
  const sourceLinks = document.querySelectorAll<SVGAElement>(
    `.orient-pane[data-orient="${orient}"][data-sort="${getSort()}"] .node-link`,
  );
  sourceLinks.forEach((link) => {
    const s = link.getAttribute("data-slug");
    if (!s || !relevant.has(s)) return;
    const node = link.querySelector(".node");
    if (!node) return;
    const clone = node.cloneNode(true) as SVGGElement;
    clone.querySelectorAll(".zoom-btn, .pin-btn").forEach((b) => b.remove());
    const np = newPos[s];
    if (np) {
      clone.setAttribute(
        "transform",
        `translate(${(np.x - np.w / 2).toFixed(1)}, ${(np.y - np.h / 2).toFixed(1)})`,
      );
    }
    if (s === slug) {
      // Target .card-border explicitly — the first <rect> is the invisible
      // .hover-bay hit-area extension, not the visible border.
      const rect = clone.querySelector("rect.card-border");
      if (rect) {
        rect.setAttribute("stroke-width", "4");
        rect.setAttribute("filter", "drop-shadow(0 0 6px rgba(15,23,42,0.3))");
      }
    }
    nodesG.appendChild(clone);
  });
  modalSvg.appendChild(nodesG);
  modalSvg.appendChild(labelsG);

  // 8. Title — focused card's title + 1-hop counts
  const focused = document.querySelector<SVGAElement>(
    `.orient-pane[data-orient="${orient}"][data-sort="${getSort()}"] .node-link[data-slug="${slug}"]`,
  );
  const titleNode = focused?.querySelectorAll("text")[1];
  const titleText = titleNode?.textContent ?? slug;
  const parentCount = (incoming()[orient][slug] ?? []).length;
  const childCount = (outgoing()[orient][slug] ?? []).length;
  if (modalTitle) {
    modalTitle.textContent = `${titleText}  ·  ${parentCount} parent${parentCount === 1 ? "" : "s"} · ${childCount} child${childCount === 1 ? "" : "ren"}`;
  }

  modal.removeAttribute("hidden");
}

export function attachZoomHandlers() {
  modal = document.querySelector<HTMLElement>(".zoom-modal");
  modalSvg = document.querySelector<SVGSVGElement>(".zoom-svg");
  modalTitle = document.querySelector<HTMLElement>(".zoom-title");
  const modalClose = document.querySelector<HTMLButtonElement>(".zoom-close");
  const modalBackdrop = document.querySelector<HTMLElement>(".zoom-backdrop");

  document.querySelectorAll<SVGGElement>(".zoom-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const slug = btn.getAttribute("data-zoom-slug");
      if (slug) openZoom(slug);
    });
  });

  modalClose?.addEventListener("click", closeZoom);
  modalBackdrop?.addEventListener("click", closeZoom);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeZoom();
  });
}
