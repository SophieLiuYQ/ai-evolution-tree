// ===== V3.1 routing: SINGLE strategy = direct cubic Bezier =====
// V1/V2 used 3 strategies (adjacent S-curve / Manhattan vertical / detour)
// chosen by spatial relationship. The Manhattan splitX/detourX bends caused
// the parallel-jitter bug: multiple edges from same source bent at sxR+30
// and ran vertical at the same X — looked like blurry double lines instead
// of distinct edges.
//
// V3.1: ONE strategy. Every edge is a direct cubic Bezier from source's
// right-middle to target's left-middle (h-orient) or src.bottom → tgt.top
// (v-orient). Curves from different sources naturally diverge because they
// originate at different X positions. Stagger via perpendicular offset on
// entry/exit only — no bend-X stagger, no detour. Same-column / backward
// edges (rare in ancestor lineage) use a wide control-point arc to loop
// outside the column.

import type { Edge, EdgeStagger, Orient, Placed } from "./types";
export type { Placed };
import {
  H_COL_GAP,
  HIDDEN_EDGE_TYPES,
  LABEL_H,
  LABEL_W,
  NODE_H,
} from "./constants";

// Pitch caps and budgets:
// - Perp budget: edges enter/exit on the card's edge (height = NODE_H).
//   Use up to 60% of card height as budget so exit points stay inside card.
// - For 2-3 edges, max 16px pitch so they look like CLEAR parallel tracks
//   (not "jitter doubling"). For many edges, pitch shrinks to fit.
export const STAGGER_PERP_MAX = 16;
export const STAGGER_PERP_BUDGET = NODE_H * 0.6;
export const STAGGER_BEND_MAX = 24;
export const STAGGER_BEND_BUDGET = H_COL_GAP * 0.7;

export function perpOffset(idx: number, total: number): number {
  if (total <= 1) return 0;
  const pitch = Math.min(STAGGER_PERP_MAX, STAGGER_PERP_BUDGET / (total - 1));
  return (idx - (total - 1) / 2) * pitch;
}

export function bendOffsetFor(idx: number, total: number): number {
  if (total <= 1) return 0;
  const pitch = Math.min(STAGGER_BEND_MAX, STAGGER_BEND_BUDGET / (total - 1));
  return idx * pitch;
}

// Cubic Bézier point at parameter t (0..1)
export function bezierAt(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * x2 + 3 * u * t * t * x3 + t * t * t * x4,
    y: u * u * u * y1 + 3 * u * u * t * y2 + 3 * u * t * t * y3 + t * t * t * y4,
  };
}

export function directPath(
  src: Placed,
  tgt: Placed,
  orient: Orient,
  stagger: EdgeStagger = { srcIdx: 0, srcTotal: 1, tgtIdx: 0, tgtTotal: 1 },
): {
  d: string;
  mid: { x: number; y: number };
  anchors: { x: number; y: number }[];
} {
  const sOff = perpOffset(stagger.srcIdx, stagger.srcTotal);
  const tOff = perpOffset(stagger.tgtIdx, stagger.tgtTotal);

  if (orient === "h") {
    const sxR = src.x + src.width / 2;
    const sy = src.y + sOff;
    const txL = tgt.x - tgt.width / 2;
    const ty = tgt.y + tOff;
    const dx = txL - sxR;

    if (dx > 4) {
      // Forward edge: tug control points horizontally for a clean S-curve
      const c1x = sxR + dx * 0.5;
      const c2x = txL - dx * 0.5;
      const d = `M ${sxR.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${sy.toFixed(1)}, ${c2x.toFixed(1)} ${ty.toFixed(1)}, ${txL.toFixed(1)} ${ty.toFixed(1)}`;
      const anchors = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75].map((t) =>
        bezierAt(sxR, sy, c1x, sy, c2x, ty, txL, ty, t),
      );
      return { d, mid: anchors[0], anchors };
    }

    // Same-column / backward (rare): wide arc loop OUTSIDE the column
    const arc = 60 + Math.abs(stagger.srcIdx) * 8;
    const c1x = sxR + arc;
    const c2x = txL + arc;
    const d = `M ${sxR.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${sy.toFixed(1)}, ${c2x.toFixed(1)} ${ty.toFixed(1)}, ${txL.toFixed(1)} ${ty.toFixed(1)}`;
    const anchors = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75].map((t) =>
      bezierAt(sxR, sy, c1x, sy, c2x, ty, txL, ty, t),
    );
    return { d, mid: anchors[0], anchors };
  }

  // Vertical orient: src.bottom → tgt.top
  const sx = src.x + sOff;
  const syB = src.y + src.height / 2;
  const tx = tgt.x + tOff;
  const tyT = tgt.y - tgt.height / 2;
  const dy = tyT - syB;

  if (dy > 4) {
    const c1y = syB + dy * 0.5;
    const c2y = tyT - dy * 0.5;
    const d = `M ${sx.toFixed(1)} ${syB.toFixed(1)} C ${sx.toFixed(1)} ${c1y.toFixed(1)}, ${tx.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${tyT.toFixed(1)}`;
    const anchors = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75].map((t) =>
      bezierAt(sx, syB, sx, c1y, tx, c2y, tx, tyT, t),
    );
    return { d, mid: anchors[0], anchors };
  }

  const arc = 60 + Math.abs(stagger.srcIdx) * 8;
  const c1y = syB + arc;
  const c2y = tyT + arc;
  const d = `M ${sx.toFixed(1)} ${syB.toFixed(1)} C ${sx.toFixed(1)} ${c1y.toFixed(1)}, ${tx.toFixed(1)} ${c2y.toFixed(1)}, ${tx.toFixed(1)} ${tyT.toFixed(1)}`;
  const anchors = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75].map((t) =>
    bezierAt(sx, syB, sx, c1y, tx, c2y, tx, tyT, t),
  );
  return { d, mid: anchors[0], anchors };
}

// Pick a label position that doesn't overlap (a) already-placed labels OR
// (b) any card rectangle. Tries each anchor in order (anchors lie ON the
// edge geometry, so the label stays visually attached to its edge).
//
// Two-pass strategy:
//   pass 1: pick first anchor that's clean of BOTH labels and cards
//   pass 2: if all anchors fail card check, pick first that's clean of labels
//   fallback: anchors[0]
export function avoidLabelOverlaps(
  edges: Edge[],
  placedNodes?: Placed[],
): void {
  const placed: Array<{ x: number; y: number }> = [];
  const LABEL_X_PAD = LABEL_W * 0.55;
  const LABEL_Y_PAD = LABEL_H + 3;
  // Half-extents of the label PLUS a small breathing room
  const LABEL_HALF_W = LABEL_W / 2 + 4;
  const LABEL_HALF_H = LABEL_H / 2 + 4;

  const labelCollides = (cx: number, cy: number) =>
    placed.some(
      (p) => Math.abs(p.x - cx) < LABEL_X_PAD && Math.abs(p.y - cy) < LABEL_Y_PAD,
    );

  const cardCollides = (cx: number, cy: number) => {
    if (!placedNodes) return false;
    for (const p of placedNodes) {
      const left = p.x - p.width / 2 - LABEL_HALF_W;
      const right = p.x + p.width / 2 + LABEL_HALF_W;
      const top = p.y - p.height / 2 - LABEL_HALF_H;
      const bot = p.y + p.height / 2 + LABEL_HALF_H;
      if (cx > left && cx < right && cy > top && cy < bot) return true;
    }
    return false;
  };

  for (const e of edges) {
    if (HIDDEN_EDGE_TYPES.has(e.type)) {
      e.midX = e.anchors[0].x;
      e.midY = e.anchors[0].y;
      continue;
    }
    // Pass 1: clean of both
    let chosen = e.anchors[0];
    let foundClean = false;
    for (const c of e.anchors) {
      if (!cardCollides(c.x, c.y) && !labelCollides(c.x, c.y)) {
        chosen = c;
        foundClean = true;
        break;
      }
    }
    // Pass 2: clean of labels only (last resort — overlap a card)
    if (!foundClean) {
      for (const c of e.anchors) {
        if (!labelCollides(c.x, c.y)) {
          chosen = c;
          break;
        }
      }
    }
    e.midX = chosen.x;
    e.midY = chosen.y;
    placed.push({ x: e.midX, y: e.midY });
  }
}
