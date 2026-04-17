import type { CollectionEntry } from "astro:content";

export type NodeEntry = CollectionEntry<"nodes">;
export type Rel = NodeEntry["data"]["relationships"][number];
export type Orient = "h" | "v";
export type SortMode = "chronological" | "byOrg" | "byType";

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "chronological", label: "Date" },
  { id: "byOrg", label: "Company" },
  { id: "byType", label: "Type" },
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
  /** Generic group identifier — year number for chronological, slug for org/type. */
  key: string | number;
  /** Display label shown in the band header (year, company name, or type name). */
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
  /** Primary axis bands (years — rows in v, columns in h). */
  bands: Band[];
  /** Secondary axis bands (sort keys — columns in v, rows in h). Only
   *  populated when sort mode is byOrg or byType. */
  crossBands?: Band[];
};

export type EdgeStagger = {
  srcIdx: number;
  srcTotal: number;
  tgtIdx: number;
  tgtTotal: number;
};

export type EdgeStyle = {
  color: string;
  dash?: string;
  label: string;
};
