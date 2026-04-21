# Graph-Based Data Visualization: Drawing Principles

Distilled from 18 sprints (v0.1 → v0.18) building the AI Evolution Tree —
a 73-node, 96-edge timeline-DAG with dual orientation, time-as-axis layout,
typed-relationship edges, and full label legibility.

This document is **methodology**, not a changelog. (For chronological
build history, see [DEVLOG.md](./DEVLOG.md). For schema specs, see
[NODE_SCHEMA.md](./NODE_SCHEMA.md).) The intent: codify load-bearing
decisions so future graph-viz projects can skip the iteration cost.

---

## 📦 File layout (where to look)

The graph is split across small, single-purpose files. Find the layer
you want to change before opening anything:

```
src/
├─ components/
│  ├─ Graph.astro                 ← shell: imports children + payload + CSS
│  └─ graph/
│     ├─ LegendPanel.astro        ← left aside (title, controls, legend)
│     ├─ OrientPane.astro         ← one SVG pane (h or v)
│     ├─ Card.astro               ← per-node card group + zoom/pin buttons
│     └─ ZoomModal.astro          ← top-layer modal markup (empty shell)
├─ lib/graph/                     ← BUILD-time TypeScript (Astro frontmatter)
│  ├─ types.ts                    ← Placed, Edge, Layout, EdgeStagger
│  ├─ constants.ts                ← colors, edgeStyle, sizes, hidden types
│  ├─ text.ts                     ← clip, fmtSpec, fmtCtx, fmtMonth
│  ├─ bands.ts                    ← year band gradient
│  ├─ routing.ts                  ← directPath, perpOffset, bezierAt, label collision
│  └─ layout.ts                   ← computeLayout + finalize (stagger, edge build)
└─ scripts/graph/                 ← CLIENT-time TypeScript (bundled by Vite)
   ├─ state.ts                    ← graphData parse + adjacency + pin state
   ├─ dom.ts                      ← buildPath, buildLabel, getActivePane
   ├─ hover.ts                    ← renderHover, clearHover, attachInteractions
   ├─ zoom.ts                     ← 1-hop layout + route + modal render
   ├─ orient.ts                   ← h/v toggle + storage
   └─ main.ts                     ← entry point (import in Graph.astro <script>)
```

Quick rules:
- Layout/routing math → `lib/graph/`
- Anything visible on the page that's NOT interactive → `components/graph/`
- Anything that runs after the page loads → `scripts/graph/`
- `Graph.astro` is just a wiring layer; resist the urge to grow it back.

If you change routing, update BOTH `lib/graph/routing.ts` AND
`scripts/graph/zoom.ts` (the zoom modal ports the same algorithm
client-side — see §VII duplication note).

---

## 🚨 Maintenance discipline (read first)

**This document is the iteration contract for graph code in this project.**
Every change to graph rendering / layout / interaction code MUST be
accompanied by a corresponding update to this file, in the same commit.

Why: without this discipline, every new sprint re-discovers bugs we
already fixed. With it, contributors can layer changes confidently
because they know what rules already hold. Small steps, fast iteration
(小步快跑) requires that the contract is always current.

**For contributors** (human or AI): when you edit `src/components/Graph.astro`
(or related layout / anchor / stagger / routing / labeling code):

1. Identify which section below your change touches
2. Edit that section to reflect the new rule, parameter, or fix
3. If you reverse a prior rule, update it (don't append contradictions)
4. If you learn what NOT to do, add it to Section X
5. Commit message references both files

For Claude Code sessions specifically, this rule is enforced by
`CLAUDE.md` in the project root.

**Sections most often updated**:
- §II Layout topology — when routing logic changes
- §III Anchor system — when label placement changes
- §IV Fan-out stagger — when handling multiple-edges-from-same-node
- §V Z-order — when render order changes
- §X Anti-patterns — every time you fix a regression you should have caught earlier

---

---

## I. Foundational architectural decisions

### Static-first beats runtime — until ~5,000 nodes

Build-time layout + inline SVG ships zero runtime infra. No DB process,
no graph query engine, no client computation cost. For 73 nodes / 96
edges, total build time is ~1.5s and homepage HTML is ~300KB inline SVG.

**Reconsider when**: graph exceeds ~5,000 nodes, or runtime traversal
queries (recommended-path, shortest-ancestry) become product features.
Until then: in-memory JS array beats Neo4j / Kuzu / DuckDB on developer
ergonomics, contributor PR friction, and cold-start time.

### Single source of truth: file-based, not database

Content lives in version-controlled text files (MDX or JSON). Git is the
"database." This makes:
- Diffs human-readable in PR review
- Schema migrations trivial (text find/replace)
- Branching/merging trivial (the contributor doesn't need DB tooling)

**Tradeoff**: lose the ability to enforce referential integrity at write
time. Compensate with build-time Zod schema validation + an audit script
that flags dangling references.

### Compute both layouts at build time, toggle via CSS

For dual-orientation views (horizontal LR + vertical TB), pre-compute
both SVGs at build and ship both inline. CSS `display: none` toggles
visibility. Cost: 2× HTML size. Benefit: instant orientation switch with
zero re-layout shift, no client-side computation, no flash-of-unstyled
content.

### Native browser scroll, no zoom

Reject custom zoom/pan UI. Use `overflow: auto` containers with SVG at
its native pixel size. Fonts are fixed at readable sizes (11px meta,
13px title). Users scroll with mousewheel/touchpad; orientation toggle
flips between H-scrolling-wide and V-scrolling-tall layouts.

**Why**: zoom-aware fonts are hard. Zoom + sticky elements are harder.
Native scroll is universal and well-debugged. Lock the visual contract
(fixed pixel sizes) and let the browser handle the rest.

---

## II. Layout topology

### Sort mode — year stays primary, sort key becomes the second axis

Year is **always** the primary axis (rows in v-orient, columns in
h-orient). The sort selector controls the SECONDARY axis:

| Sort | Primary axis (always year) | Secondary axis (cards positioned along) |
|---|---|---|
| chronological | year rows/cols | within-row date spread (no extra axis labels) |

**Removed `byType` (2026-04-20):** the single-bucket `modelType(cats, slug)` classifier was fundamentally lossy — a robotics VLA is *both* Agent AND Multimodal AND Generative, and forcing one bucket hid the overlap. Type is now rendered as *overlapping* tag pills in the node detail's `ModelSpec` section, not as a graph sort axis.

**Removed `byOrg` and `byLicense` (2026-04-21):** the LegendPanel filter
rows (Company, License) cover the same need — pick the subset you care
about — without pinning the user to a fixed grouping axis. With only
chronological surviving, the sort-mode UI (the "Sort within year"
segmented control) was removed from the LegendPanel entirely; the
`SortMode` type stays broader than `"chronological"` for backward
compat in `layout.ts`, but `SORT_MODES` exposes only chronological so
the 6-pane SSR matrix collapses to 2 (one per orient) and the cross-
axis code paths (crossKeyOf, licenseKey, cross-bands rendering) are
no longer reachable from the UI.

**V-orient left-align (2026-04-21):** vertical chronological used to
center cards within the year row (`subRowStartX = V_LEFT_PAD +
(rowWidth - subRowTotalWidth) / 2`), which left years with few cards
adrift in the middle of the row — a big empty band between the year
label and the first card. Switched to left-align (`subRowStartX =
V_LEFT_PAD`) so cards flow right from the year gutter with no lead-in
gap. Years with many cards still fill the full rowWidth, so the
visual difference is only in sparse-year rows. Paired with a tighter
`V_LEFT_PAD` (120 → 92) since the year label only needs ~80px.

For non-chronological modes, layout is a **2D grid**: each card lands
in cell `(year, sort-key)`. Multiple cards in the same cell stack
(vertically in v, horizontally in h with a small offset). Cells with
no data render as empty space — that's a feature; it makes "Anthropic
shipped nothing in 2018" visible at a glance.

#### Stack-wrap for oversized cells

When a single cell would stack more than `WRAP_THRESHOLD = 5` cards,
that axis slot is widened into multiple sub-columns (V mode) or the
year column is widened into multiple sub-columns (H mode), capped at
`MAX_COL_SPAN = 3`:

- **V mode**: colSpan is computed per **cross key** from its max stack
  across all years. Cross-band header spans the wider slot; cards wrap
  into sub-columns left→right, top→bottom inside the cell.
- **H mode**: colSpan is computed per **year** from the max stack in
  any row at that year. Year-band header spans the wider slot; cards
  wrap into sub-columns inside the year column.

Effective row (V) / row (H) height is recomputed as
`ceil(stackCount / colSpan) * NODE_H` so wrapping actually shortens
the tall axis instead of just spreading cards sideways.

A second `crossBands` array on Layout carries the secondary axis
labels (rendered as a header strip — top in v-orient, left in
h-orient). Year bands stay as the primary header; cross bands sit
orthogonal to them.

All 8 layouts (2 orients × 4 modes) are pre-computed at build and
emitted as separate `<OrientPane>` instances. The sort + orient
selectors toggle `display:none` between them — no live re-layout.

Implication: payload roughly triples (~3× edges + ~3× node positions).
At 73 nodes / ~200 visible edges the cost is acceptable; revisit if
the graph grows past ~5000 nodes.

### Time-as-axis is non-negotiable for timeline graphs

For temporal data, position along ONE axis MUST encode time. We chose:
- Horizontal layout: time = X axis (older left, newer right)
- Vertical layout: time = Y axis (older top, newer bottom)

Within a "time bin" (one year), nodes are arranged on the perpendicular
axis. This gives the user an immediate, predictable mental map: pick any
two nodes, and the spatial relationship encodes their temporal
relationship.

### Within a time bin, sort STRICTLY by date

Resist the temptation to use graph-layout libraries (dagre, ELK, etc.)
to sort within a bin for "minimum edge crossings." When tested, dagre
placed Dec at top of column (because of edge-crossing optimization),
violating user intuition.

**Rule**: within each year column/row, sort by `date.getTime()`
ascending. Jan first, Dec last. Always. Edge crossings are an acceptable
cost of intuitive layout.

### One routing strategy: direct cubic Bezier (V3.1 simplification)

V1/V2 used three different routing strategies (adjacent S-curve /
non-adjacent Manhattan / same-bin detour) selected by spatial
relationship. This created the **parallel-edge jitter bug**: multiple
edges from the same source all bent at `splitX = sxR + 30`, then ran
vertical at the same X coordinate. With ≥2 edges, the parallel
verticals looked like "blurry double lines" — neither cleanly merged
nor cleanly separated.

**V3.1 fix: ONE strategy = direct cubic Bezier.** Every edge curves
from source's right-middle to target's left-middle (h orient) or
src.bottom → tgt.top (v orient). No splitX. No detourX. No bend.

```typescript
// Forward edge (h orient)
const c1x = sxR + dx * 0.5;  // pull control points horizontally
const c2x = txL - dx * 0.5;  // (so curve enters/exits horizontally)
const d = `M ${sxR} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${txL} ${ty}`;
```

| Case | Routing |
|---|---|
| Forward edge (any column distance) | Direct cubic Bezier |
| Same-column / backward (rare) | Wide-arc Bezier looping outside via `c1x = sxR + 60` |

### Why direct curves beat Manhattan in V3

In V3 (dynamic edge rendering), only ~5-10 edges are visible at hover
time. Manhattan routing was over-engineered for this scale:

| Concern | V2 Manhattan | V3.1 Direct Bezier |
|---|---|---|
| Multiple edges from same src | Share splitX, parallel vertical jitter | Curves originate at different src positions, naturally diverge |
| Visual "directness" | Stair-stepped, sometimes long detours | Smooth diagonal — shortest visual path |
| Routes around other nodes | Yes (vertical at splitX, edges miss cards) | No (curves can pass over faded cards in lineage) |
| Anchor placement | Complex (which segment? horizontal? vertical?) | Simple (along the curve at parametric t) |
| Code complexity | ~160 lines for 3 strategies | ~60 lines for 1 strategy |

The "passes over faded cards" tradeoff: in V3, non-ancestor cards are
faded to opacity 0.18, so curves passing over them are clearly visible
as foreground edges. The visual hierarchy still reads: hovered node
(bold) > ancestors (full opacity, with edges between them) > everything
else (faded background).

### Routing constants for V3.1

| Constant | Value | Why |
|---|---|---|
| Bezier control offset | `dx * 0.5` | Tug control points to half the horizontal distance — tight S without overshoot |
| Backward-edge arc | `60 + srcIdx * 8` | Loop outside the source column; per-srcIdx widening prevents overlap of multiple backward edges |
| Source/target perpendicular pitch | adaptive (see §IV) | The ONLY stagger needed in V3.1 since there's no bend to stagger |

### Year-bin spacing

| Constant | Value | Why |
|---|---|---|
| `H_COL_GAP` | 50px | Horizontal gap between year columns. Must leave room for cubic Bezier to make a clean S — `dx * 0.5` control offset means even at 50px the curve pulls 25px on each side. |
| `V_ROW_GAP` | 40px | Vertical gap between year rows in v-orient. |
| `H_NODE_V_GAP` / `V_NODE_H_GAP` | 44px | Within a year, gap between sibling cards. Bigger than year-gap is OK because intra-year edges are rare; the user reads down the column more often. |

Tightening these reduces visual whitespace but compresses the edge-routing
corridor. If you go below ~40px H_COL_GAP, expect curves to look bunched
and labels to start overlapping cards — bump `STAGGER_PERP_BUDGET` or
revisit before going tighter.

---

## III. Anchor system (where labels go)

### Labels MUST sit on edge geometry

If a label drifts even 20px off its edge's actual line, users
immediately notice and the visual association breaks. The first
collision-avoidance algorithm we tried (shift Y until no collision)
produced "floating labels" — user feedback was instant: "labels don't
sit on the line."

**Rule**: a label's (x, y) MUST be a point ON the edge's path. Never
"shift label off the edge to avoid overlap." If you must move it, slide
it ALONG the path geometry.

### Generate multiple candidate anchors per edge

For each edge, compute 9 candidate label positions, all on the path,
at parameters `t = [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55, 0.25, 0.75]`.
The midpoint variants come first; spread-toward-endpoints come last.
This gives the avoider room to pull labels off card-occupied space.

### Two-pass collision avoidance: cards first, labels second

`avoidLabelOverlaps(edges, placedNodes)` checks BOTH placed labels AND
card rectangles. A label sitting on top of a card title is just as bad
as two labels overlapping each other — the user reads the card text
through the pill background. Original behavior only checked labels;
when an edge passed through an unrelated card, the label landed on
its title.

Pass 1: pick the first anchor that's clean of cards AND labels.
Pass 2: if all anchors fail the card test (rare — would mean the
entire visible curve sits inside cards), fall back to "clean of
labels only" so we still avoid label-on-label overlaps.
Fallback: anchors[0] (geometric midpoint).

### Flow-aligned anchors (the key insight)

Naive anchoring places labels at the geometric midpoint of each edge,
typically the middle of the vertical segment for Manhattan paths. This
**clusters labels at narrow X ranges** when many edges share a source —
because `splitX = sxR + 30` is approximately constant per source.

**Fix**: anchor labels on the segment that's *aligned with the layout's
flow direction*:
- **Horizontal layout (LR flow)**: anchor on horizontal segments
  (Y = ty, X varies along seg from splitX → txL). Different targets
  have different `ty` → labels naturally separate vertically.
- **Vertical layout (TB flow)**: anchor on vertical segments
  (X = tx, Y varies). Different targets have different `tx` → labels
  separate horizontally.

This single insight dropped label-overlap rate from 36 pairs to 2 pairs
out of 126 labels — a 94% reduction with zero visual disruption.

### Why flow-alignment works

In horizontal flow, the user's eye scans left-to-right following arrows.
Labels on horizontal segments sit *along* that scan direction, not
across it. Crucially, multiple edges from the same source have different
target Y values, so anchoring at target's row spreads labels along the
perpendicular axis automatically.

The general principle: **place labels along the path segment that's
parallel to the user's eye-movement direction**.

---

## IV. Fan-out stagger (preventing overlapping edges)

### One node, N edges → N distinct paths

When a hub node has multiple outgoing edges, naive routing makes every
edge:
- Start at the same point `(src.right, src.center_y)`
- Bend at the same X (`splitX = src.right + 30`)
- Share the same vertical segment until they peel off to different
  targets

Visually, N edges look like 1 thick line. The user sees a single
trunk, no branching detail.

**Three-axis stagger**:

```
Source perpendicular offset: each outgoing edge exits at a different Y
  (or X for vertical orient). Centered around node center.

Bend lane offset: each edge's splitX/detourX shifts by srcIdx * 8px
  so middle segments occupy distinct lanes.

Target perpendicular offset: each incoming edge enters at a different
  point on target's edge. Centered around node center.
```

### Center-symmetric distribution formula

```
perpOffset(idx, total) = (idx − (total - 1) / 2) × pitch
```

For `total = 1`: offset = 0 (no stagger when only one edge — important
for the common case).

For `total = 4, pitch = 5`: offsets = -7.5, -2.5, +2.5, +7.5 — symmetric
around node center.

For `total = 11, pitch = 5`: offsets span ±25px — visible but contained.

### Stagger pitch sizing — adaptive (v0.21)

Earlier versions used a FIXED pitch of 5px for perpendicular stagger
and 8px for bend offset. This worked OK for hub nodes (5px × 11 edges
= 55px spread, fits the 64px card) but produced a visually disastrous
"jitter doubling" effect for the 2-edge case: two edges 5px apart
look like a single blurry line, not two distinct lines.

**Lesson from v0.21**: human eye perceives ~10-15px as "clearly
distinct lines" and ~3-7px as "single jittery line." For visual
clarity, pitch must be ≥10px. But for hub nodes with 11 edges,
10px × 11 = 110px would push exit points off the card.

**Fix: adaptive pitch sizing**:

```typescript
function perpOffset(idx: number, total: number): number {
  if (total <= 1) return 0;
  // Adaptive: large pitch when few edges (clear train tracks),
  // shrinks to fit the budget when many edges
  const pitch = Math.min(STAGGER_PERP_MAX, STAGGER_PERP_BUDGET / (total - 1));
  return (idx - (total - 1) / 2) * pitch;
}
```

| Total edges | Pitch | Total spread | Reasoning |
|---|---|---|---|
| 2 | 16px | 16px | clear parallel tracks (max pitch) |
| 3 | 16px | 32px | still distinct |
| 5 | ~9.6px | 38.4px | starts shrinking to fit |
| 8 | ~5.5px | 38.4px | budget exhausted, packed |
| 11 | ~3.8px | 38px | tight but fits within 60% of card height |

The same adaptive logic applies to bend lane offset (capped at 24px,
budget = 70% of column gap).

**Why "≥10px = distinct"**: 1.6px stroke width × ~3 = ~5px minimum
visual "white space" between lines for them to read as separate.
Pitch needs to exceed that × 2 (one space between, one stroke each)
= 10px minimum to look like train tracks.

Validate: a hub node with 11 edges should still fit all stagger lanes
within 60% of card height. Test with the highest-degree node in your
dataset (Transformer with 11 outgoing in our case).

### Stagger only the ones that count

Hidden edge types (those excluded from rendering) MUST be excluded from
the source/target counts before computing stagger indexes. Otherwise
visible edges leave gaps where invisible edges "took" stagger slots,
breaking the fan-out symmetry.

### Spatial-order stagger (V3.3) — prevent X-crossings

Pitch and budget control the *spread* of stagger slots. The remaining
question is **which edge gets which slot**. Naive answer: assign in
iteration order (the order edges appear in the source data).

**That answer is wrong** and produces X-shaped crossings.

Failure mode: two sources at very different perp positions (e.g. a left-
column source and a same-column source) converge on one target. If the
left-column source happens to be later in MDX, it lands in the target's
*right* slot. Its curve must cross the same-column source's curve to
get there. Result: a tangled X, exactly the visual the user is trying
to read past.

**Rule: assign tgtIdx by source position along the perp axis.** For each
target, sort its incoming edges by `src.y` (h-orient) or `src.x`
(v-orient) ascending; the topmost/leftmost source gets `tgtIdx = 0`
(most-negative offset = topmost/leftmost slot on the target). Mirror
the rule on the source side: for each source, sort its outgoing edges
by target perp position to assign `srcIdx`.

```typescript
// Group by target; sort by source perp; assign tgtIdx.
for (const group of byTarget.values()) {
  group.sort((a, b) => srcPerp(a) - srcPerp(b)); // src.y for h, src.x for v
  group.forEach((e, i) => { tgtIdxOf.set(e, i); tgtTotalOf.set(e, group.length); });
}
```

The sort needs deterministic tie-breakers (orthogonal axis, then slug)
so two sources at the same perp position don't flip between builds.

Why this works: stagger slots are inherently ordered (most-negative to
most-positive offset along the perp axis). When that order matches the
spatial order of the sources, every curve goes "straight in" — no two
curves need to swap sides, so no two curves cross.

This rule is purely about *index assignment*. The pitch, budget, and
center-symmetric formula are unchanged.

---

## V. Z-order (visual layering)

### Render order matters for SVG (no z-index)

SVG renders in document order. Later elements draw on top. Current
stacking:

```
1. Cross-axis labels (byOrg/byLicense only) (bottom)
2. Year band backgrounds
3. Node cards
4. Edge paths                             (ON TOP of cards in V3.4+)
5. Edge labels                            (very top)
```

**V3.4 rule change — edges render on top of cards.** Earlier (V3–V3.3)
edges were rendered *under* nodes on the theory that opaque cards
would cleanly occlude any edges passing through them. This worked in
H mode where edges are short (span ~1-3 year columns). It broke in
V mode where long edges can span 10+ year rows — every intermediate
card covered the edge, leaving the user seeing only a blue stub near
the hovered card. Fix: render `<g class="edges">` AFTER `<g class="nodes">`
in OrientPane. The small 2px stroke at 0.85 opacity barely visually
competes with card text when an edge does cross a card, but the edge
is now always legible end-to-end. Labels still render last so their
pill rectangles sit on top of everything.

### Opaque label backgrounds

`fill-opacity="0.93"` looks fine until you put a label OVER another
edge's line and the line bleeds through (looks like strikethrough text).
**Always use `fill="white"` with default opacity 1**.

The reason for the temptation: 0.93 gives a "soft" look. Resist it. The
moment a label needs to occlude something behind it, you need 1.0.

---

## Va. Dynamic edge rendering (V3 architecture)

### The architectural pivot (v0.20)

V1 and V2 pre-rendered all edges as SVG `<path>` elements at build time
and used CSS opacity to fade non-relevant ones on hover. With 96 edges,
even at opacity 0.05 the visual was cluttered — overlapping paths that
the user couldn't visually parse.

**V3**: edges DON'T exist in the DOM at build time. Empty
`<g class="edges">` and `<g class="edge-labels">` groups are placeholders.
JavaScript reads embedded JSON edge data and dynamically creates SVG
elements ONLY for the hovered node's ancestor lineage. On mouseleave,
they're removed.

### Default state: ZERO edges visible

The graph is just nodes. No clutter. No background lines. The user sees
a clean Civ-tech-tree of cards and is invited to hover.

### Hover state: ~5-10 edges, no overlap with anything else

When hovering node N, the JS renders edges only for N's ancestor lineage
(BFS up the `incoming` adjacency map). Typical hub like Transformer:
~10 ancestor edges drawn, all the rest of the graph stays clean.

This is the load-bearing UX choice: the graph **acts as a study tool,
not a wall map**. The user explores by hover; the visual focus is one
lineage at a time.

### Embedded JSON contract

At the bottom of the figure, an inline `<script type="application/json">`
holds the precomputed edge geometry:

```json
{
  "edgeStyle": { "builds_on": { "color": "#2563EB", "label": "builds on" }, ... },
  "h": [ { "v": "backpropagation", "w": "alexnet", "type": "builds_on",
           "d": "M 564.0 91.5 C ...", "midX": 614, "midY": 97.75 }, ... ],
  "v": [ ... ]
}
```

Both panes' edges + the type-style map. JS picks the right pane's array
based on `localStorage.getItem("ai-tree:orient")`.

Size: ~30 KB JSON for 96 edges × 2 panes. Trivial vs the 300 KB inline
SVG it replaces.

### Dynamic SVG creation cookbook

```typescript
const NS = "http://www.w3.org/2000/svg";
const path = document.createElementNS(NS, "path");
path.setAttribute("d", e.d);
path.setAttribute("stroke", style.color);
path.setAttribute("marker-end", `url(#arrow-${orient}-${e.type})`);
edgesGroup.appendChild(path);
```

Critical: use `createElementNS` with the SVG namespace. `createElement("path")`
creates an HTML element that won't render inside SVG.

### Marker definitions stay at build time

The `<defs>` containing arrow markers (`<marker id="arrow-h-builds_on">`)
must exist at build so dynamic paths can reference them via `marker-end`.
These are tiny (6 markers × 2 panes = 12 markers).

### When to use V3 over V1/V2

Use V3 when:
- The static edge density makes the default view cluttered
- Users primarily explore via hover (not "scan all edges")
- Edge count is large enough that pre-rendering hurts perception

Stick with V1/V2 when:
- Edge count is small (<30) and they don't overlap visually
- The graph is meant to be readable without interaction (e.g., printed
  on paper, embedded in a static report)
- Users need to see all relationships at once for comparison

### Cost / benefit summary

| Concern | V1/V2 (pre-rendered) | V3 (dynamic) |
|---|---|---|
| Default visual clarity | poor at >50 edges | excellent at any scale |
| HTML payload | ~300 KB inline SVG | ~150 KB (saved 50% on edge SVG) |
| Initial render | full SVG tree | empty groups, instant |
| Hover responsiveness | CSS class toggle | JS DOM mutation (~5ms for 10 edges) |
| Required JS | optional (graph still readable) | mandatory |
| Print / no-JS environments | works | broken — no edges visible |
| Stagger / overlap analysis | global, complex | local to ~10 edges, often unnecessary |
| Architectural complexity | simple SVG | needs JSON data layer + JS render |

V3 trades static-friendliness for visual cleanliness. For a
JS-required interactive viewer (which this is), V3 wins on every axis
that matters.

---

## VI. Text and card constraints

### Hard truncation, not CSS overflow

SVG `<text>` elements don't support text-overflow ellipsis natively.
Truncate the string in code BEFORE rendering:

```typescript
function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
```

Set caps based on font size and card width:

| Field | Font | Cap | Reason |
|---|---|---|---|
| Title | 13px sans bold | 22 chars | Card 220px - stripe 14 - right padding ≈ 200px usable |
| Spec | 11px monospace | 24 chars | Mono is narrower per char |
| Meta | 11px mono bold | 26 chars | Date · Org line, full card width |

The star/score badge in the top-right was removed — `breakthrough_score`
is subjective and was promising more precision than the rubric supports.
The detail page still shows the derived tier label ("Major" / "Foundational"
/ etc.) but no card surfaces the raw number anymore.

### Audit visible width via HTML-unescape

Naive `string.length` counts HTML-escaped chars. `OpenAI's` becomes
`OpenAI&#39;s` in HTML — that's 5 source chars but 1 visible glyph.
When auditing label widths via Python script, always `html.unescape()`
first.

### Strip noise from data before display

For the spec line, raw frontmatter values like `"65M (base) / 213M (big)"`
are 22 chars before any contextual addition. They blow truncation budgets.
Pre-process via `simplifyParams()`:

```typescript
function simplifyParams(p: string): string {
  return p.replace(/\s*\([^)]*\)/g, "").replace(/\s+\/\s+/g, " / ").trim();
}
// "65M (base) / 213M (big)" → "65M / 213M"
```

Strip parentheticals, normalize whitespace, then truncate. Preserves the
load-bearing number, drops disambiguation noise.

### Round numerics; never display floats

Context window 32768 → never display "32.768k ctx". Round to integer
"33k ctx". Same for 1048576 → "1M" not "1.048M".

```typescript
const ctx =
  c >= 1_000_000 ? `${Math.round(c / 1_000_000)}M ctx`
  : c >= 1000 ? `${Math.round(c / 1000)}k ctx`
  : `${c} ctx`;
```

Why: decimal-point numbers in compact display feel imprecise. Integer
display feels confident. The 0.5% accuracy lost is invisible at the
display granularity.

---

## VII. Interaction model

### Default-hidden labels, hover-revealed

96 visible labels at full opacity is overwhelming. Default the label
`opacity` to 0; reveal via:
- Hovering the edge's path (`pointer-events: stroke` on path)
- Hovering a connected node (JS adds `.related` class to direct edges'
  labels)

```css
.edge-label { opacity: 0; transition: opacity 0.15s ease; }
.edge-label.related { opacity: 1; }
```

Result: clean default view (only colored arrows), labels appear
on-demand. Discoverability preserved via the **left-side legend
panel** (200px fixed-width `<aside>` with one row per edge type,
swatch + arrow head + label). The legend collapses to a top bar
under 720px viewport. Sat in a bottom `<figcaption>` originally;
moved to the side because (a) the canvas is the primary UI and
deserves vertical space, (b) the legend is reference material the
user glances at while hovering, so keeping it visible alongside the
graph beats forcing them to scroll down to check a color.

**Filter rows below the legend (2026-04-20):** the panel now hosts four
parallel filter sections — **Edge types** (long-standing), **Node types**
(new), **Company** (new), and **License** (open vs closed, new). All
use the same eye-toggle pattern; each row has a swatch + label + eye
icon. Edge types, Node types, and Company also expose bulk Show/Hide
buttons. Persistence is via `localStorage`
(`ai-tree:edgeTypes`, `ai-tree:nodeTypes`, `ai-tree:orgs`,
`ai-tree:license`).

**Compact view toggle (2026-04-21):** above the filter sections, a
"Compact view" button swaps the SVG tree for a year-grouped tile grid
via a `.compact-mode` class on `.ai-tree-graph`. Motivation: with
filters active, the faded cards leave large empty bands in the tree —
visually noisy when the user just wants to see "which selected models
are there?". Compact view re-renders the filtered set as a tight grid
but KEEPS the time axis — each year is its own row with the year
label pinned to the left gutter, tiles flow within. Reads like a
compact tree, not a flat list.

Design notes:
- Tiles are plain HTML (not SVG), rendered server-side in Graph.astro
  alongside the panes. Structure:
  ```
  .compact-list
    .compact-year[data-year="2024"]
      .compact-year-label ("2024")
      .compact-year-tiles
        a.node-link.compact-tile  (one per node)
        a.node-link.compact-tile
        ...
  ```
- Each tile carries the same `data-cats` / `data-org` / `data-license`
  grammar as the SVG cards. The filter chain in `node-types.ts`
  applies unchanged — it iterates `.node-link[data-cats]`, which
  matches both SVG cards and HTML tiles.
- In compact mode, `.card-filtered` becomes `display: none !important`
  (scoped under `.compact-mode` so it overrides the default 0.2
  opacity fade). Only passing tiles render.
- Year rows where ALL tiles are filtered out auto-collapse via CSS
  `:has()`:
  ```css
  .compact-mode .compact-year:not(:has(.compact-tile:not(.card-filtered))) {
    display: none;
  }
  ```
  No JS needed to walk year rows — the selector handles empty-year
  collapse and the remaining years stack tight automatically.
- Compact state is intentionally NOT persisted — it's a transient view
  flip, not a preference.
- Edges / hover / pin are unavailable in compact mode by design (the
  SVG is hidden). Users switch back to the tree view for relationship
  tracing.

The Node-types, Company, and License filters AND together — a card
must pass ALL THREE to be shown. License buckets mirror the byLicense
sort taxonomy: `open` = open_weights / paper / no-model_spec;
`closed` = api / product / demo. The Company list is computed from the
actual node corpus (`Graph.astro` builds an org→count map, sorted by
count desc with alphabetical tiebreaker so frontier labs sit at the
top), and the row container is scrollable with `max-height: 240px`
since the list runs ~50 entries. Each `.node-link` carries
`data-license="open|closed"` and `data-org="<org name>"` so the
client can match without round-tripping data.

**Paper consolidation (2026-04-21):** the Node-types filter shows
**"Paper"** as a single row instead of the six fine-grained meta tags
that exist in frontmatter (theory / training / architecture / safety /
rl / infrastructure). `lib/categories.ts` provides a
`normalizeCategories()` helper that rewrites those six tags to
`"paper"` on every card's `data-cats` attribute (and in ModelSpec's
type-tag row). Frontmatter stays fine-grained — we only collapse at
display — so future work can still differentiate a theory paper from a
training recipe paper when it matters. Node-types count went from 14
rows to 9.

**Google/DeepMind consolidation (2026-04-21):** same display-layer
collapse idea applied to orgs. `lib/org-display.ts` provides
`normalizeOrg()` which rewrites `Google` / `DeepMind` / `Google
DeepMind` to a single `Google/DeepMind` label. Applied across every
user-facing surface: the `.node-link` `data-org` attribute, the
Company filter's org-count map (Graph.astro), the card-top meta line
(Card.astro `metaText`), the compact tile meta line, the detail-page
org pill, the `OrgBadge` component, and `ModelSpec`'s org prop.
Result: all three historical lab names render as one "Google/DeepMind"
everywhere the user sees an org. Frontmatter retains the accurate
attribution (Word2vec stays as Google, AlphaGo stays as DeepMind —
the 2013 and 2016 attributions are historically correct). The
`constants.ts` color maps gain a `Google/DeepMind` entry reusing the
Google-blue so the filter swatch matches the card borders.

Node-type filter semantics:
- A card is shown if **at least one** of its `category[]` tags is in the
  enabled set (OR semantics, "show only selected").
- Filtered cards get `.card-filtered { opacity: 0.2; filter: grayscale(0.7);
  pointer-events: none }` — faded but still in place. Previously this was
  `display: none` (per user feedback 2026-04-20 morning), but later same
  day the user reversed: with three filter dimensions stacked (types ·
  company · license) the all-or-nothing hide left too many empty regions
  and broke the "you can see where everything sits" property of the tree.
  Transparent fade keeps the spatial skeleton visible. The class name is
  generic (`card-filtered`) because all three filter dimensions share the
  same fade rule when any condition fails.
- Edges are intentionally NOT touched — they only render on hover/pin,
  and hover always fires from a *visible* card, so the rendered lineage
  is always anchored to a live node. Edges that pass through a hidden
  ancestor will draw to empty space; that's acceptable and signals "the
  ancestor exists but you've filtered its type."
- The category list (NODE_TYPES in `LegendPanel.astro`) is the source
  of truth — `node-types.ts` discovers filterable types by reading
  `.node-type-row[data-type]` from the DOM rather than importing the
  list. Adding a new category = one edit in NODE_TYPES.
- Each card carries `data-cats="agents multimodal generative"` on its
  `.node-link` so client JS can match without round-tripping data.

### Lineage rendering — knowledge-tree gating (ancestors only, V3)

**V3 architecture changes the implementation** (see §Va) but preserves
the ancestors-only behavior. Below describes both: what the user sees,
and how V3 builds it.

**Updated invariant (V3.2)**: every rendered edge gets a label.
Earlier V3 builds rendered labels only for edges directly INCOMING to
the hovered node, leaving "intermediate-lineage" edges (e.g. `transformer
→ bert` when hovering `gpt-2`) as colored-but-unlabeled. User feedback
caught this as a violation of the §IX invariant "every drawn edge has a
label."

V3.2 fix: label every edge in the rendered ancestor lineage. With ~5-10
edges visible at hover time, label collision is rare and acceptable;
the cognitive cost of "what type is this colored line?" is higher than
the cost of one extra small pill.

When hovering a node, highlight ONLY its **ancestors** (the prerequisite
chain leading to this node). Descendants — knowledge that depends on
this node and hasn't been "unlocked" yet from the user's vantage —
fade to background.

This treats the graph as a **knowledge tree**, not a general DAG
explorer:
- Hovered node: full opacity + drop-shadow
- All ancestors (prerequisites): full opacity
- Edges INTO the hovered node: highlighted with label visible
- Edges among ancestors: full opacity (no labels)
- Hovered node's descendants AND non-related nodes: opacity 0.18 (faded)
- Their edges: opacity 0.05 (almost invisible)

```typescript
const ancestors = expand(slug, "up"); // includes hovered node itself
const keep = ancestors;
allNodeLinks.forEach((n) => {
  const s = n.getAttribute("data-slug")!;
  n.style.opacity = keep.has(s) ? "1" : "0.18";
  n.style.filter = s === slug ? "drop-shadow(0 0 6px rgba(15,23,42,0.25))" : "";
});
allEdges.forEach((e) => {
  const f = e.getAttribute("data-from")!;
  const t = e.getAttribute("data-to")!;
  const inLineage = keep.has(f) && keep.has(t);
  e.style.opacity = inLineage ? "1" : "0.05";
  // Labels show only on edges INCOMING to hovered (immediate prereqs)
  const isDirectIncoming = t === slug && keep.has(f);
  e.classList.toggle("related", isDirectIncoming);
});
```

**Why ancestors-only, not bidirectional**: showing both ancestors and
descendants on hover treats the user as a "graph explorer." Showing
ancestors-only treats them as a **learner discovering history**: this is
what existed before this advancement. Future work that depended on it is
not relevant to "understanding what this node IS" — it's relevant to
"what this node ENABLED," a separate question.

**The rule in plain terms**: hover a node → see the prerequisite chain.
You can hover any descendant later to see ITS prerequisites (which will
include the original node). This forces the user to walk the tree
forward in time the same way the field actually evolved.

**Tradeoff**: power users who want bidirectional lineage lose that view.
Acceptable cost — power users can use the timeline view (`/timeline`)
which shows everything chronologically.

### Per-card zoom modal — 1-hop neighborhood at native size

Hover reveals **two stacked pill buttons just outside each card's
right edge** — `zoom` (top) and `highlight this path` (bottom).

`zoom`: opens the 1-hop modal at z-index 9999 (focused card + direct
parents + direct children), repacked tight and rendered at native
pixel size (never scaled).

`highlight this path`: pins the ancestor lineage so it stays
highlighted across `mouseleave`. The user can then **scroll up/down
or left/right to follow the full path** without losing the highlight.
Click again to unpin. Switching orientation also unpins (positions
differ across panes). The pinned button gets an accent-color filled
state to make pin-mode visually obvious.

Implementation: a `pinnedSlug` variable; `clearHover()` re-renders the
pinned slug instead of wiping when set; `renderHover()` is unchanged
(transient hovers temporarily show another card's lineage, then
mouseleave restores the pinned one).

Both buttons sit OUTSIDE the card (left-aligned at `p.width + 6`)
because:
- A bottom-right inside-card icon competes visually with the score
  badge in the opposite corner; eyes can't tell which corner is "the
  action."
- An external pill with literal text ("zoom" / "highlight this
  path") is unambiguous — no icon-recognition cost, no doubt about
  what the click does.
- Stacking vertically keeps the affordance grouped and consistent
  across button widths.

Because the buttons are outside card geometry, an invisible
`hover-bay` rect (`p.width + 150` wide, `pointer-events="all"`,
`fill="transparent"`) is rendered first inside `<g class="node">`. It
extends the parent `<a class="node-link">` link's hit area into the
right gap so the mouse can travel from card to either button without
crossing empty space (which would `mouseleave` the link → hide them
mid-travel).

### Search box — type a model name, jump to its card

`scripts/graph/search.ts` indexes node titles + slugs by walking the
DOM of the (h, chronological) pane on init (cheap — ~130 cards). The
input lives in `LegendPanel.astro`. Ranking is simple substring +
prefix scoring (slug-exact = 100, title-prefix = 40, org-substring = 5).

On select, `scrollToNode(slug)` reads the matched card's coords from
the inline `nodePosFor(orient)` lookup and calls `scrollTo({ behavior:
'smooth' })` on the active `.orient-pane` (the SVG width/height equals
its viewBox dims, so coords map 1:1 to scroll pixels). The matched
card briefly pulses via a `.search-highlight` class on `.node-link`
that drives a 3-cycle `search-pulse` keyframe — needed because after
a smooth scroll lands, eye attention has nothing to anchor to without
a flash.

Why DOM-based indexing: the inline `clientPayload` JSON only carries
edges and `nodePos`, no titles. We could embed titles too, but pulling
them from rendered cards keeps the JSON smaller and means the index
auto-updates if Card.astro changes how titles render.

### Detail-page lineage view (server-rendered zoom)

The individual node page at `/node/<slug>/` embeds a server-rendered
version of the same 1-hop view — `components/LineageZoom.astro`. Why
replace the earlier `MiniGraph` minimap: the minimap showed "you are
this tiny dot in the whole 126-node grid" which gave almost no usable
context. The lineage view at card size shows *who built on what and
in which direction*, with labeled edges the reader can actually read.

The component is pure SSR (no dependency on the main graph's JS
state), so it renders on every detail page regardless of whether the
user ever opened the Graph page. Layout: three vertical rows — parents
on top, focused in the middle (red ring), children below. It reuses
the same `<Card>` component and edge colors as the main graph so
visual identity is preserved; only the surrounding layout differs.

Two evolutions got us here:

**1. Collapse the time axis (don't reuse main-graph positions).** The
first attempt reused original positions inside the modal and let
`preserveAspectRatio="xMidYMid meet"` scale to fit. A 60-year ancestor
chain rendered as mostly whitespace with tiny far-apart modules. Fix:
re-layout by topological depth, with `Z_DEPTH_GAP = 110px` between
depth slots and `Z_PERP_GAP = 22px` between siblings.

**2. Limit to 1 hop (don't show the full ancestor BFS).** Full lineage
for a late node like Claude 4 expands to ~30+ ancestors — even with
collapsed time, that's overwhelming. The modal's job is *focus*, not
*history*. So the relevant set is just `{focused} ∪ parents(focused) ∪
children(focused)` — exactly three depth slots: parents above, focused
in the middle, children below.

Depth assignment:
- Parents → depth 2 (older end: left for h, top for v)
- Focused → depth 1 (middle slot)
- Children → depth 0 (newer end: right for h, bottom for v)

The layout function (`layoutByDepth`) takes a precomputed depth map so
the same primitive can power both 1-hop view and any future N-hop view
without changing the layout primitives.

**3. Native pixel size, not scaled.** Cards stay 220×64 (identical to
the main graph). The modal's SVG `width`/`height` are set to the
layout bbox; no `preserveAspectRatio`. The svg-wrap container has
`overflow: auto` and centers the SVG via flexbox when it's smaller
than the panel. If a node has lots of children + parents and the
subgraph exceeds panel size, it scrolls — but text never shrinks.

Edges are routed using the same V3.1 single-strategy direct cubic
Bezier (`zRoute` is a JS port of the frontmatter `directPath`), with
the same V3.3 spatial-order stagger to prevent crossings (sort by
source perp position before assigning `tgtIdx`; mirror on source side).

Why this set of choices:
- 1-hop matches the cognitive question "what does this node sit
  between?" — *what was needed to make it possible* + *what did it
  enable*. Multi-hop ancestry belongs to hover dim-fade in the main
  graph (which still uses `expandAncestors`).
- Depth-based packing produces one row per generation; date packing
  would leave the same gaps as the main graph.
- Native size keeps the cards readable and consistent with main view.
  Scrolling 1-hop is rare in practice (<10 nodes typical) and
  preferable to shrinking text past readability.

Implementation rules (all preserve §IX invariants):
- Reuses `incomingByOrient` + `outgoingByOrient` built once at
  init for both hover and zoom.
- Clones existing `<g class="node">` from the active pane and rewrites
  `transform` to the compact coords. Org colors, fonts, score badges
  all stay identical to the main view.
- The zoom button is stripped from clones to prevent nested zoom.
- Edges and labels rebuilt fresh; arrow markers scoped to
  `zoom-arrow-*` IDs to not collide with the main SVG's markers.
- Focused (clicked) card gets a drop-shadow + bolder stroke so it stays
  visually anchored after the dim background appears.
- Close: × button, click backdrop, or Escape.
- Title shows: `<focused title> · N parents · M children`.

Button mechanics: `pointer-events: none` by default so it doesn't
intercept the parent `<a>` link's click, then `pointer-events: all`
when the parent card is hovered. Click handler calls `preventDefault()`
+ `stopPropagation()` so the underlying SVG `<a>` doesn't navigate.

Note on duplication: `zRoute`, `zPerpOffset`, and `zBezierAt` are
client-side ports of the frontmatter routing functions. If the main
routing strategy changes (e.g. V4 routing), update both. Duplication is
the price of running the layout in the browser without bundling
frontmatter helpers.

---

## VIII. Color and type encoding

### Three independent color channels, layered

| Channel | What it encodes | Visual treatment |
|---|---|---|
| Edge color | Relationship type (builds_on, scales, etc.) | Stroke color (solid lines) |
| Card stripe | Source organization (org) | 6px left stripe on card |
| Background band | Year of release | Subtle warm→cool HSL gradient |

Each channel is independent. A user can scan by org (stripe color), by
era (background), or by relationship pattern (edge color), without these
encodings interfering.

### Color the 3 most-frequent types as a hue triangle (120° apart)

**Don't pick edge colors by intuition.** Untrained color-picking
clusters in the blue-purple-pink hue range (220°-330°), making 4-6
"different" colors mutually indistinguishable on screen.

**Two failure modes seen in this project:**
1. v0.18: initial palette had blue (#3B82F6), violet (#8B5CF6), and
   indigo (#6366F1) within 40° of each other.
2. v0.19a (Tableau 10 attempt): even Tableau's tested palette put the
   three most-common edge types in cool tones — blue (#1F77B4 207°),
   purple (#9467BD 273°), cyan (#17BECF 184°) — all within 90° hue
   range. User couldn't distinguish them.

**Lesson**: a 6-color palette being "mathematically distinguishable"
isn't enough if your **3 most frequent uses cluster on the same side
of the wheel**. The eye doesn't process 6 colors equally — it processes
the most common ones first and gets confused there.

**Iteration log** (illustrating the difficulty of choosing 6 distinct colors):

- v0.18: blue/violet/indigo all within 40° — confused user
- v0.19a: Tableau 10 — top 3 still in cool zone
- v0.19b: surpasses crimson 0° too close to scales orange 22°
- v0.19c: fine_tunes teal 175° too close to competes green 140°
- **v0.19d (current)**: fine_tunes moved to gold 50°. Now in orange
  family but lightness gap means it reads as "yellow" not "orange"

Lesson: a 6-color categorical palette has ~6 useful hue zones on the
wheel. When you assign top types to primaries (blue/orange/green) and
top secondary to magenta, the remaining 2 slots (fine_tunes / distills
in our case) MUST use lightness differentiation within an existing
primary's hue zone — there's no spare hue zone left.

The **top 4 most-frequent edge types** must all have ≥70° hue separation.
The remaining 2 can share hue zones with primaries IF lightness/saturation
differ enough to read as visually distinct at typical 1.6px stroke width.

**Current palette** (v0.19c) — top 4 mutually-distant + 2 fillers:

| Type | Frequency | Color | Hex | Hue | Role |
|---|---|---|---|---|---|
| `builds_on` | 39 | Royal blue | `#2563EB` | 220° | primary 1 |
| `scales` | 22 | Bold orange | `#EA580C` | 22° | primary 2 (158° from blue) |
| `competes_with` | 17 | Forest green | `#16A34A` | 140° | primary 3 (100°+ from both) |
| `surpasses` | 13 | Magenta | `#C026D3` | 290° | primary 4 (92° from orange, 70° from blue) |
| `fine_tunes` | 5 | Gold | `#EAB308` | 50° | filler (warm-yellow; in orange family but much lighter so reads as "yellow not orange") |
| `distills` | few | Dark brown | `#78350F` | 25° | filler (same hue as orange, distinguished by 30% lower lightness) |

Pairwise hue gaps for the top 4:
| | blue | orange | green | magenta |
|---|---|---|---|---|
| blue (220°) | — | 158° | 80° | 70° |
| orange (22°) | 158° | — | 118° | 92° |
| green (140°) | 80° | 118° | — | 150° |
| magenta (290°) | 70° | 92° | 150° | — |

Minimum gap among the top 4 is 70° (blue/magenta) — meaningfully
distinguishable. The 2 filler types use hues that overlap top-4 zones
but differ in lightness by enough to read distinctly at 1.6px stroke
width.

**Generalize the rule**:
1. Count edge type frequency.
2. Assign top 3 to the color-wheel triangle: 0° (warm), 120° (green),
   240° (blue). Or rotate to taste (e.g., orange/green/blue).
3. Fill remaining types into hues that DON'T fall between the primary
   triangle. If you must place a 4th color near a primary, separate by
   lightness (darker brown vs orange) or saturation (crimson vs orange).
4. Test at the actual viewing scale on actual data. The screenshot you
   show a user is the only ground truth.

**Why this matters more than it seems**: edge color is the user's
PRIMARY way to identify what type a relationship is. If colors confuse,
the entire typed-edge schema becomes meaningless visual noise.

### Solid lines only — drop dash patterns

Earlier versions used dash patterns (e.g., `competes_with` was dotted)
as a redundant signal. With the Tableau 10 palette, color spread is
sufficient that dash adds visual noise without identification benefit.
**All visible edges use solid lines.** Hidden types keep dash patterns
defensively (in case they're ever rendered for debug purposes).

### Light theme with high contrast

Pastels for backgrounds (org tints, year bands) at ~96% lightness; bold
8-prefix Tailwind colors for text and stroke at ~50% lightness. This
gives 7:1+ contrast ratio for text legibility while keeping decoration
soft.

Never use 50/50 colors (medium saturation, medium lightness) — they
neither pop nor recede. Either go light (decoration) or dark (text/edges).

### Keep color scheme STABLE across changes

Once an edge type is associated with a color, don't reassign. Users
build muscle memory ("blue means builds_on"). Reordering palette =
breaks all existing user understanding. If you must change colors,
document the migration in the change log so users know what shifted.

---

## IX. Invariants and verification

### Rules that must always hold

State the rules explicitly. Verify after every change:

1. **1:1 edge-to-label**: every drawn edge has exactly one visible label.
2. **Strict chronological within bin**: within each year column/row,
   nodes sort by `date.getTime()` ascending.
3. **No two labels overlap** (X-PAD 43, Y-PAD 21): collision avoidance
   via anchor selection from edge-geometry candidates.
4. **No two edges share start point**: per-source perpendicular stagger
   places each outgoing edge at distinct Y/X.
5. **Labels stay on edges**: the (midX, midY) of each label MUST be a
   point on the edge's `d` path.
6. **No text overflow**: every rendered string fits its container's
   visible width with the chosen font.

### Build a Python audit script

Write a script that parses the built HTML, extracts SVG element
positions and text, and verifies each invariant. Run after every
significant change. Examples:

```python
# Count overlapping label pairs
LABEL_W, LABEL_H = 78, 18
overlaps = sum(1 for i, l1 in enumerate(labels)
              for j, l2 in enumerate(labels) if i < j
              and abs(l1.x - l2.x) < LABEL_W * 0.55
              and abs(l1.y - l2.y) < LABEL_H + 3)
```

Don't trust visual inspection alone — the eye misses 5-10% overlap rate
but the script counts every one.

### Hover-test hub nodes

A "hub" is any node with 5+ edges (in or out). In our dataset:
Transformer (11 outgoing), GPT-4o (8 outgoing), Claude 4 (7), o1 (8).

After every layout change, hover all hub nodes in browser. 80% of
visual bugs (label clustering, edge overlap, off-edge labels, hidden
labels) become immediately visible at hub nodes — they're stress tests
for every assumption.

---

## X. What NOT to do (anti-patterns from this build)

### ❌ Don't trust auto-layout for timeline data

Dagre / ELK optimize edge crossings. Timelines need chronological order.
These goals fight. Override the auto-layout's secondary axis with manual
chronological sort. Accept the extra crossings.

### ❌ Don't use Manhattan routing when many edges share a source

Manhattan routing's `splitX = sxR + offset` is effectively constant per
source. Multiple edges from the same source get parallel vertical
segments at the same X — looks like one blurry double line at small
spacing, or like train tracks at large spacing. Both wrong for the
typical case.

V3.1 lesson: when edges are dynamic and only ~10 visible at hover time,
a single direct cubic Bezier per edge gives cleaner separation than
Manhattan with stagger compensation. Curves from different sources
diverge naturally because their start points differ in X.

Reserve Manhattan for V1/V2-style static-pre-rendered graphs where
edges need to clearly avoid passing through unrelated nodes.

### ❌ Don't use opacity-based "soft" backgrounds for occluding elements

`fill-opacity="0.93"` on label backgrounds = visible bleed-through =
strikethrough effect. Either it occludes (opacity 1) or it doesn't
(label not on top layer). No middle ground.

### ❌ Don't shift labels off their edges to avoid overlap

User catches it instantly. The label has to STAY on the edge geometry.
If you can't avoid overlap by sliding along the geometry, accept the
overlap (or use anchor candidates strategically — see Section III).

### ❌ Don't scale fonts with zoom

If you have zoom, fonts will be unreadable at small zoom and oversized
at large zoom. Either implement proper LOD (level of detail) text
swapping (hard) or **remove zoom entirely** and lock fonts at readable
sizes (easy).

### ❌ Don't render labels in same DOM group as their edge paths

In SVG, render order = z-order. Labels-with-paths means later edges'
paths draw over earlier labels. Labels go in a separate top-layer
group, period.

### ❌ Don't anchor labels at the midpoint of a vertical segment in horizontal flow

For multiple edges from same source, splitX is ~constant → all labels
cluster at same X. Anchor on flow-aligned segments instead (Section III).

### ❌ Don't compute stagger from total edge count if some edges are hidden

The hidden edges' stagger slots become "ghost gaps." Filter hidden
types from the count BEFORE computing per-source/target indexes.

### ❌ Don't assign stagger indexes by iteration order

When multiple edges converge on a target, assigning `tgtIdx` by the
order edges happen to appear in MDX (or any iteration order) causes
X-shaped crossings whenever the source positions don't already match
that order. The eye reads the crossing as a "twisted" line pair — exactly
the visual the stagger system was supposed to prevent.

Always sort each target's incoming edges by source perp position before
assigning `tgtIdx`. Mirror on the source side. See §IV "Spatial-order
stagger" for the rule.

### ❌ Don't auto-fit-to-screen on first load

If the graph is big (3500px wide), fit-to-screen makes everything 30%
size — fonts unreadable, cards tiny. Default to "scroll-end" (most
recent year) at native size; let user scroll backward to history.

---

## XI. The iteration that mattered

This project shipped 18 sprints to reach the current state. The visual
rules above weren't designed up front — most emerged from user feedback
on specific screenshots. The lesson: **graph viz is irreducibly
iterative**. You cannot anticipate which layout decisions will conflict
until you see real data rendered.

A useful workflow:
1. Implement the cleanest rule you can think of
2. Render with real (not toy) data
3. Hover the highest-degree nodes
4. Find the visual bug
5. Identify the root cause (not just the symptom)
6. Apply the minimum fix that addresses the root
7. Verify via audit script + hub hover
8. Repeat

The full iteration log is in [DEVLOG.md](./DEVLOG.md). The principles
above are the residue.

---

## Appendix: Decision tree for layout choices

```
Need a graph viz?
│
├─ < 5,000 nodes?  ──── YES ──── Embedded JSON / MDX
│                                In-memory layout
│                                Static SVG output
│
├─ Time-aware data? ─── YES ──── Time-as-axis (column or row)
│                                Within-bin: sort by date
│                                Reject auto-layout's secondary axis
│
├─ Multiple edges per node? ── YES ── Stagger:
│                                       - Source perp offset
│                                       - Bend lane offset
│                                       - Target perp offset
│
├─ Need labels on edges?  ──── YES ──── Anchors on edge geometry
│                                       Flow-aligned (H→horiz, V→vert)
│                                       Multiple candidates per edge
│                                       Top-layer rendering
│
├─ Multiple orientations?  ─── YES ──── Pre-compute both, CSS toggle
│                                       Keep font sizes fixed
│                                       Native scroll only
│
└─ Hub nodes with 5+ edges? ── YES ──── Hover-test obsessively
                                        They expose every layout bug
```
