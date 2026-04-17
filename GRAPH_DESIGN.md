# Graph-Based Data Visualization: Drawing Principles

Distilled from 18 sprints (v0.1 → v0.18) building the AI Evolution Tree —
a 73-node, 96-edge timeline-DAG with dual orientation, time-as-axis layout,
typed-relationship edges, and full label legibility.

This document is **methodology**, not a changelog. (For chronological
build history, see [DEVLOG.md](./DEVLOG.md). For schema specs, see
[NODE_SCHEMA.md](./NODE_SCHEMA.md).) The intent: codify load-bearing
decisions so future graph-viz projects can skip the iteration cost.

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

### Three routing strategies, not one

Manhattan routing for everything produces visual ugliness for adjacent
nodes (U-shape detours through the gutter even when a direct line would
work). Use **three** path strategies, dispatched by spatial relationship:

| Case | Routing | When to use |
|---|---|---|
| Adjacent forward | Cubic Bezier S-curve | Source/target in adjacent columns (or rows in V), `dx < ~260px` |
| Non-adjacent forward | Manhattan with vertical bend | Source/target in non-adjacent columns; vertical segment at `splitX = sxR + 30` |
| Same-bin / backward | Detour OUTSIDE the bin | Source and target in same column (or backward in time); detour at `detourX = sxR + 36` |

Adjacent edges feel "direct" (no unnecessary detour). Non-adjacent edges
feel "structured" (Civ-tech-tree-like). Same-bin edges go around the
column (so they don't cross through nodes in their own bin).

### Routing constants: pick small numbers, validate visually

| Constant | Value | Why |
|---|---|---|
| `H_COL_GAP` | 100 | Routing corridor between adjacent year columns |
| `H_NODE_V_GAP` | 44 | Vertical breathing between same-column nodes |
| `splitX offset` | min(dx*0.55, 30) | Bend close to source for clean look; cap at 30 to keep splitX in the column gap |
| `detour arc` | 36 | Just outside source's right edge; close enough to feel "exiting", far enough to clear the column boundary |

Don't over-tune. Pick reasonable numbers, see how it looks, adjust 1-2
iterations. Most "fix the spacing" sprints come from pixel-counting
backward from a screenshot, not a priori calculation.

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

For each edge, compute 5 candidate label positions, all on the path.
For Manhattan paths: 5 points along the vertical segment at parameter
t = [0.5, 0.35, 0.65, 0.25, 0.75]. For S-curves: 5 cubic-Bezier-evaluated
points at the same t values.

Collision avoidance picks the FIRST candidate that doesn't overlap an
already-placed label. If all 5 collide, default to t=0.5 (geometric
midpoint). This gives flexibility without ever placing labels off the
edge.

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

---

## V. Z-order (visual layering)

### Render order matters for SVG (no z-index)

SVG renders in document order. Later elements draw on top. For a graph
that pre-renders all edges (V1/V2 architecture):

```
1. Year band backgrounds       (bottom layer)
2. Edge paths                  (mid)
3. Node cards                  (above edges — opaque cards hide edges
                                that pass behind them)
4. Edge labels                 (TOP layer — above everything)
```

For V3 (dynamic edge rendering — see §Va below), this concern partially
goes away because at most ~5-10 edges exist in the DOM at any moment.
But the rule still applies WHEN edges are dynamically created: append
them to the `<g class="edges">` group BEFORE nodes in document order,
and labels to `<g class="edge-labels">` group AFTER nodes. The empty
groups exist at build time as positioning anchors.

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
| Title | 13px sans bold | 22 chars | Card 220px - stripe 14 - star badge 30 = 176px usable |
| Spec | 11px monospace | 24 chars | Mono is narrower per char |
| Meta | 11px mono bold | 26 chars | Same width but no star badge to avoid |

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
on-demand. Discoverability preserved via the legend at the bottom
(showing color → type mapping).

### Lineage rendering — knowledge-tree gating (ancestors only, V3)

**V3 architecture changes the implementation** (see §Va) but preserves
the ancestors-only behavior. Below describes both: what the user sees,
and how V3 builds it.

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
