// Client-side state: parsed graph data + adjacency maps + pin/sort state.
// Loaded once at init from the inline JSON embedded by Graph.astro.

export type Orient = "h" | "v";
export type SortMode = "chronological" | "byOrg" | "byType";

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

type Variant = { edges: GraphEdge[]; nodePos: Record<string, NodePos> };

export type GraphData = {
  edgeStyle: Record<string, EdgeStyle>;
  layouts: Record<Orient, Record<SortMode, Variant>>;
};

export type Adjacency = Record<Orient, Record<string, string[]>>;

let _data: GraphData | null = null;
// Adjacency depends on edges, which depends on (orient, sortMode). We
// rebuild lazily; cached per (orient, sortMode) pair.
const _incomingCache = new Map<string, Record<string, string[]>>();
const _outgoingCache = new Map<string, Record<string, string[]>>();
let _pinnedSlug: string | null = null;
let _currentSort: SortMode = "chronological";

function buildAdjacency(orient: Orient, mode: SortMode) {
  const key = `${orient}:${mode}`;
  if (_incomingCache.has(key)) return;
  const inc: Record<string, string[]> = {};
  const out: Record<string, string[]> = {};
  for (const e of _data!.layouts[orient][mode].edges) {
    (inc[e.w] ??= []).push(e.v);
    (out[e.v] ??= []).push(e.w);
  }
  _incomingCache.set(key, inc);
  _outgoingCache.set(key, out);
}

export function initState(): GraphData {
  const dataNode = document.getElementById("ai-tree-graph-data");
  _data = JSON.parse(dataNode?.textContent ?? "{}") as GraphData;
  // Pre-build adjacency for every variant so hover/zoom never blocks.
  for (const o of ["h", "v"] as Orient[]) {
    for (const m of ["chronological", "byOrg", "byType"] as SortMode[]) {
      buildAdjacency(o, m);
    }
  }
  return _data;
}

export function graphData(): GraphData {
  if (!_data) throw new Error("graph state not initialized");
  return _data;
}

// Active layout slice for the current orient + sort mode.
export const layoutFor = (orient: Orient, mode?: SortMode): Variant =>
  _data!.layouts[orient][mode ?? _currentSort];

export const edgesFor = (orient: Orient): GraphEdge[] =>
  layoutFor(orient).edges;

export const nodePosFor = (orient: Orient): Record<string, NodePos> =>
  layoutFor(orient).nodePos;

// Adjacency lookups — compatible with the previous incoming/outgoing API.
export const incoming = () =>
  ({
    h: _incomingCache.get(`h:${_currentSort}`) ?? {},
    v: _incomingCache.get(`v:${_currentSort}`) ?? {},
  }) as Adjacency;

export const outgoing = () =>
  ({
    h: _outgoingCache.get(`h:${_currentSort}`) ?? {},
    v: _outgoingCache.get(`v:${_currentSort}`) ?? {},
  }) as Adjacency;

export const getPinned = () => _pinnedSlug;
export const setPinned = (s: string | null) => {
  _pinnedSlug = s;
};

export const getSort = (): SortMode => _currentSort;
export const setSort = (m: SortMode) => {
  _currentSort = m;
};
