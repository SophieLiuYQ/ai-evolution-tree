import type { CollectionEntry } from "astro:content";

export type NodeEntry = CollectionEntry<"nodes">;
export type Rel = NodeEntry["data"]["relationships"][number];
export type Orient = "h" | "v";

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
  year: number;
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
  bands: Band[];
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
