# 🌳 AI Evolution Tree

**A community-curated graph of AI's load-bearing breakthroughs — explained twice: once for builders, once for everyone else.**

🔗 [aievolutiontree.com](https://www.aievolutiontree.com) · 550+ nodes · 1957 → today · **open to collaboration**

---

## What it is

A version-controlled, citation-backed DAG of ML / DL / LLM advancements. Each node lists the prior work it builds on, so reading top-to-bottom is reading the field's intellectual lineage.

Every node ships two views from the same record:

- 🛠 **Tech View** — architecture, code, limitations, citations.
- 💼 **Public View** — plain English, products, market angle, why it matters.

So a hedge fund analyst and an ML engineer can stand on the same facts.

## What it is not

A paper aggregator, a leaderboard, or hype tracking. We curate **load-bearing** work — the stuff the rest of the field grew out of.

## Views

- **Graph** (`/`) — primary UX. Force-directed DAG, era columns, hover-to-trace lineage. See [`docs/graph-design.md`](./docs/graph-design.md).
- **Timeline** / **Tree** — alternate linear and hierarchical views.
- **Node detail** — full Tech + Public view, minimap, parent/child links, citations.
- **Model pages** — benchmarks, capabilities, lineage for foundation models.
- **Company pages** — labs and orgs that ship the work.
- **Search** — full-text via Pagefind.

## Quick start

```bash
git clone https://github.com/aievolutiontree/aievolutiontree
cd aievolutiontree
npm install
npm run dev          # http://localhost:4321
npm run build        # static site → ./dist (+ Pagefind index)
npm test             # vitest
```

## Contribute a node

1. Copy `src/content/nodes/_template.mdx` → `src/content/nodes/{year}-{slug}.mdx`.
2. Fill the frontmatter (Zod-validated at build).
3. Write the Tech View in MDX; fill `public_view` fields.
4. List `parents:` — what does this build on?
5. `npm run graph:export && npm run build`. Green build → PR.

Full guide: [CONTRIBUTING.md](./CONTRIBUTING.md). Schema: [docs/node-schema.md](./docs/node-schema.md).

## Status

Active development. **Open to collaboration** — issues, PRs, and node additions all welcome. Schema is stable for everyday contributions; graph layout, model pages, and benchmark ingestion are still iterating. See [`docs/roadmap.md`](./docs/roadmap.md).

## Docs

- [docs/architecture.md](./docs/architecture.md) — stack rationale, data model, rendering
- [docs/graph-design.md](./docs/graph-design.md) — graph drawing principles (18 sprints of iteration)
- [docs/node-schema.md](./docs/node-schema.md) — authoritative schema
- [docs/model-page-system.md](./docs/model-page-system.md) — model detail pages
- [docs/devlog.md](./docs/devlog.md) — build journal
- [docs/roadmap.md](./docs/roadmap.md) — what's next
- [AGENTS.md](./AGENTS.md) — guidance for AI assistants

## License

Code: [MIT](./LICENSE). Content (every `.mdx` in `src/content/`): [CC-BY-SA 4.0](./LICENSE-CONTENT). Author attribution lives in each node's `citations` field.
