# Architecture

This document explains **what we chose, why, and what we deliberately did not choose**. If you're considering a non-trivial change, read this first.

## Design principles

1. **Content is data.** Every node is an MDX file with strictly-typed frontmatter. No CMS, no database. Git is the source of truth.
2. **Two audiences, one file.** Tech long-form lives in the MDX body; public-facing structured fields live in frontmatter. Both render from the same canonical record.
3. **Static-first.** The site builds to plain HTML + JS. No server runtime, no per-request cost. Hostable on Cloudflare Pages / Netlify / GitHub Pages / S3.
4. **Schema fails loud.** A malformed node breaks the build. PRs cannot merge with broken schemas.
5. **Citations are first-class data**, not free text. BibTeX-importable.
6. **Contributor ergonomics over framework features.** A new contributor should be able to add a node without learning React.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Astro 5** | Content-collections + Zod schema is purpose-built for this exact problem. Ships zero JS by default; islands only where interactivity is needed (view toggle, search, tree pan/zoom). |
| Content format | **MDX** (Astro Content Collections) | Markdown for prose + JSX for code blocks, SWOT components, citation tables. Type-checked at build. |
| Schema validation | **Zod** (built into Astro CC) | Single source of truth — frontmatter shape, defaults, refinements. |
| Styling | **Tailwind CSS v4** | Utility-first. Zero runtime overhead. Fast for contributors who don't want to think about CSS architecture. |
| Tree visualization | **Custom SVG** for v0; consider [react-flow](https://reactflow.dev/) island for v0.2 if interactivity demands it. | Vertical timeline with parent-edge curves is enough for the seed corpus. Don't over-engineer. |
| Search | **[Pagefind](https://pagefind.app/)** (post-build static index) | Zero-runtime. Searches frontmatter + body. Works on static hosting. |
| Math | **KaTeX** via `rehype-katex` | Some nodes need equations (attention, KL divergence). KaTeX is faster than MathJax. |
| Code highlighting | **Shiki** (built into Astro) | Same engine as VS Code. Server-side, zero JS shipped. |
| Hosting | **Cloudflare Pages** (recommended) / Vercel / Netlify | Static; any of these works. Cloudflare's free tier is generous and global. |

## Stacks we considered and rejected

| Option | Why not |
|---|---|
| **Next.js + MDX** | Heavier runtime than needed; App Router complexity buys us nothing for a content site. Reconsider if we add user accounts / comments. |
| **Hugo** | Faster builds, but Zod schema validation in TypeScript beats Hugo's templating for type safety. Astro wins on contributor DX. |
| **Docusaurus** | Optimized for sequential docs; the tree-shaped DAG of advancements doesn't fit its mental model. |
| **Notion / Airtable as backend** | Hides content from version control. Defeats the open-source contribution flow. |
| **Custom React SPA + JSON DB** | Reinvents what Content Collections already give us. Worse SEO. |

## Data model

```
Node
├── slug:              "transformer"
├── title:             "Attention Is All You Need (Transformer)"
├── date:              2017-06-12         (ISO-8601, paper date or release date)
├── era:               "transformer"      (enum: see node-schema.md)
├── category:          ["nlp", "architecture"]   (tags)
├── parents:           ["seq2seq", "attention-mechanism"]  (slugs of nodes this builds on)
├── authors:           ["Vaswani, A.", "Shazeer, N.", ...]
├── institution:       "Google Brain"
├── breakthrough_score: 10                (1-10, importance — moderated, not self-assigned)
├── status:            "foundational"     (enum: foundational | active | superseded | archived)
├── public_view:                          (structured object — Public View renders from this)
│   ├── plain_english:    "..."
│   ├── analogy:          "..."
│   ├── applications:     [{ product, company, year_deployed }]
│   ├── investment_angle: "..."
│   ├── market_size_usd:  ?
│   └── why_it_matters:   "..."
├── citations:         [{ type, key, title, authors, year, url, doi?, arxiv? }]
└── body (MDX):        Tech View — long-form, code blocks, equations
```

A **node is the unit of versioning, citation, and PR review**. One node = one PR (usually). Splitting a node means filing two PRs with explicit `parents:` linking the new ones to a third existing node.

### Edge semantics — `parents`

`parents` is an array of node slugs. Semantically: "this work would not exist (or would look very different) without these prior contributions." It is **not** "every paper this work cites" — that's what `citations` is for. Parent edges are **load-bearing intellectual lineage**, max ~3-5 per node. PR review enforces this.

### Why parent edges instead of a flat timeline

A flat timeline answers "what came when." A DAG answers "what made what possible." Investors care about the second; the first is Wikipedia.

## Rendering strategy

- **Build time** — Astro reads `src/content/nodes/*.mdx`, validates against `src/content.config.ts`, generates one HTML page per node + a tree-overview homepage. Pagefind indexes the output.
- **Tree page (`/`)** — vertical SVG timeline, x-axis grouped by `era`, y-axis = chronological. Parent edges drawn as bezier curves. Click → node detail.
- **Node page (`/node/{slug}`)** — view toggle (Tech / Public), persists in localStorage. Tech View = MDX body. Public View = `public_view` frontmatter rendered through structured templates.
- **Search (`/search`)** — Pagefind UI, filters by era / category / status.

## Build pipeline

```
src/content/nodes/*.mdx
        │
        ▼
[Zod schema validation]   ← fails build on malformed frontmatter
        │
        ▼
[Astro static build]      ← MDX → HTML, Shiki highlighting, KaTeX math
        │
        ▼
[Pagefind index]          ← post-build search index
        │
        ▼
        dist/             ← ship this anywhere static
```

## Performance budget

- HTML payload per node page: < 50 KB before content
- Total JS shipped to client (homepage + tree): < 30 KB gzipped
- Lighthouse Performance target: 95+
- Build time for 100 nodes: < 30 seconds

If a PR breaks any of these, justify or fix.

## Scaling assumptions

| Node count | Implication |
|---|---|
| 1 – 50 | Current architecture is overkill. Fine. |
| 50 – 500 | Sweet spot. Pagefind + static SVG tree handle this comfortably. |
| 500 – 5000 | Consider lazy-loading tree branches; switch to canvas/WebGL rendering for the homepage tree. |
| 5000+ | Reconsider data layer (move to a graph DB at build time, generate per-era pages). Out of scope for v1. |

## What's intentionally not here (and why)

- **Comments / discussion threads** — GitHub Issues per node serve this. Don't reinvent moderation.
- **User accounts** — adds backend, auth, GDPR. Not needed for v1.
- **Real-time updates** — content cadence is weeks-to-months, not seconds. Static rebuilds are fine.
- **Translation infra** — English first. Add `i18n` collections in v0.3 once the schema is stable.
- **AI-generated content** — every node must be human-reviewed for accuracy. Drafts can use AI; merges cannot bypass review.

## Open questions (tracked in [roadmap.md](./roadmap.md))

- Tree layout algorithm at scale — naive vertical timeline degrades past ~200 nodes.
- "Recommended path" feature — guided tour through the tree for newcomers.
- Citation export (one-click BibTeX of a subtree).
