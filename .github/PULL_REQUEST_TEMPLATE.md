<!--
Thanks for contributing! Pick the section that matches your PR
and delete the others.
-->

## Type

- [ ] New node
- [ ] Edit / correction to an existing node
- [ ] Platform change (component, schema, tooling)
- [ ] Docs only

## Summary

<!-- One paragraph: what changed and why. -->

## Checklist

- [ ] `npm run build` passes locally.
- [ ] If this touches graph code (`src/components/Graph.astro`, `MiniGraph.astro`, `Tree.astro`), I updated [`docs/graph-design.md`](../docs/graph-design.md) in the same commit.
- [ ] If this touches the node schema (`src/content.config.ts`), I updated [`docs/node-schema.md`](../docs/node-schema.md) and re-ran `npm run graph:export`.
- [ ] No marketing language ("revolutionary", "groundbreaking", etc.).
- [ ] Citations resolve (arXiv / DOI / canonical URL).

## For node submissions

- [ ] Filename: `src/content/nodes/{year}-{slug}.mdx`
- [ ] `parents:` lists 0–5 existing slugs that are real intellectual ancestors.
- [ ] `public_view.plain_english` avoids jargon.

## Notes for reviewer

<!-- Anything non-obvious: tradeoffs considered, alternatives rejected, open questions. -->
