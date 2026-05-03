# 🌳 AI Evolution Tree

**An open, community-curated evolution tree of every meaningful advancement in ML / Deep Learning / LLMs / AI — explained twice: once for builders, once for everyone else.**

🔗 **Live site:** [aievolutiontree.com](https://www.aievolutiontree.com)

> Top of the tree = the seeds (Perceptron, Backprop). Bottom = today's frontier (reasoning models, agents, world models). Every node connects to the prior work it grew out of. Every node is explained for two audiences.

---

## What this is

A **community-curated, version-controlled, citation-backed graph** of AI's most important breakthroughs — currently **550+ nodes** spanning 1957 → present, structured as a DAG of parent-edge lineages.

- **Time-ordered** — older work at the top, newer at the bottom, like growth rings.
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

The biggest gap in AI literacy is that technical writing is too dense for investors / operators / curious newcomers, and "explainer" content is too vague for builders. Each node ships **both layers from the same canonical record**, so a hedge fund analyst and an ML engineer can stand on the same facts.

| Section | Tech View | Public View |
|---|---|---|
| What it is | Architecture, equations, novel mechanism | Analogy in plain English |
| How to use it | API / library / code snippet | Where it shows up in products you use |
| Limitations | Failure modes, compute cost, data needs | Risks, costs, what it can't do |
| Strategic angle | Theoretical contribution, what it unlocked | Companies built on it, market size, moat |
| Citations | BibTeX + DOI + arXiv | Press coverage + product launches |

## Views

Multiple ways to navigate the same underlying graph:

- **Graph** (`/`) — primary UX. Force-directed DAG with era columns, parent-edge routing, and hover-to-trace lineage. Drawing principles distilled from 18 sprints of iteration in [`docs/graph-design.md`](./docs/graph-design.md).
- **Timeline** (`/timeline`) — linear time-ordered scroll.
- **Tree** (`/tree`) — alternate hierarchical view.
- **Node detail** (`/node/:slug`) — full Tech + Public view per node, with minimap, parent/child links, and citations.
- **Model detail** — extended pages for foundation models with benchmarks, capabilities, and lineage. See [`docs/model-page-system.md`](./docs/model-page-system.md).
- **Company pages** (`/company/:slug`) — labs and orgs that ship the work.
- **Search** — full-text via [Pagefind](https://pagefind.app/), built into the static output.

## Quick start

```bash
git clone https://github.com/aievolutiontree/aievolutiontree
cd aievolutiontree
npm install
npm run dev          # local dev at http://localhost:4321
npm run build        # static site to ./dist (also builds Pagefind search index)
npm test             # vitest unit tests
```

## Contributing a node

1. Copy `src/content/nodes/_template.mdx` to `src/content/nodes/{year}-{slug}.mdx`.
2. Fill in the frontmatter — the Zod schema is validated at build time, so wrong fields fail loudly.
3. Write the **Tech View** in MDX (code blocks, math, diagrams welcome).
4. Fill in the structured `public_view` fields in the frontmatter.
5. List `parents:` — what prior nodes does this build on?
6. Run `npm run graph:export` to refresh `data/graph.json`, then `npm run build`. Green build = ready to PR.

Full guide: [CONTRIBUTING.md](./CONTRIBUTING.md). Schema spec: [docs/node-schema.md](./docs/node-schema.md).

## Project status

Active development. The seed corpus has crossed 550 nodes spanning seven decades; the schema is stable for everyday contributions but graph layout, model pages, and benchmark ingestion are still iterating. See [`docs/roadmap.md`](./docs/roadmap.md) for what's next and [`docs/devlog.md`](./docs/devlog.md) for how we got here.

## Architecture

- [docs/architecture.md](./docs/architecture.md) — tech stack rationale, data model, rendering strategy, contributor ergonomics
- [docs/graph-design.md](./docs/graph-design.md) — drawing principles for graph-based data visualization (layout topology, anchor system, fan-out stagger, z-order, invariants — distilled from 18 sprints of iteration)
- [docs/devlog.md](./docs/devlog.md) — chronological build journal
- [docs/node-schema.md](./docs/node-schema.md) — authoritative node schema spec
- [docs/model-page-system.md](./docs/model-page-system.md) — model detail-page system
- [data/README.md](./data/README.md) — V2 embedded JSON architecture decision
- [AGENTS.md](./AGENTS.md) — guidance for AI assistants working in this repo

## Licensing

- **Code** — MIT ([LICENSE](./LICENSE))
- **Content** (every `.mdx` in `src/content/`) — CC-BY-SA 4.0 ([LICENSE-CONTENT](./LICENSE-CONTENT))

Attribution to original paper authors is preserved in each node's `citations` field.

## Acknowledgements

The intellectual debt here is to every researcher whose work appears as a node. Citation chains are first-class data, not footnotes.
