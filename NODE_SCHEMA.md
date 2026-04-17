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
Slugs of other nodes that this work **directly builds on**. Not citations — *intellectual ancestors*. Guideline: max 3–5. If you find yourself listing 8 parents, you are conflating "cites" with "builds on."

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
