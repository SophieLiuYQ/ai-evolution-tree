# 🌳 AI Evolution Tree

**An open, community-curated evolution tree of every meaningful advancement in ML / Deep Learning / LLMs / AI — explained twice: once for builders, once for everyone else.**

> Top of the tree = the seeds (Perceptron, Backprop). Bottom of the tree = today's frontier (reasoning models, agents, world models). Every node connects to the work it grew out of. Every node is explained for two audiences.

---

## What this is

A **community-curated, version-controlled, citation-backed timeline** of AI's most important breakthroughs, structured as a directed tree:

- **Time-ordered, top → bottom** — older work at the top, newer at the bottom, like growth rings.
- **Parent edges** — each node lists the prior work it builds on. Reading top-to-bottom is reading the field's intellectual lineage.
- **Two views per node:**
  - 🛠 **Tech View** — what the technique is, how to use it, code, SWOT, limitations, citations.
  - 💼 **Public View** — plain English, real-world applications, investment angle, why it matters.
- **Open by default** — MIT for code, CC-BY-SA 4.0 for content. Add a node via PR.

## What this is not

- ❌ A research paper aggregator (use [arXiv-sanity](https://arxiv-sanity-lite.com/)).
- ❌ A leaderboard (use [Papers with Code](https://paperswithcode.com/)).
- ❌ Hype tracking. We curate **load-bearing advancements** — the ones the rest of the field grew out of.

## Two audiences, one source of truth

The biggest gap in AI literacy is that technical writing is too dense for investors / operators / curious newcomers, and "explainer" content is too vague for builders. Each node here ships **both layers from the same canonical record**, so a hedge fund analyst and an ML engineer can stand on the same facts.

| Section | Tech View | Public View |
|---|---|---|
| What it is | Architecture, equations, novel mechanism | Analogy in plain English |
| How to use it | API / library / code snippet | Where it shows up in products you use |
| Limitations | Failure modes, compute cost, data needs | Risks, costs, what it can't do |
| Strategic angle | Theoretical contribution, what it unlocked | Companies built on it, market size, moat |
| Citations | BibTeX + DOI + arXiv | Press coverage + product launches |

## Quick start

```bash
git clone https://github.com/SophieLiuYQ/ai-evolution-tree
cd ai-evolution-tree
npm install
npm run dev          # local dev at http://localhost:4321
npm run build        # static site to ./dist
```

## Contributing a node (the 5-minute version)

1. Copy `src/content/nodes/_template.mdx` to `src/content/nodes/{year}-{slug}.mdx`.
2. Fill in the frontmatter — the schema is validated at build time, so wrong fields fail loudly.
3. Write the **Tech View** in MDX (code blocks, math, diagrams welcome).
4. Fill in the structured `public_view` fields in the frontmatter.
5. List `parents:` — what prior nodes does this build on?
6. Run `npm run build`. Green build = ready to PR.

Full guide: [CONTRIBUTING.md](./CONTRIBUTING.md). Schema spec: [NODE_SCHEMA.md](./NODE_SCHEMA.md).

## Project status

Pre-alpha. Schema is stabilizing; expect breaking changes until v0.2. See [ROADMAP.md](./ROADMAP.md).

## Architecture

- [ARCHITECTURE.md](./ARCHITECTURE.md) — tech stack rationale, data model, rendering strategy, contributor ergonomics
- [GRAPH_DESIGN.md](./GRAPH_DESIGN.md) — drawing principles for graph-based data visualization (layout topology, anchor system, fan-out stagger, z-order, invariants — distilled from 18 sprints of iteration)
- [DEVLOG.md](./DEVLOG.md) — chronological build journal of how the project came together
- [NODE_SCHEMA.md](./NODE_SCHEMA.md) — authoritative node schema spec
- [data/README.md](./data/README.md) — V2 embedded JSON architecture decision

## Licensing

- **Code** — MIT ([LICENSE](./LICENSE))
- **Content** (every `.mdx` in `src/content/`) — CC-BY-SA 4.0 ([LICENSE-CONTENT](./LICENSE-CONTENT))

Attribution to original paper authors is preserved in each node's `citations` field.

## Acknowledgements

The intellectual debt here is to every researcher whose work appears as a node. Citation chains are first-class data, not footnotes.
