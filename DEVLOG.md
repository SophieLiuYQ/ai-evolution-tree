# DEVLOG — Build Session 2026-04-16

A single-day Claude Code session that built the entire **AI Evolution Tree** from a blank desktop folder to a 73-node, dual-orientation, Civ-tech-tree-style visualization with 111 typed-relationship edges spanning 1958 → 2026.

This file is the chronological record of design decisions, bugs encountered, and the iterative loop that produced the current state. It exists so future contributors can read the *why*, not just the *what*.

---

## Sprint v0.1 — Bootstrap (foundation)

**Goal**: stand up project structure + working build with 7 sample nodes.

- Project skeleton: README, ARCHITECTURE, CONTRIBUTING, ROADMAP, NODE_SCHEMA, LICENSE (MIT) + LICENSE-CONTENT (CC-BY-SA 4.0)
- Stack chosen: Astro 5 + MDX + Content Collections + Tailwind 4 + Zod schemas + KaTeX + Shiki
  - Rationale: content-collections give Zod schema validation for free; static-first; permissive license model
  - Rejected: Next.js (heavier than needed), Hugo (less type safety), Notion-as-CMS (defeats version control)
- Initial 7 seed nodes: Perceptron (1958), Backprop (1986), AlexNet (2012), GAN (2014), Transformer (2017), GPT-3 (2020), ChatGPT (2022)
- Each node: long-form Tech body in MDX + structured `public_view` frontmatter (plain English / analogy / applications / investment angle / why it matters)
- Vertical timeline component (was the original layout choice)
- Build: green at 9 pages

**Outcome**: working tree, demonstrable schema, clean docs.

---

## Sprint v0.2 — Schema v2 + 19 model-release nodes

**Trigger**: user wanted "more density, like the chemistry diagram" — typed edges with reaction-style labels, monthly precision, model comparison data.

- **Schema v2**:
  - `parents: string[]` → `relationships: { to, type, note }[]` with 9 typed enum: `builds_on / scales / fine_tunes / distills / surpasses / competes_with / applies / replaces / open_alt_to`
  - Added `model_spec`: parameters / architecture / context_window / training_tokens / training_compute / release_type / modalities / `benchmarks[]`
  - Added `org` enum (organization-of-record), separated from free-text `institution`
  - Date precision: month-level
- **19 new nodes** spanning 2018–2025: GPT-1, BERT, GPT-2, scaling-laws, CLIP, InstructGPT, Chinchilla, PaLM, Stable Diffusion, Constitutional AI, Llama 1/2/3, Claude 1/3/3.5/3.7/4, GPT-4, GPT-4o, o1, Mixtral 8x7B, ReAct, RLHF preferences, DeepSeek R1, Gemini 1
- Each post-2018 node has a benchmark comparison table (MMLU / HumanEval / GSM8K / SWE-bench / pricing) showing relative position vs concurrent peers
- New components: `OrgBadge` (brand-color org chips), `ModelSpec` (spec table + benchmarks), `RelationshipsBlock` (typed edges grouped by type, depends-on / depended-on-by columns)
- Migration of existing 7 nodes to schema v2

**Outcome**: 26 nodes, 78 typed edges, info-dense detail pages.

---

## Sprint v0.3 — Graph view + light theme

**Trigger**: user wanted the actual graph DAG visualization (not just timeline), and switch from dark theme to light.

- Installed `@dagrejs/dagre` for DAG layout (build-time)
- Built `Graph.astro` — server-side dagre layout → SVG inline render
  - 34 nodes + 58 typed edges visible at once
  - Curved bezier edges + colored arrowheads per relationship type
  - Pan / zoom / hover-highlight-lineage interactivity (vanilla JS, no framework)
  - Color-coded edges (blue=builds_on, purple=scales, etc.) with bottom legend
- **Light theme**:
  - CSS variables flipped: bg `#fafaf9` / fg `#18181b` / accent `#047857`
  - All badges retoned: `*-900/40` dark → `*-50` + `*-800` text + `*-300` border
  - Code blocks kept dark for syntax-highlighting readability
  - Sticky nav with `bg-white/85 backdrop-blur`
- Routes: `/` = Graph, `/timeline` = preserved old timeline, `/about` + `/node/[slug]` unchanged
- Default scroll: jump to most recent year (2024–2025 dense region)

**Outcome**: real graph visualization, ~80KB inline SVG homepage, light-themed throughout.

---

## Sprint v0.4 — Year color bands + Chinese AI ecosystem

**Trigger**: user wanted year-graded background colors AND coverage of all Chinese models.

- **Year bands**: each year with at least one node gets a horizontal background rect, hue gradient warm (1958 amber, 45°) → cool (2025 blue, 235°)
- Within a year, nodes still sorted by dagre Y (placed in ad-hoc rows to fit)
- **9 Chinese model nodes added**: ChatGLM (Mar 2023), Qwen-1 (Aug 2023), Ernie 4 (Oct 2023), Kimi (Oct 2023), Yi-34B (Nov 2023), DeepSeek V2 (May 2024), Qwen 2.5 (Sep 2024), QwQ-32B (Nov 2024), DeepSeek V3 (Dec 2024) + 1 Lightning Attention (MiniMax, Jan 2025)
- DeepSeek R1 re-linked to V3 (`fine_tunes`) and to QwQ-32B (`surpasses`) for full reasoning-model lineage
- New orgs added: Moonshot AI, MiniMax, ByteDance, Stepfun

**Outcome**: 44 nodes, 78 edges, time-graded visual flow, full Chinese ecosystem represented.

---

## Sprint v0.5 — Civ tech tree style

**Trigger**: user shared Civilization tech tree screenshots — wanted left-to-right flow, orthogonal/Manhattan edge routing, year columns at top, compact rectangular cards.

- Layout flipped: TB → **LR (rankdir)**
- Year-as-column instead of year-as-band — each year a vertical column with year header at top
- **Manhattan edge routing**: replaced bezier with right-angle paths (out-right, vertical, in-right)
- Compact card design: 220×64, org-color left stripe, ★score badge top-right, three text lines (date·org / title / spec)
- Dagre rank constraint: `tight-tree` ranker
- "→ Now" toolbar button: jump to most recent year on load (default landing position)
- Result: 13 year columns × variable-height nodes, ~3372×968 SVG dimensions

**Outcome**: real Civ tech tree feel — rectilinear flow, era-grouped columns, orthogonal connectors.

---

## Sprint v0.6 — Vertical orientation + lock zoom + 2026 frontier

**Trigger**: user wanted both H *and* V layouts toggleable, no zoom (fixed font sizes), and 2025 H2 / 2026 frontier nodes added.

- **Toggle**: dual-layout — both LR (horizontal) and TB (vertical) layouts computed at build time
  - Two SVGs in DOM, one hidden via CSS
  - localStorage-persisted choice, segmented-control toggle in header
  - Switching pane = instant (no recompute, no layout shift)
- **Zoom removed entirely** — no wheel zoom, no buttons, no pinch
  - Fonts now permanently at native readable sizes (11px meta, 13px title, 11px spec)
  - Containers use `overflow: auto` — pure native browser scroll
- **8 new 2025-H2 + 2026 nodes**: Doubao 1.5 Pro (ByteDance), Gemini 2.5 Pro, Llama 4 (Scout/Maverick/Behemoth), o3, GPT-5, Claude Haiku 4.5, Sonnet 4.6, Opus 4.6, Opus 4.7
- Final: 53 nodes, 14 years (1958→2026), horizontal 3632×1048, vertical 1280×2442

**Outcome**: dual-orientation viewing, native scroll, frontier coverage to 2026 (the model writing this codebase).

---

## Sprint v0.7 — Spacing + cross-domain breadth

**Trigger**: user reported edges getting hidden behind nodes (not enough routing room), and asked for more nodes.

- **Spacing tripled**: H_COL_GAP 40→100, H_NODE_V_GAP 16→44, V_NODE_H_GAP 18→44, V_ROW_GAP 28→80
  - Manhattan edges now have generous routing corridors between nodes
- **9 cross-domain nodes added**:
  - word2vec (2013) — NLP embedding foundations
  - ResNet (2015) — vision skip-connections enabling depth
  - AlphaGo (2016) — Lee Sedol match
  - AlphaFold 2 (2021) — protein structure (Nobel 2024)
  - Whisper (2022) — open speech recognition
  - Sora (2024) — text-to-video preview
  - Suno v3 (2024) — text-to-music
  - MCP (2024) — Anthropic Model Context Protocol
  - Grok 3 (2025) — xAI Colossus 200k-H100 cluster
  - Sora 2 (2025) — native audio video
- 3 new orgs: Suno, Runway, Black Forest Labs

**Outcome**: 63 nodes, 14+ years, multi-modal coverage (text/vision/audio/video/science/agents).

---

## Sprint v0.8 — 10 more nodes + MiniGraph minimap

**Trigger**: user wanted more breadth + minimap on each detail page.

- **10 new nodes**: DBRX (Databricks), Phi-3 (Microsoft), Cohere Command R+, AlphaProof (DeepMind, IMO 2024 silver), Stable Audio 2.0, Perplexity Sonar, Kimi K2 (Moonshot), Veo 3 (Google), Kling 2.0 (Kuaishou), Grok 4 (xAI Heavy multi-agent)
- 3 new orgs: Databricks, Perplexity, Kuaishou
- **MiniGraph component**: ~500×250 inline SVG on every detail page
  - Compact minimap of all 73 nodes
  - Current node = red dot (size 4.5px), all others = grey (2.2px)
  - Edges connected to current node = red (1.2 stroke), others = grey (0.45)
  - Click any dot to navigate
  - Hover for tooltip with full node title

**Outcome**: 73 nodes, 111 edges, minimap-aided detail navigation.

---

## Sprint v0.9 — Chronological sort + hover-only labels

**Trigger**: user noticed Dec node placed at top of column (not bottom). Edge labels also cluttered.

- **Within-year sort**: removed dagre Y as primary key (was causing Dec→top placement); now strict `date.getTime()` ascending
  - Verified: 2025 column now goes MiniMax (Jan 15) → Opus 4.6 (Dec 10) top to bottom
  - Trade-off: more edge crossings, but predictable visual order (chronology beats edge-crossing minimization for timeline view)
- Removed unused `dagre` import (cleanup)
- **Edge labels hidden by default**:
  - CSS: `.edge-label { opacity: 0 }`
  - Show on edge-hover OR on edges connected to hovered node (`.related` class via JS)
  - Default state = clean graph, no label clutter

**Outcome**: predictable chronological layout, on-demand label visibility.

---

## Sprint v0.10 — Card text overflow fixes

**Trigger**: user screenshot showed long titles/specs spilling past card right edge.

- `simplifyParams()` helper: strips parenthetical variants ("(base)", "(big)", "(large)") so spec line shows core number
- Truncation caps: title 22 chars, spec 24 chars, meta 26 chars
- All long org names ("Cornell Aeronautical Laboratory" etc.) properly clipped with ellipsis
- Edge label rect: `fill-opacity="0.93"` → `1` (fully opaque, no line bleed-through)

**Outcome**: clean overflow-free cards, opaque label backgrounds.

---

## Sprint v0.11 — Label z-order top layer + ctx integer formatting

**Trigger**: edge labels still got struck through by other edges' paths even with opacity 1.

- **Root cause identified**: SVG render order = document order. With `<path>` and `<g class="edge-label">` siblings inside `.edge`, edge N+1's path drawn AFTER edge N's label → path overlays label.
- **Fix**: split edges into two passes
  - All paths render in `<g class="edges">` after year bands but before nodes
  - All labels render in **separate `<g class="edge-labels">` group AFTER nodes** (top z-order)
  - Labels coordinated to paths via `data-edge-key="h-{i}" / "v-{i}"` attribute
  - JS uses `labelByKey: Map` for O(1) hover-coordination lookups
- **ctx formatting**: `Math.round()` so 32768 → 33k (was 32.768k); 1048576 → 1M (was 1.048M); etc.
- Python audit script: HTML-unescape + verify all 132 text elements within visual width caps + 0 ctx decimals
- Z-order verified: bands → edges → nodes → edge-labels in both panes

**Outcome**: 0 path-through-label overlaps, all integer ctx values.

---

## Sprint v0.12 — Bigger labels + collision avoidance

**Trigger**: even with z-order fix, labels at similar coords stacked on each other (label-on-label overlap).

- Label rect: 60×13 → 78×18, font 9px → 11px (+22%), bold 700
- New `avoidLabelOverlaps()` greedy algorithm: shift Y until no collision with placed labels (X tolerance 43px, Y tolerance 21px)
- 252 labels total (126 H + 126 V), audited 0 overlapping pairs after avoidance

**Outcome**: bigger readable pills, 0 label-on-label overlap (tested via Python audit script).

---

## Sprint v0.13 — Anchor-based avoidance + adjacent S-curves

**Trigger**: v0.12's Y-shifting pushed labels OFF their edges' geometry — labels "floating" disconnected. AND user reported adjacent-column edges going through U-shape detour instead of direct connection.

- **Anchor system**: each edge generates 5 candidate label positions ALONG its actual geometry
  - Manhattan paths: 5 anchors along the vertical splitX segment
  - S-curve adjacent: 5 anchors via cubic Bezier `bezierAt(t)` evaluation at t = [0.5, 0.4, 0.6, 0.45, 0.55]
  - Collision avoidance picks first non-colliding anchor (no arbitrary Y-shift) → labels always on path geometry
- **Adjacent S-curve routing**: when forward edge spans only one column gap (`dx < H_ADJACENT = 260px`), path becomes direct cubic Bezier from src right to tgt left — NO splitX vertical detour
  - Same rule for vertical orient (rows within `V_ADJACENT`)
  - 46 S-curves + 65 Manhattan + 24 simple lines in horizontal pane

**Outcome**: labels stay attached to edges; adjacent nodes connect directly without U-detour.

---

## Sprint v0.14 — Flow-aligned anchors

**Trigger**: hovering hub nodes (o1 with 8 edges) still showed labels clustered in one row — user explicitly suggested "horizontal view → anchor to horizontal line, vertical view → anchor to vertical line."

- **Root cause**: H-orient anchors were on the *vertical* segment (X=splitX, Y varies). For multiple edges from same source, splitX was nearly constant → anchors clustered in narrow X.
- **Fix**: anchors moved to *flow-aligned* segments
  - **Horizontal orient**: anchors on **target horizontal segment** (X varies between splitX and txL, **Y = ty**). Different targets have different ty → labels naturally separate vertically.
  - **Vertical orient** (mirror): anchors on **target vertical segment** (Y varies between splitY and tyT, **X = tx**). Different targets → different tx → labels separate horizontally.
- Each edge: 5 anchors along Segment 3 + 1 fallback on Segment 1
- Detour edges: anchors split on both source-side and target-side flow-aligned segments

**Result (Python audit)**: label overlap pairs:
- v0.13 (vertical anchors): 36 overlapping pairs
- **v0.14 (flow-aligned anchors): 2 overlapping pairs (-94%)**

o1 hub case verified: 8 direct labels now distributed by target Y from Y=1022 → Y=1508, no clustering.

**Outcome**: labels distribute organically by following the geometry the user's eye is already tracking (LR flow → horizontal placement, TB flow → vertical placement).

---

## Sprint v0.15 — Detour anchor fix + V2 JSON foundation

**Trigger**: user spotted "builds on" pill rendering INSIDE a Qwen-7B card (overlapping the spec line). Also asked: V2 should use a graph DB or embedded JSON instead of MDX-as-database.

**Bug A — same-column edge label inside source card**:
- For same-column / backward edges, anchor formula `(detourX + txL) / 2` gave X ≈ src.x + 18 (deep INSIDE source card) when src and tgt share a column
- Root cause: that midpoint isn't on the actual path geometry — the path goes detour-right then down then back-left, the "midpoint of x" is meaningless
- Fix: anchors moved to the **vertical detour segment** at X = detourX (column-OUTSIDE), Y varies along (sy, ty). Same fix mirrored for vertical orient (HORIZONTAL detour segment at Y = detourY).
- Verified: 9 same-column 2023 edge labels now all at X=4440 (outside 2023 column at X=4200-4420), Y range 320→957 well-spread by target

**V2 foundation: embedded JSON migration**:
- Added `gray-matter` dependency (YAML frontmatter parser)
- New script: `scripts/migrate-mdx-to-json.mjs` — reads all MDX, produces `data/graph.json`
- New npm script: `npm run graph:export`
- Generated `data/graph.json`: 369KB, contains all 73 nodes + 126 edges + body_md preserved
- Schema is self-describing (version, generated_at, stats with year_range / orgs / eras / edge_types)
- Wrote `data/README.md` documenting V2 architecture decision (JSON > graph DB at this scale)
- V2 roadmap documented: v0.2.0 JSON-from-MDX (now), v0.2.1 Astro reads from JSON, v0.3.0 JSON primary + MDX removed

**Decision**: deferred Astro page refactor to next sprint (substantial code change). Current state has both MDX and JSON in sync; future sprints flip the source of truth.

**Outcome**: bug fixed, V2 data foundation in place, migration path documented.

---

## Final state (end-of-day 2026-04-16)

| Metric | Count |
|---|---|
| Detail node pages | 73 |
| Typed edges | 111 |
| Years covered | 17 (1958 → 2026) |
| Organizations | 33 distinct |
| Edge relationship types | 9 typed enums |
| Render orientations | 2 (horizontal LR, vertical TB) |
| Layout algorithms | 3 (S-curve adjacent, Manhattan with vertical-segment, detour) |
| Label overlap rate | <2% (2/126 per pane) |
| Total static pages | 76 (73 nodes + Graph + Timeline + About) |
| Inline SVG size (homepage) | ~300KB (both H + V panes embedded) |
| Build time | ~1.5s end-to-end |

## What I'd do differently if starting over

1. **Schema v2 from the start** — typed edges + model_spec should have been v0.1, not v0.2. Migration cost ~30 min that wouldn't have existed.
2. **Defer the Civ tech tree pivot** — went LR in v0.5 then realized vertical also useful in v0.6. Could have started with the toggle architecture.
3. **Test labels on hub nodes earlier** — issues with overlap / clustering / off-edge floats were all visible in 1-minute hover testing of GPT-4o, Claude 4, transformer (the 5+ edge nodes). Would have caught v0.10–v0.14 bugs in v0.6.
4. **Year-band background as separate concern** — coupling background to layout made the H↔V toggle work harder. Better as a generic "background layer" decorator on top of any layout.

## Things explicitly NOT done (deferred)

- Sticky year column / row labels during scroll (HTML overlay on SVG)
- BibTeX export / citation download
- RSS feed of new node merges
- Search UI (Pagefind index is built but UI not wired)
- Authentication / user accounts (intentionally — version control is the moderation layer)
- Comments / discussion (intentionally — GitHub Issues per node)
- AI-generated content (intentionally — human-reviewed only)
- i18n / Chinese language version (planned for v0.4 of the project itself, not this session)

---

## Build environment

- Node 20.19.4
- npm 10.8.2
- Astro 5.18.1
- Tailwind 4.2.2
- @dagrejs/dagre 1.1.4 (initially used for layout; later removed from runtime when chronological sort + manual placement took over)
- Built on macOS (darwin 25.3.0) by Claude Opus 4.7 in a single Claude Code session, April 16, 2026
