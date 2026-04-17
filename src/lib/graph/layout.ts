import type {
  Band,
  Edge,
  Layout,
  NodeEntry,
  Orient,
  Placed,
  SortMode,
} from "./types";
import { modelType } from "./text";
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
  for (const y of years) {
    byYear.get(y)!.sort((a, b) => a.data.date.getTime() - b.data.date.getTime());
  }
  return { byYear, years };
}

// Cross-axis key for grid layouts. Empty string for chronological (no grid).
function crossKeyOf(n: NodeEntry, mode: SortMode): string {
  if (mode === "byOrg") return n.data.org;
  if (mode === "byType") return modelType(n.data.category ?? []);
  return "";
}

// Extra padding to make room for the cross-axis label strip (top in v,
// left in h). Year is ALWAYS the primary axis; sort key is the secondary.
const CROSS_HEADER_TOP_H = 36; // v: top strip height showing company/type names
const CROSS_HEADER_LEFT_W = 130; // h: left strip width showing company/type names

export function computeLayout(
  nodes: NodeEntry[],
  byYearOriginal: Map<number, NodeEntry[]>,
  years: number[],
  orient: Orient,
  sortMode: SortMode = "chronological",
): Layout {
  const placedNodes: Placed[] = [];
  const bands: Band[] = [];

  // Re-sort within year by date asc (consistent across all modes)
  const byYear = new Map<number, NodeEntry[]>();
  for (const y of years) {
    byYear.set(
      y,
      [...byYearOriginal.get(y)!].sort(
        (a, b) => a.data.date.getTime() - b.data.date.getTime(),
      ),
    );
  }

  // Cross-axis keys (alphabetical) for non-chronological modes
  const crossKeys: string[] = [];
  if (sortMode !== "chronological") {
    const set = new Set<string>();
    for (const n of nodes) set.add(crossKeyOf(n, sortMode));
    crossKeys.push(...Array.from(set).sort());
  }
  const crossIdxOf = (s: string) => crossKeys.indexOf(s);

  // ===== HORIZONTAL: year = column (X axis), sort key = row (Y axis when grid)
  if (orient === "h") {
    if (sortMode === "chronological") {
      const colHeights: number[] = [];
      for (let colIdx = 0; colIdx < years.length; colIdx++) {
        const year = years[colIdx];
        const yearNodes = byYear.get(year)!;
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
      for (let colIdx = 0; colIdx < years.length; colIdx++) {
        const year = years[colIdx];
        const xLeft = H_SIDE_PAD + colIdx * H_COL_W;
        bands.push({
          key: year,
          label: String(year),
          idx: colIdx,
          rect: { x: xLeft, y: 0, width: NODE_W, height: totalHeight },
          header: { x: xLeft, y: 8, width: NODE_W, height: 42 },
          headerAlign: "center",
          nodeCount: yearNodes(byYear, year),
        });
      }
      return finalize(nodes, placedNodes, bands, totalWidth, totalHeight, orient);
    }

    // ===== H + grid (byOrg / byType): year columns × cross rows
    // Cards from same (year, key) stack horizontally inside that cell.
    // Y positions: indexed by crossKeys, with a left header strip for labels.
    const ROW_H = NODE_H + 14;
    const totalRowsH = CROSS_HEADER_TOP_H + crossKeys.length * ROW_H + 24;
    const totalWidthH =
      CROSS_HEADER_LEFT_W +
      H_SIDE_PAD +
      years.length * H_COL_W -
      H_COL_GAP +
      H_SIDE_PAD;
    // Year column bands
    for (let colIdx = 0; colIdx < years.length; colIdx++) {
      const year = years[colIdx];
      const xLeft = CROSS_HEADER_LEFT_W + H_SIDE_PAD + colIdx * H_COL_W;
      bands.push({
        key: year,
        label: String(year),
        idx: colIdx,
        rect: { x: xLeft, y: 0, width: NODE_W, height: totalRowsH },
        header: { x: xLeft, y: 8, width: NODE_W, height: CROSS_HEADER_TOP_H - 16 },
        headerAlign: "center",
        nodeCount: byYear.get(year)?.length ?? 0,
      });
    }
    // Cross-axis (rows) bands
    const crossBandsH: Band[] = crossKeys.map((k, i) => ({
      key: k,
      label: k,
      idx: i,
      rect: {
        x: 0,
        y: CROSS_HEADER_TOP_H + i * ROW_H,
        width: totalWidthH,
        height: ROW_H,
      },
      header: {
        x: 4,
        y: CROSS_HEADER_TOP_H + i * ROW_H,
        width: CROSS_HEADER_LEFT_W - 8,
        height: ROW_H,
      },
      headerAlign: "left",
      nodeCount: 0, // recomputed below
    }));
    // Place cards: cell (year, key). Multiple cards in same cell tile horizontally.
    // Within a year column, the X is shared across all cells; we tile vertically
    // by crossKey index, and horizontally within the cell if duplicates.
    const cellCount = new Map<string, number>();
    for (let colIdx = 0; colIdx < years.length; colIdx++) {
      const year = years[colIdx];
      const yearNodes = byYear.get(year)!;
      for (const n of yearNodes) {
        const k = crossKeyOf(n, sortMode);
        const ki = crossIdxOf(k);
        if (ki < 0) continue;
        const cellKey = `${colIdx}|${ki}`;
        const stackIdx = cellCount.get(cellKey) ?? 0;
        cellCount.set(cellKey, stackIdx + 1);
        const xCenter =
          CROSS_HEADER_LEFT_W +
          H_SIDE_PAD +
          colIdx * H_COL_W +
          NODE_W / 2 +
          stackIdx * 6; // tiny offset for stacked duplicates
        const yCenter = CROSS_HEADER_TOP_H + ki * ROW_H + ROW_H / 2;
        placedNodes.push({
          slug: n.data.slug,
          x: xCenter,
          y: yCenter,
          width: NODE_W,
          height: NODE_H,
          org: n.data.org,
          node: n,
        });
        crossBandsH[ki].nodeCount++;
      }
    }
    const lay = finalize(nodes, placedNodes, bands, totalWidthH, totalRowsH, orient);
    lay.crossBands = crossBandsH;
    return lay;
  }

  // ===== VERTICAL =====
  if (sortMode === "chronological") {
    const rowWidth = V_MAX_INNER_WIDTH - V_LEFT_PAD - V_RIGHT_PAD;
    const nodesPerSubRow = Math.max(
      1,
      Math.floor((rowWidth + V_NODE_H_GAP) / (NODE_W + V_NODE_H_GAP)),
    );
    let yCursor = V_TOP_PAD;
    for (let rowIdx = 0; rowIdx < years.length; rowIdx++) {
      const year = years[rowIdx];
      const groupNodes = byYear.get(year)!;
      const subRowCount = Math.max(1, Math.ceil(groupNodes.length / nodesPerSubRow));
      const rowInnerHeight =
        subRowCount * NODE_H + (subRowCount - 1) * V_NODE_H_GAP;
      const rowHeight = V_ROW_PAD_TOP + rowInnerHeight + V_ROW_PAD_BOTTOM;
      bands.push({
        key: year,
        label: String(year),
        idx: rowIdx,
        rect: { x: 0, y: yCursor, width: V_MAX_INNER_WIDTH, height: rowHeight },
        header: { x: 0, y: yCursor, width: V_LEFT_PAD - 16, height: rowHeight },
        headerAlign: "left",
        nodeCount: groupNodes.length,
      });
      for (let i = 0; i < groupNodes.length; i++) {
        const n = groupNodes[i];
        const subRow = Math.floor(i / nodesPerSubRow);
        const colInRow = i % nodesPerSubRow;
        const nodesInThisSubRow = Math.min(
          nodesPerSubRow,
          groupNodes.length - subRow * nodesPerSubRow,
        );
        const subRowTotalWidth =
          nodesInThisSubRow * NODE_W + (nodesInThisSubRow - 1) * V_NODE_H_GAP;
        const subRowStartX = V_LEFT_PAD + (rowWidth - subRowTotalWidth) / 2;
        const x = subRowStartX + colInRow * (NODE_W + V_NODE_H_GAP) + NODE_W / 2;
        const y = yCursor + V_ROW_PAD_TOP + subRow * (NODE_H + V_NODE_H_GAP) + NODE_H / 2;
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
    for (const b of bands) b.rect.width = totalWidth;
    return finalize(nodes, placedNodes, bands, totalWidth, totalHeight, orient);
  }

  // ===== V + grid (byOrg / byType): year rows × cross columns
  // X positions: indexed by crossKeys, with a top header strip for labels.
  // Cards from same (year, key) stack vertically inside that cell.
  const COL_W_V = NODE_W + V_NODE_H_GAP;
  const totalWidthV =
    V_LEFT_PAD + crossKeys.length * COL_W_V - V_NODE_H_GAP + V_RIGHT_PAD;

  let yCursorV = V_TOP_PAD + CROSS_HEADER_TOP_H + 8;
  for (let rowIdx = 0; rowIdx < years.length; rowIdx++) {
    const year = years[rowIdx];
    const groupNodes = byYear.get(year)!;
    // Determine the tallest cell in this row (max stack count over crossKeys)
    const stackByKey = new Map<string, NodeEntry[]>();
    for (const n of groupNodes) {
      const k = crossKeyOf(n, sortMode);
      if (!stackByKey.has(k)) stackByKey.set(k, []);
      stackByKey.get(k)!.push(n);
    }
    const maxStack = Math.max(
      1,
      ...Array.from(stackByKey.values()).map((a) => a.length),
    );
    const rowInnerHeight =
      maxStack * NODE_H + (maxStack - 1) * V_NODE_H_GAP;
    const rowHeight = V_ROW_PAD_TOP + rowInnerHeight + V_ROW_PAD_BOTTOM;

    bands.push({
      key: year,
      label: String(year),
      idx: rowIdx,
      rect: { x: 0, y: yCursorV, width: totalWidthV, height: rowHeight },
      header: { x: 0, y: yCursorV, width: V_LEFT_PAD - 16, height: rowHeight },
      headerAlign: "left",
      nodeCount: groupNodes.length,
    });

    // Place each card at its (year, crossKey) cell, stacking vertically
    for (const [k, cellNodes] of stackByKey.entries()) {
      const ki = crossIdxOf(k);
      if (ki < 0) continue;
      for (let s = 0; s < cellNodes.length; s++) {
        const n = cellNodes[s];
        const x = V_LEFT_PAD + ki * COL_W_V + NODE_W / 2;
        const y =
          yCursorV +
          V_ROW_PAD_TOP +
          s * (NODE_H + V_NODE_H_GAP) +
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
    }
    yCursorV += rowHeight + V_ROW_GAP;
  }
  const totalHeightV = yCursorV - V_ROW_GAP + V_BOT_PAD;

  const crossBandsV: Band[] = crossKeys.map((k, i) => ({
    key: k,
    label: k,
    idx: i,
    rect: {
      x: V_LEFT_PAD + i * COL_W_V,
      y: 0,
      width: NODE_W,
      height: totalHeightV,
    },
    header: {
      x: V_LEFT_PAD + i * COL_W_V,
      y: V_TOP_PAD,
      width: NODE_W,
      height: CROSS_HEADER_TOP_H,
    },
    headerAlign: "center",
    nodeCount: 0, // recomputed
  }));
  // Count nodes per cross key
  for (const p of placedNodes) {
    const k = crossKeyOf(p.node, sortMode);
    const ki = crossIdxOf(k);
    if (ki >= 0) crossBandsV[ki].nodeCount++;
  }

  const lay = finalize(nodes, placedNodes, bands, totalWidthV, totalHeightV, orient);
  lay.crossBands = crossBandsV;
  return lay;
}

// Helper for the chronological branch above
function yearNodes(byYear: Map<number, NodeEntry[]>, year: number): number {
  return byYear.get(year)?.length ?? 0;
}

// (finalize unchanged from before — V3.3 spatial-order stagger)
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

  const srcPerp = (e: RawEdge) => (orient === "h" ? e.src.y : e.src.x);
  const tgtPerp = (e: RawEdge) => (orient === "h" ? e.tgt.y : e.tgt.x);
  const srcOrth = (e: RawEdge) => (orient === "h" ? e.src.x : e.src.y);
  const tgtOrth = (e: RawEdge) => (orient === "h" ? e.tgt.x : e.tgt.y);

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
  avoidLabelOverlaps(edges, placedNodes);
  return { W, H, placedNodes, edges, bands };
}
