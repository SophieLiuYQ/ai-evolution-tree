# Project rules for Codex sessions

This file is loaded by Codex when working in this repository. It
encodes load-bearing project conventions that aren't obvious from the
code alone.

> **Also read [`CLAUDE_Karpathy.md`](./CLAUDE_Karpathy.md)** — 4 generic
> LLM-behavior rules (Think Before Coding · Simplicity First · Surgical
> Changes · Goal-Driven Execution). Not project-specific; they apply
> across every task. This project's rules below are the *delta* on top
> of those.

---

## 🚨 Rule #1: Graph code change → GRAPH_DESIGN.md update — same commit

The single most important rule for this project. **Every change to
graph visualization code MUST be accompanied by a corresponding update
to [`GRAPH_DESIGN.md`](./GRAPH_DESIGN.md), in the same commit.**

### What counts as "graph visualization code"

Any file or section that affects the rendered graph's layout, edges,
labels, interactions, or visual hierarchy:

- `src/components/Graph.astro` — primary graph component (most changes)
- `src/components/MiniGraph.astro` — detail-page minimap
- `src/components/Tree.astro` — alternate timeline view
- Any new layout algorithm, anchor strategy, stagger rule, edge routing, label collision handling, color assignment, z-order rule, or interaction model

### Why this rule exists

Per user request 2026-04-16: "确保这个graph设计可以快速叠加，小步快跑"
(ensure the graph design can be quickly iterated, small steps fast).

The doc is the **iteration contract**. Without it, every new sprint
re-discovers bugs we already fixed (label-floating-off-edge,
z-order-strikethrough, etc.). With it, contributors and future Codex
sessions can layer changes confidently because they know what rules
already hold.

### How to apply

When you edit graph code, in the *same commit*:

1. **Identify** which `GRAPH_DESIGN.md` section the change touches
   (Layout topology / Anchors / Stagger / Z-order / Text / etc.)
2. **Update** that section: revise a rule, update parameters, add a new principle
3. **Reverse** prior rules cleanly — don't leave stale advice. If the new
   change contradicts an old rule, edit the old rule rather than appending
   contradictions.
4. **Add anti-patterns** to Section X "What NOT to do" if the change came
   from fixing a regression.
5. **Commit message** references both files. Example:
   `Anchor labels on flow-aligned segments + update GRAPH_DESIGN.md §III`

### Concrete prompts

Before completing a graph-code edit, ask:
- Did I change how nodes are positioned? → §II Layout topology
- Did I change how edges route? → §II routing strategies
- Did I change where labels go? → §III Anchor system
- Did I change spacing or fan-out? → §IV Fan-out stagger
- Did I change render order? → §V Z-order
- Did I change card text/truncation? → §VI Text and card constraints
- Did I change hover behavior? → §VII Interaction model
- Did I change edge/org/era colors? → §VIII Color encoding
- Did I add an invariant? → §IX Invariants and verification
- Did I learn what NOT to do? → §X Anti-patterns

If "yes" to any, the doc gets edited too. No exceptions.

---

## Other project rules

### Verification

After every graph change:
1. Run `npm run build` (must be green)
2. Hover the highest-degree hub nodes in browser (Transformer, GPT-4o,
   Codex 4, o1) — they expose 80% of layout bugs
3. Run a Python audit script appropriate to the change (see GRAPH_DESIGN
   §IX for examples) to verify invariants hold

### Commit + push discipline

- Commits: clear titles, body explains WHY not just WHAT
- Co-author trailer: `Co-Authored-By: Codex Opus 4.7 (1M context) <noreply@anthropic.com>`
- Push to `main` directly after each green build (no PR workflow yet)

### Schema changes

If the change affects the node schema in `src/content.config.ts`:
- Update [`NODE_SCHEMA.md`](./NODE_SCHEMA.md) (it's the authoritative spec)
- Update [`data/graph.json`](./data/graph.json) by re-running `npm run graph:export`
- Update sample template `src/content/nodes/_template.mdx` if user-facing fields change

### Documentation hierarchy (don't mix purposes)

| Doc | Purpose | Update when |
|---|---|---|
| `README.md` | entry point + quick start | API/UX changes affecting users |
| `ARCHITECTURE.md` | tech stack rationale, rejected stacks | major dependency / framework change |
| **`GRAPH_DESIGN.md`** | **graph drawing principles** | **EVERY graph code change** |
| `DEVLOG.md` | chronological build journal | optional, useful for major sprints |
| `NODE_SCHEMA.md` | node schema authoritative spec | every schema change |
| `CONTRIBUTING.md` | how to add a node / submit PR | process changes |
| `ROADMAP.md` | future plan | milestone planning |

Don't create new top-level docs without first checking these don't already cover the topic.
