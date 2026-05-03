# Agent guidance for this repository

This file is the single source of truth for AI assistants (Claude Code,
Codex, Gemini, Cursor, etc.) working in this repo. It is symlinked as
`CLAUDE.md`, `GEMINI.md`, and `AI.md` so every common harness picks it
up automatically.

It has two parts:

1. **Universal LLM behavior rules** — generic guidelines that apply to any
   coding task (adapted from Karpathy's CLAUDE.md template).
2. **Project-specific rules** — load-bearing conventions for *this*
   repository that aren't obvious from the code alone.

Human contributors should read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
instead.

---

# Part 1 — Universal behavior rules

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward
caution over speed; for trivial tasks, use judgment.

## 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables YOUR changes made unused; leave pre-existing
  dead code alone unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-driven execution

Define success criteria. Loop until verified.

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

Strong success criteria let you loop independently. Weak criteria
("make it work") require constant clarification.

---

# Part 2 — Project-specific rules

## 🚨 Rule #1: Graph code change → `docs/graph-design.md` update — same commit

The single most important rule for this project. **Every change to graph
visualization code MUST be accompanied by a corresponding update to
[`docs/graph-design.md`](./docs/graph-design.md), in the same commit.**

### What counts as "graph visualization code"

Any file or section that affects the rendered graph's layout, edges,
labels, interactions, or visual hierarchy:

- `src/components/Graph.astro` — primary graph component (most changes)
- `src/components/MiniGraph.astro` — detail-page minimap
- `src/components/Tree.astro` — alternate timeline view
- Any new layout algorithm, anchor strategy, stagger rule, edge routing,
  label collision handling, color assignment, z-order rule, or
  interaction model

### Why this rule exists

The doc is the **iteration contract**. Without it, every new sprint
re-discovers bugs we already fixed (label-floating-off-edge,
z-order-strikethrough, etc.). With it, contributors and future agents
can layer changes confidently because they know what rules already hold.

### How to apply

When you edit graph code, in the *same commit*:

1. **Identify** which `docs/graph-design.md` section the change touches
   (Layout topology / Anchors / Stagger / Z-order / Text / etc.)
2. **Update** that section: revise a rule, update parameters, add a new
   principle.
3. **Reverse** prior rules cleanly — don't leave stale advice. If the
   new change contradicts an old rule, edit the old rule rather than
   appending contradictions.
4. **Add anti-patterns** to "What NOT to do" if the change came from
   fixing a regression.
5. **Commit message** references both files. Example:
   `Anchor labels on flow-aligned segments + update graph-design.md §III`

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

## Verification

After every graph change:

1. Run `npm run build` (must be green).
2. Hover the highest-degree hub nodes in browser (Transformer, GPT-4o,
   Claude 4, o1) — they expose 80% of layout bugs.
3. Run a Python audit script appropriate to the change (see
   `docs/graph-design.md` §IX for examples) to verify invariants hold.

## Commit + push discipline

- Commits: clear titles, body explains WHY not just WHAT.
- Push to `main` directly after each green build (no PR workflow yet for
  maintainers; external contributors should open PRs — see
  `CONTRIBUTING.md`).

## Schema changes

If the change affects the node schema in `src/content.config.ts`:

- Update [`docs/node-schema.md`](./docs/node-schema.md) (the
  authoritative spec).
- Update [`data/graph.json`](./data/graph.json) by re-running
  `npm run graph:export`.
- Update sample template `src/content/nodes/_template.mdx` if
  user-facing fields change.

## Documentation hierarchy

| Doc | Purpose | Update when |
|---|---|---|
| `README.md` | entry point + quick start | API/UX changes affecting users |
| `CONTRIBUTING.md` | how humans contribute | process changes |
| `AGENTS.md` (this file) | rules for AI assistants | agent-workflow changes |
| `docs/architecture.md` | tech stack rationale, rejected stacks | major dependency / framework change |
| **`docs/graph-design.md`** | **graph drawing principles** | **EVERY graph code change** |
| `docs/node-schema.md` | node schema authoritative spec | every schema change |
| `docs/model-page-system.md` | model detail-page system | model-page changes |
| `docs/devlog.md` | chronological build journal | optional, useful for major sprints |
| `docs/roadmap.md` | future plan | milestone planning |

Don't create new top-level docs without first checking these don't
already cover the topic. New design/spec docs go in `docs/`.
