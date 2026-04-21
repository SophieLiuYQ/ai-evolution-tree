// Client-side state: parsed graph data + adjacency maps + pin/sort state.
// Loaded once at init from the inline JSON embedded by Graph.astro.

export type Orient = "h" | "v";
export type SortMode = "chronological" | "byOrg" | "byLicense";

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
    for (const m of ["chronological", "byOrg", "byLicense"] as SortMode[]) {
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

// ===== Edge-type visibility =====
// Per-type on/off filter. Default: all visible types enabled. Restored
// from localStorage on init. Hover and zoom skip rendering edges whose
// type is currently disabled.
const EDGE_TYPES_KEY = "ai-tree:edgeTypes";
let _enabledEdgeTypes = new Set<string>();

function persistEdgeTypes() {
  try {
    localStorage.setItem(
      EDGE_TYPES_KEY,
      JSON.stringify(Array.from(_enabledEdgeTypes)),
    );
  } catch {}
}

export function initEdgeTypeState() {
  if (!_data) return;
  const all = Object.keys(_data.edgeStyle);
  _enabledEdgeTypes = new Set(all);
  try {
    const raw = localStorage.getItem(EDGE_TYPES_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        _enabledEdgeTypes = new Set(saved.filter((t) => all.includes(t)));
      }
    }
  } catch {}
}

export const isEdgeTypeEnabled = (t: string) => _enabledEdgeTypes.has(t);

export function setEdgeTypeEnabled(t: string, on: boolean) {
  if (on) _enabledEdgeTypes.add(t);
  else _enabledEdgeTypes.delete(t);
  persistEdgeTypes();
}

export function setAllEdgeTypesEnabled(on: boolean) {
  if (!_data) return;
  if (on) _enabledEdgeTypes = new Set(Object.keys(_data.edgeStyle));
  else _enabledEdgeTypes.clear();
  persistEdgeTypes();
}

export const allVisibleEdgeTypes = (): string[] =>
  _data ? Object.keys(_data.edgeStyle) : [];

// ===== Node-type visibility =====
// Per-category on/off filter for the cards themselves. Default: all
// types enabled (no filter). A card is shown if AT LEAST ONE of its
// category[] tags is currently enabled — same OR semantics as a
// "show only selected" filter. Cards whose categories don't
// intersect get dimmed via .node-type-filtered (Card.astro CSS).
const NODE_TYPES_KEY = "ai-tree:nodeTypes";
let _enabledNodeTypes = new Set<string>();
let _allKnownNodeTypes: string[] = [];

function persistNodeTypes() {
  try {
    localStorage.setItem(
      NODE_TYPES_KEY,
      JSON.stringify(Array.from(_enabledNodeTypes)),
    );
  } catch {}
}

export function initNodeTypeState(allTypes: string[]) {
  _allKnownNodeTypes = allTypes.slice();
  _enabledNodeTypes = new Set(allTypes);
  try {
    const raw = localStorage.getItem(NODE_TYPES_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        _enabledNodeTypes = new Set(saved.filter((t) => allTypes.includes(t)));
      }
    }
  } catch {}
}

export const isNodeTypeEnabled = (t: string) => _enabledNodeTypes.has(t);

export function setNodeTypeEnabled(t: string, on: boolean) {
  if (on) _enabledNodeTypes.add(t);
  else _enabledNodeTypes.delete(t);
  persistNodeTypes();
}

export function setAllNodeTypesEnabled(on: boolean) {
  if (on) _enabledNodeTypes = new Set(_allKnownNodeTypes);
  else _enabledNodeTypes.clear();
  persistNodeTypes();
}

/** Returns true if the card with the given category[] passes the
 *  current node-type filter (i.e. at least one tag is enabled). An
 *  empty enabled set means everything is filtered out. */
export function nodePassesFilter(cats: readonly string[]): boolean {
  for (const c of cats) {
    if (_enabledNodeTypes.has(c)) return true;
  }
  return false;
}

// ===== License visibility =====
// Two-bucket filter (open / closed) layered on top of the node-type
// filter. A card must pass BOTH dimensions to be shown.
const LICENSE_KEY = "ai-tree:license";
let _enabledLicenses = new Set<string>(["open", "closed"]);

function persistLicenses() {
  try {
    localStorage.setItem(
      LICENSE_KEY,
      JSON.stringify(Array.from(_enabledLicenses)),
    );
  } catch {}
}

export function initLicenseState(allKeys: string[]) {
  _enabledLicenses = new Set(allKeys);
  try {
    const raw = localStorage.getItem(LICENSE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        _enabledLicenses = new Set(saved.filter((t) => allKeys.includes(t)));
      }
    }
  } catch {}
}

export const isLicenseEnabled = (k: string) => _enabledLicenses.has(k);

export function setLicenseEnabled(k: string, on: boolean) {
  if (on) _enabledLicenses.add(k);
  else _enabledLicenses.delete(k);
  persistLicenses();
}

export function nodePassesLicenseFilter(license: string): boolean {
  return _enabledLicenses.has(license);
}

// ===== Org / Company visibility =====
// Long list — 50+ orgs in the tree. Otherwise same pattern as the
// other filters. AND-ed with node-types and license.
const ORG_KEY = "ai-tree:orgs";
let _enabledOrgs = new Set<string>();
let _allKnownOrgs: string[] = [];

function persistOrgs() {
  try {
    localStorage.setItem(ORG_KEY, JSON.stringify(Array.from(_enabledOrgs)));
  } catch {}
}

export function initOrgState(allOrgs: string[]) {
  _allKnownOrgs = allOrgs.slice();
  _enabledOrgs = new Set(allOrgs);
  try {
    const raw = localStorage.getItem(ORG_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        _enabledOrgs = new Set(saved.filter((o) => allOrgs.includes(o)));
      }
    }
  } catch {}
}

export const isOrgEnabled = (o: string) => _enabledOrgs.has(o);

export function setOrgEnabled(o: string, on: boolean) {
  if (on) _enabledOrgs.add(o);
  else _enabledOrgs.delete(o);
  persistOrgs();
}

export function setAllOrgsEnabled(on: boolean) {
  if (on) _enabledOrgs = new Set(_allKnownOrgs);
  else _enabledOrgs.clear();
  persistOrgs();
}

export function nodePassesOrgFilter(org: string): boolean {
  return _enabledOrgs.has(org);
}
