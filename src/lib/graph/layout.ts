import type {
  Band,
  Edge,
  Layout,
  NodeEntry,
  Orient,
  Placed,
  SortMode,
} from "./types";
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
import { normalizeOrg } from "../org-display";

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

// License bucket: "Open" only for `open_weights` (downloadable). Papers
// describe a model but don't ship weights — they belong to "Open
// (research)" in the by-license layout view but not under "Open" in the
// filter sense (Open source = downloadable). Anything else (api, product,
// demo) is "Closed".
function licenseKey(n: NodeEntry): string {
  const rt = n.data.model_spec?.release_type;
  if (rt === "open_weights") return "Open";
  if (rt === "paper" || !rt) return "Open (research)";
  return "Closed";
}

export function familyKey(n: NodeEntry): string {
  const explicit = n.data.model_spec?.family;
  if (explicit) return explicit;

  const slug = n.data.slug;
  const org = normalizeOrg(n.data.org);

  // Heuristic families for fast-moving model lines.
  if (org === "OpenAI") {
    if (/^gpt-/.test(slug)) return "OpenAI GPT";
    if (/^o\d/.test(slug) || /^o-/.test(slug) || slug === "o1" || slug === "o3") return "OpenAI o-series";
    if (/^sora/.test(slug)) return "OpenAI Sora";
  }
  if (org === "Anthropic" && /^claude/.test(slug)) return "Anthropic Claude";
  if ((org === "Google/DeepMind" || org === "Google DeepMind" || org === "Google") && /^gemini/.test(slug)) return "Google Gemini";
  if (/^qwen-/.test(slug)) return "Qwen";
  if (/^deepseek-/.test(slug)) return "DeepSeek";
  if (/^grok-/.test(slug)) return "xAI Grok";
  if (/^kimi-/.test(slug)) return "Moonshot Kimi";
  if (/^minimax-/.test(slug) || /^hailuo-/.test(slug)) return "MiniMax";
  if (/^flux-/.test(slug) || org === "Black Forest Labs") return "FLUX";
  if (/^runway-/.test(slug) || org === "Runway") return "Runway";

  // Default: group by lab for models; keep research/papers in one lane.
  const rt = n.data.model_spec?.release_type;
  if (!rt || rt === "paper") return "Research / Methods";
  return org;
}

// Cross-axis key for grid layouts. Empty string for chronological (no grid).
function crossKeyOf(n: NodeEntry, mode: SortMode): string {
  if (mode === "byFamily") return familyKey(n);
  if (mode === "byOrg") return n.data.org;
  if (mode === "byLicense") return licenseKey(n);
  return "";
}

// Extra padding to make room for the cross-axis label strip (top in v,
// left in h). Year is ALWAYS the primary axis; sort key is the secondary.
const CROSS_HEADER_TOP_H = 56; // v: top strip height showing company/type names
const CROSS_HEADER_LEFT_W = 160; // h: left strip width showing company/type names

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

    // ===== H + grid (byOrg / byLicense): year cols × cross rows.
    // Cards at (year, key) stack vertically inside cell. If the stack is
    // too tall, the cell wraps into sub-columns (side-by-side sub-stacks).
    // Year column width expands to fit the widest wrap required at that year.
    const STACK_GAP = 8;
    const ROW_PAD_TOP = 6;
    const ROW_PAD_BOT = 14;
    const WRAP_THRESHOLD_H = 5;
    const MAX_COL_SPAN_H = 3;

    // 1. Per (row, year) stack counts → deduce col span per YEAR (width of
    //    year column), and effective max stack per ROW (row height).
    const stackCounts: number[][] = crossKeys.map(() => years.map(() => 0));
    for (let colIdx = 0; colIdx < years.length; colIdx++) {
      const year = years[colIdx];
      for (const n of byYear.get(year)!) {
        const ki = crossIdxOf(crossKeyOf(n, sortMode));
        if (ki < 0) continue;
        stackCounts[ki][colIdx]++;
      }
    }
    // Year column span: max stack across all rows at this year → how many
    // sub-columns the year column must accommodate.
    const colSpanByYear: number[] = years.map((_, colIdx) => {
      let m = 1;
      for (let ki = 0; ki < crossKeys.length; ki++) {
        if (stackCounts[ki][colIdx] > m) m = stackCounts[ki][colIdx];
      }
      return Math.min(MAX_COL_SPAN_H, Math.max(1, Math.ceil(m / WRAP_THRESHOLD_H)));
    });
    // Row effective max stack: after wrapping, max across years is
    // ceil(stackCount / colSpanByYear[colIdx]).
    const maxStackByRow = crossKeys.map((_, ki) => {
      let m = 1;
      for (let colIdx = 0; colIdx < years.length; colIdx++) {
        const span = colSpanByYear[colIdx];
        const eff = Math.ceil(stackCounts[ki][colIdx] / span);
        if (eff > m) m = eff;
      }
      return m;
    });

    // 2. Per-row heights + cumulative Y starts
    const rowHeights = maxStackByRow.map(
      (m: number) => ROW_PAD_TOP + m * NODE_H + (m - 1) * STACK_GAP + ROW_PAD_BOT,
    );
    const rowYStarts: number[] = [];
    let yAcc = CROSS_HEADER_TOP_H;
    for (const rh of rowHeights) {
      rowYStarts.push(yAcc);
      yAcc += rh;
    }
    const totalRowsH = yAcc + 24;

    // 3. Variable-width year columns: cumulative X starts
    const yearXStart: number[] = [];
    let xAccH = CROSS_HEADER_LEFT_W + H_SIDE_PAD;
    for (let colIdx = 0; colIdx < years.length; colIdx++) {
      yearXStart.push(xAccH);
      xAccH += colSpanByYear[colIdx] * H_COL_W;
    }
    const totalWidthH = xAccH - H_COL_GAP + H_SIDE_PAD;

    // 4. Year column bands — each spans colSpan columns
    for (let colIdx = 0; colIdx < years.length; colIdx++) {
      const year = years[colIdx];
      const xLeft = yearXStart[colIdx];
      const w = colSpanByYear[colIdx] * H_COL_W - H_COL_GAP;
      bands.push({
        key: year,
        label: String(year),
        idx: colIdx,
        rect: { x: xLeft, y: 0, width: w, height: totalRowsH },
        header: { x: xLeft, y: 8, width: w, height: CROSS_HEADER_TOP_H - 16 },
        headerAlign: "center",
        nodeCount: byYear.get(year)?.length ?? 0,
      });
    }

    // 5. Cross-axis (rows) bands
    const crossBandsH: Band[] = crossKeys.map((k, i) => ({
      key: k,
      label: k,
      idx: i,
      rect: { x: 0, y: rowYStarts[i], width: totalWidthH, height: rowHeights[i] },
      header: {
        x: 4,
        y: rowYStarts[i],
        width: CROSS_HEADER_LEFT_W - 8,
        height: rowHeights[i],
      },
      headerAlign: "left",
      nodeCount: 0,
    }));

    // 6. Place cards, wrapping stacks into colSpanByYear sub-columns
    for (let colIdx = 0; colIdx < years.length; colIdx++) {
      const year = years[colIdx];
      const span = colSpanByYear[colIdx];
      // Bucket cards by cross key so we know total count per cell
      const cellNodes = new Map<number, NodeEntry[]>();
      for (const n of byYear.get(year)!) {
        const ki = crossIdxOf(crossKeyOf(n, sortMode));
        if (ki < 0) continue;
        if (!cellNodes.has(ki)) cellNodes.set(ki, []);
        cellNodes.get(ki)!.push(n);
      }
      for (const [ki, arr] of cellNodes.entries()) {
        const perCol = Math.ceil(arr.length / span);
        for (let s = 0; s < arr.length; s++) {
          const n = arr[s];
          const subCol = Math.floor(s / perCol);
          const subRow = s % perCol;
          const xCenter = yearXStart[colIdx] + subCol * H_COL_W + NODE_W / 2;
          const yCenter =
            rowYStarts[ki] + ROW_PAD_TOP + subRow * (NODE_H + STACK_GAP) + NODE_H / 2;
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
        // Left-align: cards flow right from the year label with no
        // leading gap, so years with few cards don't land adrift in
        // the middle of the row (per user feedback 2026-04-21). Years
        // with many cards still use the full rowWidth.
        const subRowStartX = V_LEFT_PAD;
        const x = subRowStartX + colInRow * (NODE_W + V_NODE_H_GAP) + NODE_W / 2;
        // Silence unused-var warning for the old centered metric.
        void nodesInThisSubRow;
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

  // ===== V + grid (byOrg / byLicense): year rows × cross columns
  // Cards at (year, key) stack vertically. If a cross key's largest cell
  // exceeds WRAP_THRESHOLD, that key gets allocated multiple sub-columns
  // (max 3) so cards wrap into a sub-grid inside the cell instead of a
  // towering stack — keeps year rows from ballooning vertically.
  const COL_W_V = NODE_W + V_NODE_H_GAP;
  const WRAP_THRESHOLD = 5;
  const MAX_COL_SPAN = 3;

  // 1. Per-key max stack count across all years → colSpan per key
  const maxStackByKey: number[] = crossKeys.map(() => 1);
  for (const year of years) {
    const counts = new Map<number, number>();
    for (const n of byYear.get(year)!) {
      const ki = crossIdxOf(crossKeyOf(n, sortMode));
      if (ki < 0) continue;
      counts.set(ki, (counts.get(ki) ?? 0) + 1);
    }
    for (const [ki, c] of counts) {
      if (c > maxStackByKey[ki]) maxStackByKey[ki] = c;
    }
  }
  const colSpanByKey = maxStackByKey.map((m) =>
    Math.min(MAX_COL_SPAN, Math.max(1, Math.ceil(m / WRAP_THRESHOLD))),
  );

  // 2. Cumulative X start per key (variable-width columns)
  const keyXStart: number[] = [];
  let xAcc = V_LEFT_PAD;
  for (let i = 0; i < crossKeys.length; i++) {
    keyXStart.push(xAcc);
    xAcc += colSpanByKey[i] * COL_W_V;
  }
  const totalWidthV = xAcc - V_NODE_H_GAP + V_RIGHT_PAD;

  let yCursorV = V_TOP_PAD + CROSS_HEADER_TOP_H + 8;
  for (let rowIdx = 0; rowIdx < years.length; rowIdx++) {
    const year = years[rowIdx];
    const groupNodes = byYear.get(year)!;
    const stackByKey = new Map<string, NodeEntry[]>();
    for (const n of groupNodes) {
      const k = crossKeyOf(n, sortMode);
      if (!stackByKey.has(k)) stackByKey.set(k, []);
      stackByKey.get(k)!.push(n);
    }
    // Effective stack height after wrapping into colSpan sub-columns
    const effectiveMaxStack = Math.max(
      1,
      ...Array.from(stackByKey.entries()).map(([k, arr]) => {
        const ki = crossIdxOf(k);
        const span = ki >= 0 ? colSpanByKey[ki] : 1;
        return Math.ceil(arr.length / span);
      }),
    );
    const rowInnerHeight =
      effectiveMaxStack * NODE_H + (effectiveMaxStack - 1) * V_NODE_H_GAP;
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

    // Place cards within each cell, wrapping into colSpan sub-columns.
    // Order: down the first sub-column, then down the second, etc.
    for (const [k, cellNodes] of stackByKey.entries()) {
      const ki = crossIdxOf(k);
      if (ki < 0) continue;
      const span = colSpanByKey[ki];
      const perCol = Math.ceil(cellNodes.length / span);
      for (let s = 0; s < cellNodes.length; s++) {
        const n = cellNodes[s];
        const subCol = Math.floor(s / perCol);
        const subRow = s % perCol;
        const x = keyXStart[ki] + subCol * COL_W_V + NODE_W / 2;
        const y =
          yCursorV +
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
    }
    yCursorV += rowHeight + V_ROW_GAP;
  }
  const totalHeightV = yCursorV - V_ROW_GAP + V_BOT_PAD;

  const crossBandsV: Band[] = crossKeys.map((k, i) => ({
    key: k,
    label: k,
    idx: i,
    rect: {
      x: keyXStart[i],
      y: 0,
      width: colSpanByKey[i] * COL_W_V - V_NODE_H_GAP,
      height: totalHeightV,
    },
    header: {
      x: keyXStart[i],
      y: V_TOP_PAD,
      width: colSpanByKey[i] * COL_W_V - V_NODE_H_GAP,
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
      // Graph view combines "open alternative" into the generic "alternative".
      const type = (r.type === "open_alt_to" ? "competes_with" : r.type) as Edge["type"];
      raw.push({ v: r.to, w: n.data.slug, type, src, tgt });
    }
  }

  // Year-block detection: edges whose source and target share a year
  // route via side-bulge so labels sit OUTSIDE the year block (intra-
  // year cards are dense, the curve mid-point would otherwise land on
  // an intermediate sub-row card).
  const yearOf = (p: Placed) => p.node.data.date.getFullYear();

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

  // Source-side stagger is bucketed by routing class: edges that route
  // via side-bulge (sameBlock) get their own 0..N index, edges that
  // route via direct cubic (crossBlock) get a separate 0..M index. This
  // keeps a hub like GPT-5.5 (42 outgoing) from blowing the side-fan
  // arc to 800px just because the SAMEBLOCK fan has 42 distinct slots —
  // most of those 42 are cross-year edges that don't side-bulge at all.
  const srcIdxOf = new Map<RawEdge, number>();
  const srcTotalOf = new Map<RawEdge, number>();
  const isSameBlock = (e: RawEdge) => yearOf(e.src) === yearOf(e.tgt);
  const bySourceClass = new Map<string, RawEdge[]>();
  for (const e of raw) {
    const key = `${e.v}|${isSameBlock(e) ? "B" : "X"}`;
    if (!bySourceClass.has(key)) bySourceClass.set(key, []);
    bySourceClass.get(key)!.push(e);
  }
  for (const group of bySourceClass.values()) {
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
      sameBlock: yearOf(e.src) === yearOf(e.tgt),
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
