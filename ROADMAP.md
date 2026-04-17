# Roadmap

Living document. Phases are not rigid — we ship value continuously and re-prioritize when the seed corpus reveals real friction.

## v0.1 — Foundation (current)

**Goal: prove the schema works for 30+ nodes spanning 70 years.**

- [x] Project skeleton + docs (README, ARCHITECTURE, CONTRIBUTING)
- [x] Astro 5 + Content Collections + Tailwind 4 scaffold
- [x] Zod schema for nodes (`src/content.config.ts`)
- [x] 7 seed nodes (Perceptron → ChatGPT) covering era diversity
- [x] Node detail page with View Toggle (Tech ↔ Public)
- [x] Vertical timeline tree on homepage
- [ ] Pagefind search integration
- [ ] CI: build check on every PR (GitHub Actions)
- [ ] Deploy to Cloudflare Pages

**Exit criteria:** A new contributor with no prior context can add a node in < 30 minutes by reading docs alone.

## v0.2 — Density and discoverability

**Goal: 100+ nodes; site is genuinely useful as a reference.**

- Tag-based filtering (era, category, status)
- "Recommended path" — curated linear walk-throughs (e.g., "How we got to ChatGPT in 12 nodes")
- Per-node BibTeX export + subtree BibTeX export
- Era landing pages (`/era/transformer`, `/era/classical-ml`)
- Author pages (auto-generated from `authors:` frontmatter)
- Improved tree layout — naive vertical degrades past ~60 nodes; switch to grouped-by-era columns

## v0.3 — Community infra

**Goal: contribution flow scales beyond the founders.**

- Issue templates: "Suggest a node," "Report inaccuracy," "Schema discussion"
- PR template enforces submission checklist
- Auto-link from "Issues" to relevant nodes
- Maintainer rotation policy
- "Editor's note" frontmatter field for nodes under active dispute
- Reviewer guidelines doc

## v0.4 — Internationalization

**Goal: at least zh-CN parity for the top 30 nodes.**

- `src/content/nodes/{lang}/` collection structure
- Language toggle in header
- Per-language `public_view` (Tech View can stay English first; Public View must localize)
- Translation contribution guide

## v0.5 — Interactive tree

**Goal: tree visualization scales to 500+ nodes.**

- React-flow island for tree page (pan, zoom, focus on subtree)
- "Highlight ancestors / descendants" on hover
- Click-to-pin node card alongside tree
- Performance budget: < 300ms time-to-interactive on 500-node graph

## v1.0 — Stable schema, stable URLs

**Goal: external sites can deep-link to nodes with confidence.**

- Schema versioning + migration tool
- Stable URL scheme committed to (no more breaking renames)
- JSON API endpoint (`/api/nodes.json`) for programmatic consumers
- RSS feed of newly merged nodes
- License + attribution audit on every node

## Beyond v1

Speculative — none of these are committed. Listed so contributors don't propose them as "missing":

- Comments / discussion (probably remains GitHub Issues per node)
- AI-assisted "explain this node at level X" — would require careful guardrails to not become misinformation
- Embeddings-based "related nodes" recommendation
- Personal "learning path tracker" — requires user accounts, not a fit for v1

---

## How to influence the roadmap

- Open an Issue tagged `roadmap` with a use case. We re-prioritize quarterly.
- Send a PR for v0.1/v0.2 items — most are unowned.
- Don't send a PR for v0.3+ items without prior Issue discussion (architectural commitment risk).

## What "done" means

A milestone is done when:
1. The features listed are merged and deployed.
2. Contributor docs are updated to reflect the new state.
3. There's evidence (analytics, contribution count, issue resolution time) that the milestone delivered the goal — not just the features.
