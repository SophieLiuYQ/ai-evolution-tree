// Client-side state: parsed graph data + adjacency maps + pin state.
// Loaded once at init from the inline JSON embedded by Graph.astro.

export type Orient = "h" | "v";

export type EdgeStyle = { color: string; dash?: string; label: string };

export type GraphEdge = {
  v: string;
  w: string;
  type: string;
  d: string;
  midX: number;
  midY: number;
};

export type NodePos = { x: number; y: number; w: number; h: number };

export type GraphData = {
  edgeStyle: Record<string, EdgeStyle>;
  h: GraphEdge[];
  v: GraphEdge[];
  nodePos: Record<Orient, Record<string, NodePos>>;
};

export type Adjacency = Record<Orient, Record<string, string[]>>;

let _data: GraphData | null = null;
let _incoming: Adjacency = { h: {}, v: {} };
let _outgoing: Adjacency = { h: {}, v: {} };
let _pinnedSlug: string | null = null;

export function initState(): GraphData {
  const dataNode = document.getElementById("ai-tree-graph-data");
  _data = JSON.parse(dataNode?.textContent ?? "{}") as GraphData;
  _incoming = { h: {}, v: {} };
  _outgoing = { h: {}, v: {} };
  (["h", "v"] as const).forEach((o) => {
    for (const e of _data![o]) {
      (_incoming[o][e.w] ??= []).push(e.v);
      (_outgoing[o][e.v] ??= []).push(e.w);
    }
  });
  return _data;
}

export function graphData(): GraphData {
  if (!_data) throw new Error("graph state not initialized");
  return _data;
}

export const incoming = () => _incoming;
export const outgoing = () => _outgoing;

export const getPinned = () => _pinnedSlug;
export const setPinned = (s: string | null) => {
  _pinnedSlug = s;
};
