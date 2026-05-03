# AI Evolution Tree

AI Evolution Tree is an open source project that maps how important AI models, papers, and breakthroughs connect over time.

It is designed to make AI history easier to explore through:

- a visual graph of lineage and influence
- node pages with citations and context
- model and company pages
- timeline and tree-based views

The project is open to collaboration. If you want to add missing nodes, improve the data, fix mistakes, or help shape the product, contributions are welcome.

## Project status

The project is active and already usable as a reference site.

- `178` nodes are currently exported in `data/graph.json`
- the site includes graph, timeline, and tree views
- node, model, and company pages are live
- search is built with Pagefind
- the content schema and contribution workflow are in place

The repo is still evolving. Graph layout, model coverage, and data quality are continuing to improve.

## Who it is for

AI Evolution Tree is meant to be legible to more than one audience:

- builders who want technical context
- researchers and students who want lineage and citations
- general readers who want a clear overview of what happened and why it matters

## Tech stack

- Astro
- MDX content collections
- Tailwind CSS
- Pagefind
- Vitest

## Run locally

```bash
git clone https://github.com/aievolutiontree/aievolutiontree
cd aievolutiontree
npm install
npm run dev
```

Local development server: `http://localhost:4321`

## Useful commands

```bash
npm run dev
npm run build
npm run check
npm test
npm run graph:export
```

## Contributing

This project is open source and community-driven.

You can contribute by:

- adding a node
- improving citations or explanations
- fixing site bugs
- improving graph behavior or page design
- reviewing data quality and lineage links

Start with:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [docs/node-schema.md](./docs/node-schema.md)
- [docs/graph-design.md](./docs/graph-design.md)

If you change graph rendering code, you must also update [docs/graph-design.md](./docs/graph-design.md) in the same change.

## Documentation

- [docs/architecture.md](./docs/architecture.md)
- [docs/roadmap.md](./docs/roadmap.md)
- [docs/model-page-system.md](./docs/model-page-system.md)
- [docs/devlog.md](./docs/devlog.md)

## License

Code: [MIT](./LICENSE)  
Content in `src/content/`: [CC-BY-SA 4.0](./LICENSE-CONTENT)
