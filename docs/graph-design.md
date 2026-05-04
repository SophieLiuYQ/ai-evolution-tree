# Graph-Based Data Visualization: Drawing Principles

Distilled from 18 sprints (v0.1 → v0.18) building the AI Evolution Tree —
a 73-node, 96-edge timeline-DAG with dual orientation, time-as-axis layout,
typed-relationship edges, and full label legibility.

This document is **methodology**, not a changelog. (For chronological
build history, see [devlog.md](./devlog.md). For schema specs, see
[node-schema.md](./node-schema.md).) The intent: codify load-bearing
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
│     ├─ LegendPanel.astro        ← left aside (controls + filters)
│     ├─ OrientPane.astro         ← one SVG pane (h or v)
│     └─ Card.astro               ← per-node card group + pin button
├─ lib/graph/                     ← BUILD-time TypeScript (Astro frontmatter)
│  ├─ types.ts                    ← Placed, Edge, Layout, EdgeStagger
│  ├─ constants.ts                ← colors, edgeStyle, sizes, hidden types
│  ├─ text.ts                     ← clip, fmtSpec, fmtCtx, fmtMonth
│  ├─ bands.ts                    ← year band stripes + frontier highlight
│  ├─ routing.ts                  ← directPath, perpOffset, bezierAt, label collision
│  └─ layout.ts                   ← computeLayout + finalize (stagger, edge build)
└─ scripts/graph/                 ← CLIENT-time TypeScript (bundled by Vite)
   ├─ state.ts                    ← graphData parse + adjacency + pin state
   ├─ dom.ts                      ← buildPath, buildLabel, getActivePane
   ├─ hover.ts                    ← renderHover, clearHover, attachInteractions
   ├─ orient.ts                   ← h/v toggle + storage
   └─ main.ts                     ← entry point (import in Graph.astro <script>)
```

Quick rules:
- Layout/routing math → `lib/graph/`
- Anything visible on the page that's NOT interactive → `components/graph/`
- Anything that runs after the page loads → `scripts/graph/`
- `Graph.astro` is just a wiring layer; resist the urge to grow it back.

If you change routing, update `lib/graph/routing.ts` (build-time) and
`scripts/graph/route.ts` (client-time hover/pin routing) together.

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

### Sort mode — chronological only (for now)

Year is **always** the primary axis (rows in v-orient, columns in
h-orient). As of 2026-04-26, the tree UI exposes **only one** sort
mode: **chronological** (within-year spread by date). Prior experiments
with “Series/byFamily” lanes were removed from the left panel to keep
the primary graph legible and reduce UI surface area.

**Removed `byType` (2026-04-20):** the single-bucket `modelType(cats, slug)` classifier was fundamentally lossy — a robotics VLA is *both* Agent AND Multimodal AND Generative, and forcing one bucket hid the overlap. Type is now rendered as *overlapping* tag pills in the node detail's `ModelSpec` section, not as a graph sort axis.

**Legend filter counts (2026-04-25):** the left LegendPanel shows per-bucket
counts for **Capabilities** (multi-tag; a node can increment multiple tags)
and **License** (open vs closed), matching the existing Company counts. This
helps users understand dataset composition at a glance before filtering.

**Strict open-source classifier (2026-05-03):** the License filter's "Open"
bucket previously included `release_type === "paper"` and nodes without
`model_spec`, which over-counted "open" with research artefacts that don't
ship downloadable weights. Tightened to:

- **Open weights** = `release_type === "open_weights"` (downloadable weights only)
- **Closed / hosted** = everything else: `api`, `product`, `demo`, `paper`, or unset.

Filter labels renamed from "Open source / Closed source" to
"Open weights / Closed / hosted" so the meaning is unambiguous —
"open source" colloquially conflates weight-availability with source-code
availability, but the filter only checks the former.

Four places kept in sync: `Graph.astro` (legend counts + `compactLicense`),
`graph/Card.astro` (SVG `data-license` attribute), `lib/graph/layout.ts`
`licenseKey()` (papers get a separate "Open (research)" bucket in the
`byLicense` group axis but don't satisfy the License filter), and
`graph/LegendPanel.astro` (filter row labels + i18n strings).

Data side: `scripts/refresh-open-source.mjs` syncs each MDX node's
`release_type` against AA's `is_open_weights` flag where AA has the model
in its catalog. Hand-curated `paper`, `demo`, and `product` types are
preserved (AA doesn't track those categories). One-shot run on 2026-05-03
promoted 141 nodes from `api` → `open_weights`.

**Removed `byOrg` and `byLicense` (2026-04-21):** the LegendPanel filter
rows (Company, License) cover the same need — pick the subset you care
about — without pinning the user to a fixed grouping axis. With only
chronological in the UI, the sort-mode segmented control was removed
from the LegendPanel entirely.

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
| Cross-year forward edge (different year column/row) | Direct cubic Bezier |
| Intra-year edge (src.year == tgt.year) | Side-bulged loop, see §IIa |

### IIa. Intra-year side-bulge routing (V3.5, 2026-04-24)

Year blocks (a year's column in h-orient or row in v-orient) are dense:
they wrap into multiple sub-rows / sub-columns once the count exceeds
~5 cards. The V3.1 direct cubic from src.bottom → tgt.top routes the
midpoint **straight through intermediate sub-row cards** — labels land
on those cards and the curve plows through their bodies.

**Failure mode (image 3 in the 2026-04-24 ticket):** GPT-5.5 → ~18
intra-year siblings; labels for the multi-sub-row edges sat directly
on Gemini 3.1, Granite 4.0, etc. Label-on-card overlap rate in v-orient
= 33+ before fix.

**V3.5 rule:** if `src.year == tgt.year`, route via a side-bulged
cubic that flips the entry/exit edges according to the relative
position of source and target:

| Sub-case (v-orient) | Endpoints | Bulge |
|---|---|---|
| `tgt.y < src.y` (target above) | src.top → tgt.bottom | lateral side-fan |
| `tgt.y > src.y` (target below) | src.bottom → tgt.top | lateral side-fan |
| `tgt.y == src.y` (same sub-row) | both top OR both bottom | up or down by srcIdx parity |

The lateral side-fan (`xPush` for v-orient, `yPush` for h-orient) is
keyed off `srcIdx` with **alternating sign by parity** so siblings of
one hub split into two opposite-side fans instead of stacking. Radius
is capped at `SIDE_FAN_MAX = 200px` so a 40-edge hub doesn't blow the
arc into the next half of the canvas.

```typescript
const SIDE_FAN_BASE = 70;
const SIDE_FAN_STEP = 22;
const SIDE_FAN_MAX  = 200;
function sideFanArc(srcIdx) {
  const sign = srcIdx % 2 === 0 ? 1 : -1;
  return sign * Math.min(SIDE_FAN_MAX, SIDE_FAN_BASE + Math.floor(srcIdx / 2) * SIDE_FAN_STEP);
}
```

**`srcIdx` is bucketed by routing class** (sameBlock vs crossBlock) in
`finalize()` so a 42-edge hub whose 24 same-year edges share the
side-fan doesn't end up with srcIdx values up to 41 in the side-fan
formula. Each routing class gets its own 0..N index.

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

### Routing constants for V3.1 / V3.5

| Constant | Value | Why |
|---|---|---|
| Bezier control offset (cross-year) | `dx * 0.5` (h) / `dy * 0.5` (v) | Tug control points to half the cross-axis distance — tight S without overshoot |
| Side-fan base radius | `70px` | First sibling's lateral push (intra-year) |
| Side-fan step | `22px` per pair | Each sibling pair adds this to the radius |
| Side-fan max | `200px` | Cap so 40-edge hubs don't blow into the next half-canvas |
| Source/target perpendicular pitch | adaptive (see §IV) | Stagger of entry/exit points on the card edge |

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
elements ONLY for the hovered node’s **1-hop neighborhood** (direct
parents + direct children). To keep hubs readable, the hover renderer
caps the display to **at most 6 incident edges**, prioritizing:
`builds_on` → `competes_with` (“alternative”).
On mouseleave, they’re removed.

### Default state: ZERO edges visible

The graph is just nodes. No clutter. No background lines. The user sees
a clean Civ-tech-tree of cards and is invited to hover.

### Hover state: ≤ 6 edges, no overlap with anything else

When hovering node N, the JS renders edges only for N's ancestor lineage
(direct parents + direct children). The renderer picks only incident
edges and caps to 6 so even high-degree hubs stay legible. It also
dedupes symmetric `alternative` relationships (A↔B) and keeps only one
edge per node-pair to prevent perfect overlap.

Routing rule (hover + pin):
- Edges are drawn as **freeform shortest paths**: straight segments
  between card rectangles, with a tiny quadratic bulge only when needed
  to separate near-parallel edges.
- Ports are spread along the card face so arrowheads don’t stack.
- Labels must avoid cards, other labels, and *any edge segment*.

This is the load-bearing UX choice: the graph **acts as a study tool,
not a wall map**. The user explores by hover; the visual focus is one
lineage at a time.

### Embedded JSON contract

At the bottom of the figure, an inline `<script type="application/json">`
holds the precomputed node positions + edges for every (orient × sort)
variant. Note: hover/pin edges are routed client-side from `nodePos`
so the path geometry stays short and local.

```json
{
  "edgeStyle": { "builds_on": { "color": "#2563EB", "label": "builds on" }, ... },
  "layouts": {
    "v": {
      "chronological": {
        "nodePos": { "gpt-4": { "x": 520, "y": 840, "w": 220, "h": 64 }, ... },
        "edges": [ { "v": "transformer", "w": "gpt-3", "type": "builds_on", ... }, ... ]
      }
    }
  }
}
```

JS picks the right (orient × sort) layout slice based on the UI state
and `localStorage` preferences.

Size: ~30 KB JSON for 96 edges × 2 panes. Trivial vs the 300 KB inline
SVG it replaces.

### Dynamic SVG creation cookbook

```typescript
const NS = "http://www.w3.org/2000/svg";
const path = document.createElementNS(NS, "path");
path.setAttribute("d", route.d); // computed from nodePos at hover time
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

Note (2026-04-25): hover dims non-neighborhood nodes lightly
(~50% opacity + mild grayscale) so the user can keep spatial context
without the “everything disappears” effect of heavy dimming.

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
panel** (360px fixed-width `<aside>` with one row per edge type,
swatch + arrow head + label). The panel intentionally carries **no
local brand header** (branding lives in the sticky top nav) so the
controls and filters stay above-the-fold.

**Collapse handle (2026-05-03):** the panel ships with an edge-mounted
chevron button that toggles between full (~360px) and a 32px rail.
State persists in `localStorage` under `ai-tree:legend-collapsed`. The
button is vertically centered on the right border so it reads as a
pull-tab, not a corner control. To keep it anchored while content
scrolls, the aside itself is `overflow: visible` and an inner
`.legend-content` div is the scroll container.

**Mobile behavior (≤720px, 2026-05-03):**
- The panel becomes an **absolute-positioned drawer** (320px wide,
  `max-width: 85vw`, slides in from the left edge of `.graph-body`).
  Default state is collapsed — graph canvas is the primary surface.
- The collapse handle is enlarged (28×56) and filled with the accent
  color so it reads as a clear "open filters" affordance.
- The right-side `InspectorPanel` is hidden entirely (`display: none`):
  the full node detail page replaces it, and a single tap on any card
  navigates there.
- `.hover-bay` (the invisible 150px-wide hit-extender that lets a
  desktop mouse travel from card to inspector pin button without
  leaving `.node-link`) is `pointer-events: none` on touch — otherwise
  it steals taps from neighbor cards.
- Single-tap on a card navigates to `/node/{slug}/`. Double-tap is
  intentionally **not** wired to navigation: it must remain the
  browser's pinch-zoom gesture, which the graph needs on mobile.

**Filter rows below the legend (2026-04-20):** the panel now hosts four
parallel filter sections — **Edge types** (long-standing), **Capabilities**
(was “Node types”), **Company** (new), and **License** (open vs closed, new). All
use the same eye-toggle pattern; each row has a swatch + label + eye
icon. Edge types, Capabilities, and Company also expose bulk Show/Hide
buttons. Persistence is via `localStorage`
(`ai-tree:edgeTypes`, `ai-tree:nodeTypes`, `ai-tree:orgs`,
`ai-tree:license`).

Capabilities are driven by `category[]` tags. Some are inferred from
`model_spec.modalities` (mapped into tags like `audio`, `cv`, `video`,
`multimodal`, `nlp`), while others are hand-authored or migrated
(`code`, `reasoning`, `agents`, `world_model`). This keeps the filter
useful for both “what channel is this model” and “what is it good for”.

**Theme bridge gotcha (2026-04-26):** the LegendPanel uses a small
"theme bridge" that remaps Tailwind utility classes (e.g. `.bg-white`,
`.text-slate-700`) onto CSS variables via `!important`. Any *active
state* styling that needs to override those utilities (e.g.
`#compact-toggle[aria-pressed="true"]`) must also use `!important`,
otherwise the active fill can be wiped out (producing invisible
white-on-cream text).

**Compact view toggle (2026-05-03):** above the filter sections, a
"Compact view" button swaps the SVG tree for a **model-family board**
via a `.compact-mode` class on `.ai-tree-graph`. Motivation: the tree
is best for ancestry tracing, but not for quickly reading "how did GPT,
Claude, Gemini, Qwen, etc. progress over time?" Compact mode is now a
separate visualization surface optimized for that question: **family
rows + year columns + explicit within-family connectors + denser model
cards**.

Design notes:
- Compact cards are plain HTML (not SVG), rendered server-side in
  `Graph.astro` alongside the panes. Structure:
  ```
  .compact-list
    .compact-board
      .compact-board-head
      .compact-rows
        .compact-row
          .compact-family
          .compact-track
            svg.compact-links
            a.node-link.compact-tile
  ```
- The board intentionally focuses on **model releases only**:
  `graphNodes.filter(n => n.data.model_spec && release_type !== "paper")`.
  Method/paper nodes stay in the main SVG tree; compact mode is for
  model-line comparison.
- Rows are grouped by `model_spec.family` when present, otherwise by
  the same `familyKey()` heuristics used in `layout.ts` (OpenAI GPT,
  Anthropic Claude, Google/DeepMind Gemini, Qwen, DeepSeek, etc.).
  `Graph.astro` and `layout.ts` must stay in sync here.
- Each card still carries the same `data-cats` / `data-org` /
  `data-license` grammar as the SVG cards. The filter chain in
  `node-types.ts` therefore applies unchanged — it iterates
  `.node-link[data-cats]`, which matches both SVG cards and HTML tiles.
- **Filters do NOT apply in compact mode** (per user feedback
  2026-04-21). The `.card-filtered` class still gets toggled by
  node-types.ts on every filter change, but its visual effect is
  overridden inside `.compact-mode`:
  ```css
  .ai-tree-graph.compact-mode .compact-tile {
    opacity: 1 !important;
    filter: none !important;
    pointer-events: auto !important;
    display: flex !important;
  }
  ```
  So compact view remains a full model-family board even if the user
  had narrowed filters in the SVG tree. Earlier we hid filtered tiles;
  that made the board feel broken because families and year lanes
  appeared to disappear.
- Compact state is intentionally NOT persisted — it's a transient view
  flip, not a preference.
- There is **no hover/pin lineage overlay** in compact mode, but the
  family board does render static connector strokes between adjacent
  models in a family's chronology so the lineage remains legible.

The Node-types, Company, and License filters AND together — a card
must pass ALL THREE to be shown.

**Within Node types, an AND/OR mode toggle (2026-04-21)** changes the
matching predicate inside that single filter:
- `OR` (default): a node passes if AT LEAST ONE of its `category[]`
  tags is in the enabled set. Wider net.
- `AND`: a node passes only if EVERY enabled type appears in
  `category[]`. Narrow intersection — useful when the user picks a
  small set ("Agent + Multimodal" → robotics VLAs only). With all 9
  types enabled in AND mode no node matches (expected; user is meant
  to Hide All then enable the few they want). Persisted via
  `localStorage` (`ai-tree:nodeFilterMode`). License buckets mirror the byLicense
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

### Per-card pin — persistent 1-hop highlight

Hover reveals an external pill button just outside each card's right
edge: `highlight this path`.

It pins the ancestor lineage so it stays
highlighted across `mouseleave`. The user can then **scroll up/down
or left/right to follow the full path** without losing the highlight.
Click again to unpin. Switching orientation also unpins (positions
differ across panes). The pinned button gets an accent-color filled
state to make pin-mode visually obvious.

Implementation: a `pinnedSlug` variable; `clearHover()` re-renders the
pinned slug instead of wiping when set; `renderHover()` is unchanged
(transient hovers temporarily show another card's lineage, then
mouseleave restores the pinned one).

The button sits OUTSIDE the card (left-aligned at `p.width + 6`) because:
- A bottom-right inside-card icon competes visually with the score
  badge in the opposite corner; eyes can't tell which corner is "the
  action."
- An external pill with literal text ("highlight this path") is
  unambiguous — no icon-recognition cost, no doubt about what the
  click does.

Because the buttons are outside card geometry, an invisible
`hover-bay` rect (`p.width + 150` wide, `pointer-events="all"`,
`fill="transparent"`) is rendered first inside `<g class="node">`. It
extends the parent `<a class="node-link">` link's hit area into the
right gap so the mouse can travel from card to the button without
crossing empty space (which would `mouseleave` the link → hide it
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

Why DOM-based indexing: the inline `clientPayload` JSON is optimized
for layout (edges + `nodePos`). As of 2026-04-24 it ALSO embeds a
minimal per-node metadata map for the right-side inspector panel, but
the search index intentionally stays DOM-derived so it automatically
tracks any future changes to `Card.astro` text rendering.

Search selection also dispatches a `CustomEvent("ai-tree:select")` so
the inspector panel can open on the searched node without requiring a
second click.

### Graph-page inspector (click-to-inspect)

On `/tree/`, clicking a node selects it and populates the **right-side
inspector panel** (summary, key benchmarks, and lineage) without
navigating away from the graph. Navigation to the full detail page is
still available via:
- The inspector “Open full page” button, or
- Normal browser modifier clicks (`cmd/ctrl` click, middle-click, etc.)

This is intentional: the graph is the primary exploration surface; the
detail page is the deep-dive surface. The inspector reduces context
switching when scanning multiple models in a year band.

**Inspector brief contract (2026-05-03):**
- The right panel now behaves like a **compact model brief**, not a raw
  metadata dump.
- Header must show: model title, org, release date, and a small release
  badge when `release_type` is known.
- Facts block should stay short and decision-oriented:
  **Context Window**, **Parameters**, **Model Type**, **License**, and
  one external **Website** link if the schema has `homepage`, `github`,
  `hf_url`, or `aa_url`.
- A **Related models** section should prefer graph neighbors first
  (incoming/outgoing adjacency), then fill with same-family models using
  `model_spec.family`.
- A **Brief** section may synthesize short factual bullets from current
  schema fields (`best_for`, context size, release type, category tags);
  do not invent product claims or benchmark conclusions absent from data.
- A **Data sources** section should surface `last_verified_at` when
  present plus outbound pills for homepage / GitHub / Hugging Face /
  Artificial Analysis.
- Selection highlight must work in BOTH surfaces:
  active SVG pane and `.compact-list`. Do not assume "selected" implies
  an `.orient-pane` is visible.

### No minimap overlay (intentional)

We intentionally do **not** render a minimap overlay on `/tree/` by
default. With a paper-like background and dense year bands, the minimap
adds more visual clutter than information. If reintroduced, it must be
behind an explicit toggle and must not compete with the inspector panel.

### Detail-page lineage view (server-rendered lineage panel)

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
the main graph). The lineage SVG uses its natural layout bbox (no
`preserveAspectRatio`). The wrapper has `overflow: auto` and centers
the SVG via flexbox when it's smaller than the panel. If a node has
lots of children + parents and the subgraph exceeds panel size, it
scrolls — but text never shrinks.

Edges are routed as the shortest-possible straight segment between card
rectangles (center-to-center ray, clipped to each rectangle boundary).
This keeps the 1-hop view readable and prevents the “giant parabola”
arcs that cut through unrelated nodes.

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

Implementation rules:
- Pure SSR (`components/LineageZoom.astro`) — no dependency on the graph
  page’s client runtime.
- Reuses the same card styling so org colors, fonts, and badges match
  the main graph.
- Suppresses the graph-only pin affordance inside the lineage panel
  (it doesn’t wire up on detail pages).

Button mechanics: `pointer-events: none` by default so it doesn't
intercept the parent `<a>` link's click, then `pointer-events: all`
when the parent card is hovered. Click handler calls `preventDefault()`
+ `stopPropagation()` so the underlying SVG `<a>` doesn't navigate.

Note on routing: hover + pin intentionally compute edge geometry in
the browser (they don’t use precomputed Beziers). This lets us optimize
for “local clarity” (short edges + non-overlapping labels) without
changing the global layout export format.

---

## VIII. Color and type encoding

### Three independent color channels, layered

| Channel | What it encodes | Visual treatment |
|---|---|---|
| Edge color | Relationship type (builds_on / competes_with) | Stroke color (solid lines) |
| Card stripe | Source organization (org) | 6px left stripe on card |
| Background band | Year of release | Ultra-light neutral stripes + one “frontier year” highlight band |

Each channel is independent. A user can scan by org (stripe color), by
time (background bands), or by relationship pattern (edge color),
without these encodings interfering.

**Year band rule (match reference UI)**: do not use a rainbow / warm→cool
gradient for year backgrounds. Keep almost all bands neutral (barely
visible alternating stripes) and use ONE softly tinted “frontier” band
(latest full year: max year strictly less than the current year) so the
user’s eye has an anchor near the present.

### Two types, two primary hues

**Edge types simplified to 2** (2026-04-25): the graph treats “open
alternative” as just a subtype of “alternative”, so only two meanings
are encoded by edge color:
`builds_on` and `competes_with` (label: “alternative”).

**Current palette** (v0.20):

| Type | Frequency | Color | Hex | Hue |
|---|---|---|---|---|
| `builds_on` | ~159 | Royal blue | `#2563EB` | 220° |
| `competes_with` | ~142 | Crimson red | `#DC2626` | 0° |
With only 2 types we don't need dash patterns — solid lines + bold hue
is enough.

**Generalize the rule**:
1. Count edge type frequency.
2. If 3 or fewer types: assign high-contrast primaries (triangle on the
   color wheel). Done.
3. If more types: ask whether additional types are **carrying
   their narrative weight** before adding hues. v0.18→v0.20 history
   below — we tried 9 / 6 / 4 types and found 3 most readable.

**Legacy iteration log** (kept for "we tried it" reference):

- v0.18 (9 types, blue/violet/indigo all within 40°): confused user
- v0.19a (Tableau 10, top 3 still in cool zone): user couldn't tell
  the most-common edge types apart
- v0.19c (6 types: blue/orange/green/magenta + gold/brown filler):
  workable but legend was overwhelming, fillers needed lightness
  differentiation tricks
- **v0.20 (current — 3 types, RGB triangle)**: cleanest read.

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

**Theme tokens**: all graph *surfaces* (legend panel, canvas, cards,
modals) must take their colors from the site CSS variables:
`--bg`, `--bg-soft`, `--bg-sunk`, `--border`, `--border-strong`,
`--fg`, `--fg-muted`, `--fg-faint`, `--accent`, `--accent-soft`
(see `src/styles/global.css`). The `/tree/` page may override those
variables locally to achieve a “paper” palette without changing the
global theme.

Avoid hard-coding Slate hex values (e.g. `#f8fafc`, `#1e293b`) for UI
surfaces. If you must keep Tailwind utility classes for spacing /
density, bridge their *colors* back to the CSS variables in the same
component so palette overrides remain consistent.

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
2. **Graph-hidden nodes stay out of the tree**: nodes with
   `graph_hidden: true` must not render in `/tree/` (nor influence edge
   routing or compact-mode tile counts). Use this to collapse SKU-level
   variants into a single “series” node without making the graph
   unreadable.
3. **Featured-only mode stays consistent**: if ANY node sets
   `graph_featured: true`, `/tree/` must render ONLY featured nodes (and
   still exclude `graph_hidden: true`). This enables “one model-line per
   company per year” compaction without losing detail pages (distinct
   names like Sonnet vs Haiku remain separate).
4. **Strict chronological within bin**: within each year column/row,
   nodes sort by `date.getTime()` ascending.
5. **No two labels overlap** (X-PAD 43, Y-PAD 21): collision avoidance
   via anchor selection from edge-geometry candidates.
6. **No two edges share start point**: per-source perpendicular stagger
   places each outgoing edge at distinct Y/X.
7. **Labels stay on edges**: the (midX, midY) of each label MUST be a
   point on the edge's `d` path.
8. **No text overflow**: every rendered string fits its container's
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

### ❌ Don't route intra-year edges with the same cubic as cross-year (V3.5 fix)

A direct cubic from `src.bottom` → `tgt.top` works for cross-year edges
because the gap between year rows is empty space — the curve mid-point
lands cleanly. Inside a year-row block, sub-rows wrap densely (5+ cards
per sub-row, 3+ sub-rows in busy years like 2026). The cubic mid-point
then lands DIRECTLY on intermediate sub-row cards, and the label sits on
their titles.

Detect intra-year edges (`src.year == tgt.year`) and switch to a
**side-bulged cubic with flipped entry/exit edges** — see §IIa. The
flip is critical: a backward intra-year edge (target above source) must
exit `src.top` and enter `tgt.bottom`, NOT `src.bottom → tgt.top`,
otherwise the curve plows back through the source body before reaching
the target.

### ❌ Don't fan a hub by its full-edge `srcIdx`

A hub like GPT-5.5 with 42 outgoing edges, indexed `srcIdx = 0..41`,
will blow the side-fan radius to 800+ px if the formula scales with
`srcIdx`. Bucket `srcIdx` per **routing class** (sameBlock vs
crossBlock) so each class gets its own 0..N counter, AND cap the
side-fan radius at a sane max (200px in this project). Different hubs
will share radii past the cap — that's fine, the lateral spread is
already past the "obviously different curves" threshold.

### ❌ Don't auto-fit-to-screen on first load

If the graph is big (3500px wide), fit-to-screen makes everything 30%
size — fonts unreadable, cards tiny. Default to "scroll-end" (most
recent year) at native size; let user scroll backward to history.

---

## XI. Mobile rendering

The SVG tree (and compact board) are unusable below ~720px CSS width:
labels collide, hover is impossible on touch, and horizontal scroll
fights the page. On mobile we render a vertical card list
(`MobileCardList.astro`) instead — same `data-license` / `data-cats` /
`data-org` attributes as SVG cards so the LegendPanel filter chain
applies without forks.

**Single source of truth.** The mobile cascade is owned by exactly two
files:

- `Graph.astro` global `<style is:global>` block — the toggle. Hides
  `.panes-wrap` / `.compact-list` / `.orient-pane` (display:none +
  visibility:hidden + width:0 + height:0 + `contain: strict`), shows
  `.mobile-card-list`, and sizes `.canvas-area` / `.graph-body` to
  `height: 100%` so the card list's `calc(100vh - 120px)` resolves
  against a real flex parent.
- `MobileCardList.astro` `<style is:global>` block — card visuals
  (`.mobile-card`, `.mc-head`, `.mc-row`, `.mc-pill-*`, etc.).

**Do NOT** duplicate mobile rules in page-level files (`tree.astro`).
The blank-stripes regression (May 2026) was caused by three files all
declaring the same mobile rules with `!important`; the cascade order
flipped between dev and an unrelated edit and the SVG year-bands
leaked through while the card list collapsed to zero height.

**Anti-patterns specific to mobile**:
- Setting only `display: none` on the SVG wrapper. `display: contents`
  elsewhere can defeat it; pair with `visibility: hidden`,
  `width/height: 0`, and `contain: strict`.
- Letting the card list size itself with viewport units while ancestor
  flex containers have no resolved height — the calc evaluates but the
  flex parent collapses to 0. Mobile rule must size every ancestor up
  to the figure shell.

## XII. The iteration that mattered

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

The full iteration log is in [devlog.md](./devlog.md). The principles
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
