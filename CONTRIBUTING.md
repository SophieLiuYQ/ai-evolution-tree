# Contributing to AI Evolution Tree

Thank you for considering a contribution. This project is **community-curated**: every node is a PR, every PR is reviewed, every merge is permanent attribution.

## TL;DR

1. Fork → branch → add or edit `src/content/nodes/{year}-{slug}.mdx`.
2. Run `npm run build` locally — must pass.
3. Open a PR using the **Add a node** template. Reviewer merges or requests changes.

---

## Quickstart

```bash
git clone https://github.com/<you>/ai-tree && cd ai-tree
npm install
npm run dev          # local site at http://localhost:4321
npm test             # run unit tests (vitest)
npm run build        # must pass before opening a PR
```

CI runs `npm run check`, `npm test`, and `npm run build` on every PR.

### Tests

Tests live in [`tests/`](./tests). They cover:

- **Frontmatter schema** — every node MDX has required fields, valid era/status/relationship enums, and unique slugs.
- **`data/graph.json` invariants** — no duplicate slugs, no self-loops, sorted by date.
- **Migration script** — `npm run graph:export` runs cleanly and regenerates a valid graph.

A few checks (dangling parent refs, year mismatches) are pinned to current
counts via `*_BASELINE` constants — PRs may only *reduce* the count, not
grow it. If you fix some, lower the baseline.

New to the codebase? Read these in order:

- [`README.md`](./README.md) — what this project is.
- [`docs/architecture.md`](./docs/architecture.md) — tech stack and rationale.
- [`docs/node-schema.md`](./docs/node-schema.md) — node frontmatter spec (authoritative).
- [`docs/graph-design.md`](./docs/graph-design.md) — graph-rendering rules. **Required reading before touching `src/components/Graph.astro` or its siblings.**
- [`AGENTS.md`](./AGENTS.md) — rules for AI assistants (Claude/Codex/Gemini). Humans can skip.

---

## Three kinds of contribution

### 1. Add a node

The most common contribution. Follow the **node submission checklist** below.

### 2. Edit a node

Corrections, better citations, clearer explanations, additional `parents:` you discovered. Open a PR with the diff. Substantive content changes (e.g., reframing what a node "is") need a brief justification in the PR body.

### 3. Edit the platform itself

Schema changes, new components, build tooling. These are bigger — open an Issue first to discuss before sending a PR. Schema-breaking changes require a `MIGRATION.md` entry.

> **Touching graph code?** Any change to `src/components/Graph.astro`, `MiniGraph.astro`, or `Tree.astro` MUST update [`docs/graph-design.md`](./docs/graph-design.md) in the same commit. This is the project's iteration contract — see that doc and `AGENTS.md` Rule #1 for the rationale.

---

## Node submission checklist

Before opening a PR, confirm each:

- [ ] **Filename** is `src/content/nodes/{year}-{slug}.mdx` where `{year}` is the publication / release year and `{slug}` is kebab-case.
- [ ] **Frontmatter passes Zod schema** (run `npm run build`; errors are explicit).
- [ ] **`parents:`** lists 0–5 existing node slugs that this work directly builds on. If a parent doesn't exist yet, either add it first (separate PR) or omit and note in PR description.
- [ ] **`citations:`** includes the canonical paper / release announcement, with `arxiv` or `doi` populated when available.
- [ ] **Tech View body** answers: *what is it, how do you use it, what are the limits?* Code blocks where useful. Math with `$$` blocks where it clarifies.
- [ ] **`public_view`** frontmatter answers the same three questions in plain English, plus an investment / application angle.
- [ ] **No marketing language.** "Revolutionary," "groundbreaking," "game-changing" → cut. State what the work did and let the reader judge.
- [ ] **No AI-generated text passed off as written.** AI-assisted is fine; verbatim model output is not. Reviewer can usually tell.

---

## Writing a great node

### What makes a node "load-bearing" enough to merge?

We curate **breakthroughs the rest of the field grew out of**, not every interesting paper. Rough rubric:

| Criterion | Reject | Borderline | Merge |
|---|---|---|---|
| Cited count (3+ years post-publication) | < 100 | 100 – 1000 | 1000+ |
| Direct successors visible | None | A few derivative works | Spawned a sub-field |
| Production deployment | None known | Internal tools only | In products users touch |
| Theoretical contribution | Incremental | Notable refinement | New mechanism / paradigm |

A node only needs to clear **one** column to be mergeable. (Pre-2010 work is judged on historical importance, not citation counts.)

### Writing the Tech View

Address a reader who knows ML at a graduate-student level. Assume they can read PyTorch and follow notation. Don't assume they know *this specific* technique.

Structure the body roughly as:

```
## What it is
1-2 paragraphs. The novel mechanism, in your own words.

## How it works
The key equation(s) or architectural diagram. Code if it clarifies.

```python
# Minimal illustrative implementation
```

## How to use it
What library? What's the API? Smallest useful example.

## SWOT
- **Strengths** — what it does that prior work couldn't
- **Weaknesses** — known failure modes, compute cost, data requirements
- **Opportunities** — what it enables that hasn't been fully exploited
- **Threats** — what later work has eroded its position

## Citations
Use the structured `citations:` frontmatter. The body can prose-cite ("see [1]") referencing those entries.
```

### Writing the Public View (frontmatter `public_view`)

Address a reader who is **investment-, product-, or policy-minded**. Examples: a fund analyst sizing a market, a PM deciding whether to bet a roadmap, a journalist writing a feature, a curious teenager.

- **`plain_english`** — 2–3 sentences. No equations, no jargon. If you can't explain it without using "transformer" or "attention," you don't understand it well enough yet.
- **`analogy`** — one analogy, ideally to something physical or social.
- **`applications`** — list of `{ product, company, year_deployed }`. Real shipping products only. Demos don't count.
- **`investment_angle`** — what category of business this enables, the moat shape (data? compute? distribution?), historical analogues.
- **`market_size_usd`** — optional, only if you can cite a credible source. Round to nearest billion / million.
- **`why_it_matters`** — one paragraph. Why a non-technical reader should care.

---

## Code of conduct

Be civil, attribute generously, never plagiarize. PR comments are public and indexed.

## Reviewer's responsibilities

- **Verify citations.** Every cited paper / DOI / arXiv link must resolve.
- **Verify `parents:`.** Each listed parent should be a meaningful intellectual ancestor, not just chronologically prior.
- **Verify `public_view` doesn't mislead.** It's tempting to dramatize for clarity; we resist this.
- **Push back on hype language.** "First ever," "revolutionary" → request edit.
- **Merge with squash + co-author trailer** when multiple contributors collaborated.

## License of contributions

By submitting a PR you agree your contribution is licensed under MIT (code) or CC-BY-SA 4.0 (content). You retain copyright.
