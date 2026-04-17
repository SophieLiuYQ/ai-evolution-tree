import type { Band, Edge, Layout, NodeEntry, Orient, Placed } from "./types";
import {
  edgeStyle,
  HIDDEN_EDGE_TYPES,
  H_BOT_PAD,
  H_COL_GAP,
  H_COL_W,
  H_NODE_V_GAP,
  H_SIDE_PAD,
  H_TOP_PAD,
  NODE_H,
  NODE_W,
  V_BOT_PAD,
  V_LEFT_PAD,
  V_MAX_INNER_WIDTH,
  V_NODE_H_GAP,
  V_RIGHT_PAD,
  V_ROW_GAP,
  V_ROW_PAD_BOTTOM,
  V_ROW_PAD_TOP,
  V_TOP_PAD,
} from "./constants";
import { avoidLabelOverlaps, directPath } from "./routing";

export function groupByYear(nodes: NodeEntry[]) {
  const byYear = new Map<number, NodeEntry[]>();
  for (const n of nodes) {
    const y = n.data.date.getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(n);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);
  // Within each year, sort STRICTLY by date ascending so the column / row is
  // always chronological — earliest at top/left, latest at bottom/right.
  for (const y of years) {
    byYear.get(y)!.sort(
      (a, b) => a.data.date.getTime() - b.data.date.getTime(),
    );
  }
  return { byYear, years };
}

export function computeLayout(
  nodes: NodeEntry[],
  byYear: Map<number, NodeEntry[]>,
  years: number[],
  orient: Orient,
): Layout {
  const placedNodes: Placed[] = [];
  const bands: Band[] = [];

  if (orient === "h") {
    // ===== HORIZONTAL: years are columns
    const colHeights: number[] = [];
    for (const year of years) {
      const yearNodes = byYear.get(year)!;
      const colIdx = years.indexOf(year);
      const xCenter = H_SIDE_PAD + colIdx * H_COL_W + NODE_W / 2;
      let yCursor = H_TOP_PAD;
      for (const n of yearNodes) {
        placedNodes.push({
          slug: n.data.slug,
          x: xCenter,
          y: yCursor + NODE_H / 2,
          width: NODE_W,
          height: NODE_H,
          org: n.data.org,
          node: n,
        });
        yCursor += NODE_H + H_NODE_V_GAP;
      }
      colHeights.push(yCursor + H_BOT_PAD);
    }
    const totalHeight = Math.max(...colHeights, H_TOP_PAD + 200);
    const totalWidth = H_SIDE_PAD * 2 + years.length * H_COL_W - H_COL_GAP;

    for (const year of years) {
      const colIdx = years.indexOf(year);
      const xLeft = H_SIDE_PAD + colIdx * H_COL_W;
      bands.push({
        year,
        idx: colIdx,
        rect: { x: xLeft, y: 0, width: NODE_W, height: totalHeight },
        header: { x: xLeft, y: 8, width: NODE_W, height: 42 },
        headerAlign: "center",
        nodeCount: byYear.get(year)!.length,
      });
    }

    return finalize(nodes, placedNodes, bands, totalWidth, totalHeight, orient);
  }

  // ===== VERTICAL: years are rows
  const rowWidth = V_MAX_INNER_WIDTH - V_LEFT_PAD - V_RIGHT_PAD;
  const nodesPerSubRow = Math.max(
    1,
    Math.floor((rowWidth + V_NODE_H_GAP) / (NODE_W + V_NODE_H_GAP)),
  );

  let yCursor = V_TOP_PAD;
  for (const year of years) {
    const yearNodes = byYear.get(year)!;
    const subRowCount = Math.max(1, Math.ceil(yearNodes.length / nodesPerSubRow));
    const rowInnerHeight =
      subRowCount * NODE_H + (subRowCount - 1) * V_NODE_H_GAP;
    const rowHeight = V_ROW_PAD_TOP + rowInnerHeight + V_ROW_PAD_BOTTOM;
    const idx = years.indexOf(year);

    bands.push({
      year,
      idx,
      rect: { x: 0, y: yCursor, width: V_MAX_INNER_WIDTH, height: rowHeight },
      header: { x: 0, y: yCursor, width: V_LEFT_PAD - 16, height: rowHeight },
      headerAlign: "left",
      nodeCount: yearNodes.length,
    });

    for (let i = 0; i < yearNodes.length; i++) {
      const n = yearNodes[i];
      const subRow = Math.floor(i / nodesPerSubRow);
      const colInRow = i % nodesPerSubRow;
      const nodesInThisSubRow = Math.min(
        nodesPerSubRow,
        yearNodes.length - subRow * nodesPerSubRow,
      );
      const subRowTotalWidth =
        nodesInThisSubRow * NODE_W + (nodesInThisSubRow - 1) * V_NODE_H_GAP;
      const subRowStartX = V_LEFT_PAD + (rowWidth - subRowTotalWidth) / 2;

      const x =
        subRowStartX + colInRow * (NODE_W + V_NODE_H_GAP) + NODE_W / 2;
      const y =
        yCursor +
        V_ROW_PAD_TOP +
        subRow * (NODE_H + V_NODE_H_GAP) +
        NODE_H / 2;

      placedNodes.push({
        slug: n.data.slug,
        x,
        y,
        width: NODE_W,
        height: NODE_H,
        org: n.data.org,
        node: n,
      });
    }

    yCursor += rowHeight + V_ROW_GAP;
  }

  const totalHeight = yCursor - V_ROW_GAP + V_BOT_PAD;
  const totalWidth = V_MAX_INNER_WIDTH;

  for (const b of bands) {
    b.rect.width = totalWidth;
  }

  return finalize(nodes, placedNodes, bands, totalWidth, totalHeight, orient);
}

// Build edges with V3.3 spatial-order stagger to prevent X-crossings.
// Group incoming edges by target → sort by source perp position → assign
// tgtIdx in that order so leftmost source enters target's leftmost slot
// (no curves need to swap sides → no crossings). Mirror on source side.
function finalize(
  nodes: NodeEntry[],
  placedNodes: Placed[],
  bands: Band[],
  W: number,
  H: number,
  orient: Orient,
): Layout {
  const placedById = new Map(placedNodes.map((p) => [p.slug, p]));

  type RawEdge = {
    v: string;
    w: string;
    type: Edge["type"];
    src: Placed;
    tgt: Placed;
  };

  const raw: RawEdge[] = [];
  for (const n of nodes) {
    const tgt = placedById.get(n.data.slug);
    if (!tgt) continue;
    for (const r of n.data.relationships) {
      const src = placedById.get(r.to);
      if (!src) continue;
      if (HIDDEN_EDGE_TYPES.has(r.type)) continue;
      raw.push({ v: r.to, w: n.data.slug, type: r.type, src, tgt });
    }
  }

  // h-orient stagger is along Y; v-orient along X.
  const srcPerp = (e: RawEdge) => (orient === "h" ? e.src.y : e.src.x);
  const tgtPerp = (e: RawEdge) => (orient === "h" ? e.tgt.y : e.tgt.x);
  const srcOrth = (e: RawEdge) => (orient === "h" ? e.src.x : e.src.y);
  const tgtOrth = (e: RawEdge) => (orient === "h" ? e.tgt.x : e.tgt.y);

  // Per-target: assign tgtIdx in source-perp order
  const tgtIdxOf = new Map<RawEdge, number>();
  const tgtTotalOf = new Map<RawEdge, number>();
  const byTarget = new Map<string, RawEdge[]>();
  for (const e of raw) {
    if (!byTarget.has(e.w)) byTarget.set(e.w, []);
    byTarget.get(e.w)!.push(e);
  }
  for (const group of byTarget.values()) {
    group.sort((a, b) => {
      const p = srcPerp(a) - srcPerp(b);
      if (p !== 0) return p;
      const o = srcOrth(a) - srcOrth(b);
      if (o !== 0) return o;
      return a.v.localeCompare(b.v);
    });
    group.forEach((e, i) => {
      tgtIdxOf.set(e, i);
      tgtTotalOf.set(e, group.length);
    });
  }

  // Per-source: mirror logic, sorted by target perp
  const srcIdxOf = new Map<RawEdge, number>();
  const srcTotalOf = new Map<RawEdge, number>();
  const bySource = new Map<string, RawEdge[]>();
  for (const e of raw) {
    if (!bySource.has(e.v)) bySource.set(e.v, []);
    bySource.get(e.v)!.push(e);
  }
  for (const group of bySource.values()) {
    group.sort((a, b) => {
      const p = tgtPerp(a) - tgtPerp(b);
      if (p !== 0) return p;
      const o = tgtOrth(a) - tgtOrth(b);
      if (o !== 0) return o;
      return a.w.localeCompare(b.w);
    });
    group.forEach((e, i) => {
      srcIdxOf.set(e, i);
      srcTotalOf.set(e, group.length);
    });
  }

  const edges: Edge[] = [];
  for (const e of raw) {
    const { d, mid, anchors } = directPath(e.src, e.tgt, orient, {
      srcIdx: srcIdxOf.get(e)!,
      srcTotal: srcTotalOf.get(e)!,
      tgtIdx: tgtIdxOf.get(e)!,
      tgtTotal: tgtTotalOf.get(e)!,
    });
    edges.push({
      v: e.v,
      w: e.w,
      type: e.type,
      d,
      midX: mid.x,
      midY: mid.y,
      anchors,
      label: edgeStyle[e.type]?.label ?? e.type,
    });
  }
  avoidLabelOverlaps(edges);
  return { W, H, placedNodes, edges, bands };
}
