import type { CollectionEntry } from "astro:content";

export type NodeEntry = CollectionEntry<"nodes">;
export type Rel = NodeEntry["data"]["relationships"][number];
export type Orient = "h" | "v";
// Only `chronological` is user-facing as of 2026-04-21; `byOrg` /
// `byLicense` were retired in favour of the LegendPanel filter rows.
// SortMode type kept broad to avoid a cascade of TS changes in the
// layout engine, but SORT_MODES below is the single source of truth
// for the UI: trim it and the whole system (panes, payload, filters)
// shrinks to match.
export type SortMode = "chronological" | "byFamily" | "byOrg" | "byLicense";

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "chronological", label: "Date" },
  { id: "byFamily", label: "Family" },
];

export type Placed = {
  slug: string;
  x: number; // center
  y: number; // center
  width: number;
  height: number;
  org: string;
  node: NodeEntry;
};

export type Edge = {
  v: string;
  w: string;
  type: Rel["type"];
  d: string;
  midX: number;
  midY: number;
  anchors: { x: number; y: number }[];
  label: string;
};

export type Band = {
  key: string | number;
  label: string;
  idx: number;
  rect: { x: number; y: number; width: number; height: number };
  header: { x: number; y: number; width: number; height: number };
  headerAlign: "center" | "left";
  nodeCount: number;
};

export type Layout = {
  W: number;
  H: number;
  placedNodes: Placed[];
  edges: Edge[];
  /** Year axis bands (rows in v, columns in h). */
  bands: Band[];
  /** Legacy secondary axis (byOrg/byLicense grouping). No longer
   *  populated since both sort modes were retired. */
  crossBands?: Band[];
};

export type EdgeStagger = {
  srcIdx: number;
  srcTotal: number;
  tgtIdx: number;
  tgtTotal: number;
  /** True when source and target share the same year-block (same year
   *  row in v-orient, same year column in h-orient). Triggers side-bulge
   *  routing so the curve loops past the block instead of passing
   *  through intermediate sub-row cards. */
  sameBlock?: boolean;
};

export type EdgeStyle = {
  color: string;
  dash?: string;
  label: string;
};
