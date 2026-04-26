import type { NodePos } from "./state";

export type Point = { x: number; y: number };
export type Segment = { a: Point; b: Point };
export type Side = "left" | "right" | "top" | "bottom";

// Label pill dimensions (must match dom.ts buildLabel()).
const LABEL_W = 78;
const LABEL_H = 18;

// Given a line from `from` center to `to` center, return the point where that
// ray exits the `from` rectangle. This yields the shortest segment between two
// rectangles along the center-to-center direction.
function exitSide(from: NodePos, to: NodePos): Side {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const halfW = from.w / 2;
  const halfH = from.h / 2;
  if (ax < 1e-6 && ay < 1e-6) return "right";
  // Whichever boundary is hit first by the center-to-center ray.
  return (ax / halfW) >= (ay / halfH)
    ? (dx >= 0 ? "right" : "left")
    : (dy >= 0 ? "bottom" : "top");
}

export function portOnSide(node: NodePos, side: Side, offset = 0): Point {
  const halfW = node.w / 2;
  const halfH = node.h / 2;
  const x0 = node.x;
  const y0 = node.y;
  const pad = 6;
  if (side === "left") return { x: x0 - halfW, y: Math.max(y0 - halfH + pad, Math.min(y0 + halfH - pad, y0 + offset)) };
  if (side === "right") return { x: x0 + halfW, y: Math.max(y0 - halfH + pad, Math.min(y0 + halfH - pad, y0 + offset)) };
  if (side === "top") return { x: Math.max(x0 - halfW + pad, Math.min(x0 + halfW - pad, x0 + offset)), y: y0 - halfH };
  return { x: Math.max(x0 - halfW + pad, Math.min(x0 + halfW - pad, x0 + offset)), y: y0 + halfH };
}

// Ray exit point from rectangle, with an optional offset along the boundary
// (used to de-overlap collinear edges while keeping paths short).
function rectExitPoint(from: NodePos, to: NodePos, boundaryOffset = 0): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);

  // Degenerate: same center.
  if (ax < 1e-6 && ay < 1e-6) return { x: from.x, y: from.y };

  const halfW = from.w / 2;
  const halfH = from.h / 2;
  const scale = 1 / Math.max(ax / halfW, ay / halfH);
  const side = exitSide(from, to);
  const x0 = from.x + dx * scale;
  const y0 = from.y + dy * scale;

  // Clamp offset so anchors remain on the rectangle face, not beyond corners.
  if (side === "left" || side === "right") {
    const y = Math.max(from.y - halfH + 6, Math.min(from.y + halfH - 6, y0 + boundaryOffset));
    return { x: x0, y };
  }
  const x = Math.max(from.x - halfW + 6, Math.min(from.x + halfW - 6, x0 + boundaryOffset));
  return { x, y: y0 };
}

export function straightEdge(
  src: NodePos,
  tgt: NodePos,
  srcBoundaryOffset = 0,
  tgtBoundaryOffset = 0,
): {
  start: Point;
  end: Point;
  d: string;
  // Preferred label anchor (midpoint).
  mid: Point;
} {
  const start = rectExitPoint(src, tgt, srcBoundaryOffset);
  const end = rectExitPoint(tgt, src, tgtBoundaryOffset);
  const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  return {
    start,
    end,
    d,
    mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  };
}

export function boundarySide(from: NodePos, to: NodePos): Side {
  return exitSide(from, to);
}

export function polylinePath(points: Point[]): { d: string; segments: Segment[] } {
  if (points.length < 2) return { d: "", segments: [] };
  const d = ["M", points[0].x.toFixed(1), points[0].y.toFixed(1)]
    .concat(
      points.slice(1).flatMap((p) => ["L", p.x.toFixed(1), p.y.toFixed(1)]),
    )
    .join(" ");
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ a: points[i], b: points[i + 1] });
  }
  return { d, segments };
}

export function longestSegment(segments: Segment[]): Segment | null {
  let best: Segment | null = null;
  let bestLen = -Infinity;
  for (const s of segments) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (len > bestLen) {
      best = s;
      bestLen = len;
    }
  }
  return best;
}

function quadAt(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function quadraticEdge(
  src: NodePos,
  tgt: NodePos,
  srcBoundaryOffset = 0,
  tgtBoundaryOffset = 0,
  bulge = 0,
): {
  start: Point;
  end: Point;
  ctrl: Point;
  d: string;
  segments: Segment[];
} {
  const base = straightEdge(src, tgt, srcBoundaryOffset, tgtBoundaryOffset);
  const start = base.start;
  const end = base.end;
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const n = normalFor(start, end);
  const ctrl = { x: mid.x + n.x * bulge, y: mid.y + n.y * bulge };
  const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;

  // Collision + label avoidance uses a polyline approximation.
  const samples = 12;
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) pts.push(quadAt(start, ctrl, end, i / samples));
  const segments: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) segments.push({ a: pts[i], b: pts[i + 1] });

  return { start, end, ctrl, d, segments };
}

function normalFor(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: -1 };
  // Perpendicular unit normal.
  return { x: -dy / len, y: dx / len };
}

export function labelCandidates(
  start: Point,
  end: Point,
  preferUp: boolean,
): Point[] {
  const ts = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75];
  const n = normalFor(start, end);
  const base = preferUp ? 1 : -1;
  const offsets = [14 * base, -14 * base, 0, 26 * base, -26 * base];
  const out: Point[] = [];
  for (const t of ts) {
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    for (const o of offsets) out.push({ x: x + n.x * o, y: y + n.y * o });
  }
  return out;
}

export function pickLabelPoint(
  candidates: Point[],
  placed: Point[],
  avoidRects?: NodePos[],
  avoidSegments?: Segment[],
): Point {
  const halfW = LABEL_W / 2 + 4;
  const halfH = LABEL_H / 2 + 4;

  const labelCollides = (p: Point) =>
    placed.some((q) => Math.abs(q.x - p.x) < halfW && Math.abs(q.y - p.y) < halfH);

  const rectCollides = (p: Point) => {
    if (!avoidRects) return false;
    for (const r of avoidRects) {
      const left = r.x - r.w / 2 - halfW;
      const right = r.x + r.w / 2 + halfW;
      const top = r.y - r.h / 2 - halfH;
      const bot = r.y + r.h / 2 + halfH;
      if (p.x > left && p.x < right && p.y > top && p.y < bot) return true;
    }
    return false;
  };

  const segmentIntersectsRect = (seg: Segment, left: number, top: number, right: number, bot: number) => {
    // Quick reject: bbox doesn't overlap.
    const minX = Math.min(seg.a.x, seg.b.x);
    const maxX = Math.max(seg.a.x, seg.b.x);
    const minY = Math.min(seg.a.y, seg.b.y);
    const maxY = Math.max(seg.a.y, seg.b.y);
    if (maxX < left || minX > right || maxY < top || minY > bot) return false;

    // If either endpoint is inside rect, it intersects.
    const inside = (p: Point) => p.x >= left && p.x <= right && p.y >= top && p.y <= bot;
    if (inside(seg.a) || inside(seg.b)) return true;

    // Segment vs rect edges (Liang-Barsky style clipping).
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    let t0 = 0;
    let t1 = 1;
    const clip = (p: number, q: number) => {
      if (Math.abs(p) < 1e-9) return q >= 0;
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
      return true;
    };
    if (!clip(-dx, seg.a.x - left)) return false;
    if (!clip(dx, right - seg.a.x)) return false;
    if (!clip(-dy, seg.a.y - top)) return false;
    if (!clip(dy, bot - seg.a.y)) return false;
    return t0 <= t1;
  };

  const segmentCollides = (p: Point) => {
    if (!avoidSegments || avoidSegments.length === 0) return false;
    // Label rect with a bit of breathing room.
    const left = p.x - halfW;
    const right = p.x + halfW;
    const top = p.y - halfH;
    const bot = p.y + halfH;
    for (const seg of avoidSegments) {
      if (segmentIntersectsRect(seg, left, top, right, bot)) return true;
    }
    return false;
  };

  // Pass 1: avoid both labels + cards
  for (const p of candidates) {
    if (!labelCollides(p) && !rectCollides(p) && !segmentCollides(p)) return p;
  }
  // Pass 2: avoid labels only
  for (const p of candidates) {
    if (!labelCollides(p)) return p;
  }
  return candidates[0] ?? { x: 0, y: 0 };
}
