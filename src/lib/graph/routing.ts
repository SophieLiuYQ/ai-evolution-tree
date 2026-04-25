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

// Side-bulge fan-out: alternate sign by srcIdx parity so siblings of one
// hub split into two fans (left+right or up+down) instead of all bulging
// the same way and clustering. Radius grows with srcIdx but is capped so
// hub nodes (e.g. GPT-5.5 with 42 outgoing) don't push curves into the
// next half of the layout.
const SIDE_FAN_BASE = 70;
const SIDE_FAN_STEP = 22;
const SIDE_FAN_MAX = 200;
function sideFanArc(srcIdx: number): number {
  const sign = srcIdx % 2 === 0 ? 1 : -1;
  const radius = Math.min(
    SIDE_FAN_MAX,
    SIDE_FAN_BASE + Math.floor(srcIdx / 2) * SIDE_FAN_STEP,
  );
  return sign * radius;
}

// Standard 9-anchor menu, but the entries near the curve's lateral peak
// (t=0.5) sit at the FRONT for side-bulged curves — that's where the
// curve is farthest from card geometry, so labels there clear cards.
const ANCHOR_TS_DEFAULT = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75];

function buildBezier(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
) {
  const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x2.toFixed(1)} ${y2.toFixed(1)}, ${x3.toFixed(1)} ${y3.toFixed(1)}, ${x4.toFixed(1)} ${y4.toFixed(1)}`;
  const anchors = ANCHOR_TS_DEFAULT.map((t) => bezierAt(x1, y1, x2, y2, x3, y3, x4, y4, t));
  return { d, mid: anchors[0], anchors };
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
    // Inter-year: cards in different year columns. Edge runs LR
    // (src.right → tgt.left). Direct cubic S — label in column gap.
    if (!stagger.sameBlock) {
      const sxR = src.x + src.width / 2;
      const sy = src.y + sOff;
      const txL = tgt.x - tgt.width / 2;
      const ty = tgt.y + tOff;
      const dx = txL - sxR;
      if (dx > 4) {
        const c1x = sxR + dx * 0.5;
        const c2x = txL - dx * 0.5;
        return buildBezier(sxR, sy, c1x, sy, c2x, ty, txL, ty);
      }
      // True backward in time (older target): wide vertical loop above
      // or below the column stack. Rare. Fall through to the same
      // vertical-route logic intra-year edges use.
    }

    // Intra-year (same column): cards stacked vertically. Route
    // vertically (src.bottom → tgt.top, or src.top → tgt.bottom for
    // target-above-source) with a horizontal side-bulge so the label
    // lands in the inter-card gap, NOT on a card.
    const tgtAboveH = tgt.y < src.y;
    const sxC = src.x + sOff;
    const txC = tgt.x + tOff;
    const sy0H = tgtAboveH ? src.y - src.height / 2 : src.y + src.height / 2;
    const ty0H = tgtAboveH ? tgt.y + tgt.height / 2 : tgt.y - tgt.height / 2;
    const xPushH = sideFanArc(stagger.srcIdx);
    const c1xH = sxC + xPushH;
    const c2xH = txC + xPushH;
    return buildBezier(sxC, sy0H, c1xH, sy0H, c2xH, ty0H, txC, ty0H);
  }

  // Vertical orient
  if (!stagger.sameBlock) {
    // Inter-year: cards in different year rows. Edge runs TB
    // (src.bottom → tgt.top). Direct cubic.
    const sx = src.x + sOff;
    const tx = tgt.x + tOff;
    const syB = src.y + src.height / 2;
    const tyT = tgt.y - tgt.height / 2;
    const dy = tyT - syB;
    if (dy > 4) {
      const c1y = syB + dy * 0.5;
      const c2y = tyT - dy * 0.5;
      return buildBezier(sx, syB, sx, c1y, tx, c2y, tx, tyT);
    }
    // True backward in time (older target above): fall through to
    // intra-block-style vertical-loop routing.
  }

  // Intra-year (same row, possibly different sub-rows): cards densely
  // packed laterally. Routing strategy depends on src/tgt sub-row:
  //   • same sub-row (src.y == tgt.y): bulge ABOVE or BELOW the row by
  //     enough to clear card y-extent. Side alternates by srcIdx.
  //   • src above tgt: src.bottom → tgt.top (forward, may span sub-rows)
  //   • src below tgt: src.top → tgt.bottom (backward)
  // In all three the curve also gets a horizontal side-fan so siblings
  // from one hub spread laterally instead of stacking.
  const sxV = src.x + sOff;
  const txV = tgt.x + tOff;
  const xPushV = sideFanArc(stagger.srcIdx);
  let sy0V: number, ty0V: number, c1yV: number, c2yV: number;
  if (Math.abs(tgt.y - src.y) < 4) {
    // Same sub-row. Pick bulge side by srcIdx parity so siblings split.
    const upSide = stagger.srcIdx % 2 === 0;
    const sideY = upSide ? -src.height / 2 : src.height / 2;
    sy0V = src.y + sideY;
    ty0V = tgt.y + sideY;
    const yBulge = (upSide ? -1 : 1) * (45 + Math.floor(stagger.srcIdx / 2) * 12);
    c1yV = sy0V + yBulge;
    c2yV = ty0V + yBulge;
  } else {
    const tgtAboveV = tgt.y < src.y;
    sy0V = tgtAboveV ? src.y - src.height / 2 : src.y + src.height / 2;
    ty0V = tgtAboveV ? tgt.y + tgt.height / 2 : tgt.y - tgt.height / 2;
    c1yV = sy0V;
    c2yV = ty0V;
  }
  const c1xV = sxV + xPushV;
  const c2xV = txV + xPushV;
  return buildBezier(sxV, sy0V, c1xV, c1yV, c2xV, c2yV, txV, ty0V);
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
