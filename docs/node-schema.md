# Node Schema Specification

This is the authoritative spec for an AI Evolution Tree node. It is enforced by `src/content.config.ts` — anything not described here will either be ignored or fail the build.

**Schema version:** `0.1.0`
**Stability:** Pre-alpha. Breaking changes until `1.0.0`.

---

## File naming

```
src/content/nodes/{year}-{slug}.mdx
```

- `{year}` — four-digit publication / release year.
- `{slug}` — kebab-case, globally unique, stable. Use the common short name (`transformer`, not `attention-is-all-you-need`).

Examples:
- `1957-perceptron.mdx`
- `2017-transformer.mdx`
- `2020-gpt-3.mdx`
- `2022-chatgpt.mdx`

## Frontmatter

All fields listed below. Required unless marked optional.

```yaml
---
slug: transformer                          # string, kebab-case, unique
title: "Attention Is All You Need (Transformer)"   # string, human-facing
date: 2017-06-12                           # ISO-8601 date (YYYY-MM-DD)
era: transformer                           # enum, see below
category: [nlp, architecture]              # array of tags (free-form but see conventions)
parents: [seq2seq, attention-mechanism]    # array of slugs — REQUIRED, can be empty []
authors:                                   # array of strings, "Lastname, F." format preferred
  - "Vaswani, A."
  - "Shazeer, N."
  - "Parmar, N."
  - "Uszkoreit, J."
institution: "Google Brain"                # string, primary affiliation (optional)
breakthrough_score: 10                     # integer 1-10, moderated at review time
status: foundational                       # enum, see below

public_view:                               # structured object — Public View renders from this
  plain_english: |
    A neural network architecture that processes all words in a sentence
    in parallel instead of one at a time, using an "attention" mechanism
    that lets each word consider every other word directly.
  analogy: |
    Earlier models read a sentence like a conveyor belt — one word at a time.
    A transformer lays the whole sentence on a table and lets every word
    look at every other word at once.
  applications:
    - product: "Google Translate (neural)"
      company: "Google"
      year_deployed: 2018
    - product: "GPT-3 / ChatGPT"
      company: "OpenAI"
      year_deployed: 2020
  investment_angle: |
    Enabled the entire LLM wave. Every model now valued at a combined
    multi-hundred-billion-USD cap runs on a transformer variant. Moat shape:
    compute + data scale. Historical analogue: introduction of internal
    combustion engine — the enabling tech, not the end product.
  market_size_usd: 200000000000            # integer USD, optional, cite source in body
  why_it_matters: |
    If you're investing in, competing with, or regulating any generative
    AI company as of 2025, this 2017 paper is the technical root of what
    you are dealing with.

citations:                                 # array of citation objects, at least 1 required
  - type: paper                            # paper | book | release | blog | talk | dataset
    key: vaswani2017attention              # BibTeX-style key, unique within node
    title: "Attention Is All You Need"
    authors: ["Vaswani, A.", "et al."]
    year: 2017
    venue: "NeurIPS"
    arxiv: "1706.03762"
    doi: "10.48550/arXiv.1706.03762"
    url: "https://arxiv.org/abs/1706.03762"
---
```

## Field reference

### `slug` (string, required)
Kebab-case. Must be unique across the entire `nodes/` collection. Use the common short name, not the paper title.

### `title` (string, required)
Human-facing heading. The standard format is `"Common Name (Paper Title)"` but use judgment — for non-paper entries like "AlphaGo defeats Lee Sedol," just write the event name.

### `date` (ISO date, required)
The most meaningful date for the advancement. Usually paper publication date. For products, use initial release date. For events (e.g., AlphaGo vs Lee Sedol), use the event date. **Ordering in the tree depends on this field — get it right.**

### `era` (enum, required)
One of:

| `era` value | Covers |
|---|---|
| `foundations` | Pre-1980 — perceptron, cybernetics, early neural nets, symbolic AI beginnings |
| `classical-ml` | ~1980–2005 — SVMs, boosting, graphical models, kernel methods |
| `deep-learning-revival` | ~2006–2014 — DBNs, dropout, AlexNet, word2vec, seq2seq |
| `architectures` | Attention, ResNet, GANs, VAEs, BatchNorm (roughly 2014–2017) |
| `transformer` | 2017+ transformer-family language work pre-LLM scale |
| `scale-era` | 2019+ scaling laws, GPT-2/3, PaLM, Chinchilla |
| `alignment` | RLHF, Constitutional AI, InstructGPT lineage |
| `multimodal` | CLIP, DALL·E, Flamingo, GPT-4V lineage |
| `reasoning` | Chain-of-thought, o1-style inference-time compute, tool use |
| `agents` | Function calling, ReAct, autonomous task execution |
| `frontier` | Current research, < 18 months old, expect re-classification |

This list **will evolve**. Schema PRs that add eras require consensus.

### `category` (array of strings, required)
Free-form tags. Common ones: `nlp`, `cv`, `rl`, `generative`, `architecture`, `training`, `inference`, `safety`, `theory`, `benchmark`, `dataset`, `infrastructure`. Try to reuse existing tags before inventing new ones.

### `parents` (array of slugs, required, may be empty)
Deprecated. Use `relationships[]` instead.

### `relationships` (array, optional)
Edges from this node to other nodes in the tree graph. Each entry:

```yaml
relationships:
  - to: gpt-4
    type: builds_on
    note: "Same-series successor; larger training + new modalities"
```

Allowed `type` values (kept intentionally small):
- `builds_on` — direct lineage / successor / technical inheritance
- `competes_with` — same-surface competitors / direct comparisons
- `open_alt_to` — a more-open, self-hostable alternative to a more-closed peer

Use `note` to preserve nuance (e.g. scale jumps, distillation, fine-tuning) when the
underlying relationship semantics don’t warrant a separate edge type.

Empty array `[]` is valid for root nodes (e.g., `perceptron`).

### `authors` (array of strings, required)
Format: `"Lastname, F."` or `"Lastname, First Middle"`. For 6+ authors, list first 4 then `"et al."`.

### `institution` (string, optional)
Primary affiliation at time of work. If multiple institutions, pick the lead lab.

### `breakthrough_score` (integer 1–10, required)
Subjective importance, moderated at PR review.

| Score | Meaning |
|---|---|
| 10 | Foundational. Entire field would be different without it. (Perceptron, Backprop, Transformer.) |
| 8–9 | Defines a sub-field or unlocks a wave of derivative work. (AlexNet, GAN, BERT, GPT-3.) |
| 6–7 | Major refinement / important benchmark result. (Dropout, BatchNorm, Chinchilla scaling laws.) |
| 4–5 | Solid contribution, widely cited, not paradigm-shifting. |
| 1–3 | Historically interesting or niche — use sparingly; marginal nodes clutter the tree. |

Self-assigned scores are a starting point, not final. Reviewers adjust.

### `status` (enum, required)
| Value | Meaning |
|---|---|
| `foundational` | Still taught, still cited, still influential decades later |
| `active` | Current state of the art or actively deployed |
| `superseded` | Replaced by later work; historically important, no longer preferred |
| `archived` | Work that was influential but is now mostly a curiosity |

### `model_spec` (object, optional)
Technical spec + benchmark block shown on the node page.

Key fields (all optional unless noted):

- `model_spec.parameters` — freeform (e.g. `"671B total / 37B active MoE"`).
- `model_spec.architecture` — freeform summary (MoE, routing, etc.).
- `model_spec.context_window` — integer tokens.
- `model_spec.release_type` — `paper | api | open_weights | demo | product`.
- `model_spec.modalities` — array of strings (e.g. `["text","vision"]`). If
  you don’t specify input/output separately, the UI treats this as both.
- `model_spec.modalities_in` / `model_spec.modalities_out` — optional arrays
  of strings for models where I/O differ (e.g. STT, TTS, text-to-image).
- `model_spec.benchmarks[]` — array of `{ name, score, vs_baseline?, source_url? }`.
- `model_spec.homepage` / `model_spec.github` — official links.
- `model_spec.aa_url` — Artificial Analysis model page (optional).
- `model_spec.hf_url` — Hugging Face model page (optional).

#### `model_spec.media_samples[]` (optional)
For media-output models (audio / image / video), a small set of demo
outputs rendered above the capability bars on the detail page. Layout
mirrors the example mocks: 3 audio-with-waveform cards, an image
gallery, or a video reel.

Each sample:

- `kind` — `audio | image | video`. Must match the model's primary
  output modality; the page picks the dominant kind from
  `modalities_out` and filters to that.
- `title` (string, required) — short, scannable (e.g. "Cinematic Orchestra").
- `url` (URL, required) — direct media URL (mp3 / mp4 / jpg / png / webm)
  hosted by the lab itself. We don't host samples; only link to canonical
  sources.
- `poster` (URL, optional) — thumbnail for video samples.
- `duration` (string, optional) — `"0:24"` style label.
- `caption` (string ≤ 140 chars, optional) — prompt or short description.

Up to 6 entries are rendered. Block hides itself when the array is empty.

#### `model_spec.variants[]` (optional)
Use variants to represent **versioned/tiered surfaces** inside a single model
family without adding separate graph nodes (e.g. GPT‑5.2 Instant/Thinking/Pro).

Each variant:

- `id` (string, required) — stable key used by the UI switcher.
- `label` (string, required) — human-facing name.
- `status` (optional) — `preview | active | legacy | retired`.
- `released_at` / `retired_at` (optional) — ISO dates.
- `api_model` (optional) — canonical API model id (if applicable).
- `benchmarks[]` (optional) — per-variant benchmark set; if omitted the UI
  falls back to the parent `model_spec.benchmarks`.

#### `model_spec.family` (optional)
String used by `/tree/` “By Family” layout to place nodes into stable
evolution lanes (e.g. `"OpenAI GPT"`, `"Anthropic Claude"`). If omitted,
the tree falls back to a heuristic based on slug/org.

#### `model_spec.best_for` (optional)
One or two sentences in plain English describing the model’s primary use case.
No benchmark numbers; avoid repeating fields shown elsewhere (modalities,
context, parameters).

#### `model_spec.price_tier` (optional)
Coarse tier for UI grouping and “alternative” matching:
`free | cheap | standard | premium | enterprise`.

#### `model_spec.sources[]` (optional)
Provenance entries for model-level spec fields (homepage/github/AA/HF links,
modalities, context, parameters, availability, etc.). Each entry:

- `name` — short label, e.g. "Official docs", "Artificial Analysis"
- `type` — `official | independent | community | derived`
- `url` — canonical source URL
- `last_verified_at` (optional) — when we last verified against this source
- `confidence` (optional) — `high | medium | low`
- `notes` (optional) — short caveats

#### `model_spec.last_verified_at` (optional)
When the model spec was last checked and updated by a human editor. This should
reflect reality (not an automated crawl timestamp).

### `graph_hidden` (boolean, optional)
If true, the node still has a detail page at `/node/{slug}/` but is
excluded from the `/tree/` graph. Used to collapse many fine-grained
SKU-level model variants into one “series” node while keeping the
variants accessible.

### `graph_featured` (boolean, optional)
If present on any node, `/tree/` and `/timeline/` switch into a
“featured-only” view: they render only nodes where `graph_featured: true`
(and always exclude `graph_hidden: true`). Intended for extreme
compaction, e.g. one representative model-line per company per year
(distinct names like Sonnet vs Haiku remain separate); the rest remains
accessible via company pages and direct node URLs.

### `public_view` (object, required)
See sub-fields above. All sub-fields are required except `market_size_usd`. Keep each ≤ the word limits below — Public View is meant to be scannable.

| Field | Word budget |
|---|---|
| `plain_english` | 40–80 |
| `analogy` | 30–60 |
| `applications` | 2–5 items |
| `investment_angle` | 60–120 |
| `why_it_matters` | 30–80 |

### `citations` (array, at least 1 required)
Each entry:

| Field | Required | Notes |
|---|---|---|
| `type` | yes | `paper` \| `book` \| `release` \| `blog` \| `talk` \| `dataset` |
| `key` | yes | BibTeX-style, unique within this node |
| `title` | yes | |
| `authors` | yes (except for `release`) | |
| `year` | yes | |
| `venue` | no | Conference / journal / publisher |
| `arxiv` | no | arXiv ID, e.g., `"1706.03762"` |
| `doi` | no | |
| `url` | recommended | Canonical URL |

The first citation in the array should be the primary / canonical reference for the node.

## MDX body

Free-form MDX. Recommended structure in CONTRIBUTING.md. The body is the **Tech View**.

Components available in MDX:
- `<SWOT>` — render a 2x2 SWOT grid (Strengths/Weaknesses/Opportunities/Threats)
- `<Citation bibkey="vaswani2017attention" />` — inline citation linking back to `citations` array

(More components added over time; see `src/components/mdx/` for the registry.)

## Company pages (content collection)

In addition to `nodes`, the site also has a `companies` content collection used
to generate `/company/{slug}/` pages.

File naming:

```
src/content/companies/{slug}.mdx
```

Frontmatter (see `src/content.config.ts` for the enforced schema):

- `slug` (required) — kebab-case identifier used in the URL.
- `name` (required) — display name.
- `orgs[]` (required) — which `org` values from node frontmatter belong to this company view.
- `homepage` (optional) — official site.
- `summary` / `summary_zh` — short description shown on listing pages.
- `catalog[]` (optional) — manual list of official model ids (used to track what’s missing from the tree).
- `catalog[].node_slug` (optional) — link a catalog item to an existing tree node.
- `sources[]` (optional) — URLs for the company page.

## Validation

Run `npm run build`. Failures are printed with file path and field. Typical errors:

- `Invalid enum value for 'era'` — check the enum list above
- `'parents' contains unknown slug 'foo'` — parent must exist or be added in the same PR
- `'public_view.plain_english' exceeds 80 words` — trim or split
- `'breakthrough_score' must be between 1 and 10` — you know what to do

## Changelog

### 0.1.0 (current)
- Initial schema.
- Known limitation: no support for `children:` reverse edges (derived at build time from `parents:` instead).
- Known limitation: no per-locale fields; single-language (English) only.
