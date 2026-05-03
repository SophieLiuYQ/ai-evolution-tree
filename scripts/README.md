# Scripts

Active scripts wired into `package.json` live at the top level of this
directory. Historical one-off migration and audit scripts live in
[`archive/`](./archive) — kept for reference but not maintained.

## Active

| Script | npm command | Purpose |
|---|---|---|
| `migrate-mdx-to-json.mjs` | `npm run graph:export` | Rebuild `data/graph.json` from `src/content/nodes/*.mdx`. Run after schema or content changes. |
| `fetch-benchmarks.mjs` | `npm run benchmarks:fetch` / `:dry` | Pull latest benchmark numbers. |
| `bootstrap-companies.mjs` | `npm run companies:bootstrap` | Seed company nodes. |
| `import-aa-catalog.mjs` | `npm run companies:import-aa` | Sync from Artificial Analysis catalog (dry-run by default). |
| `audit-model-correctness.mjs` | `npm run audit:model[:strict\|:recent\|:recent:strict]` | Validate model nodes against authoritative sources. |

`lib/` contains shared helpers used by both active and archived scripts.

## Archive

`archive/` holds completed migrations, ad-hoc fetchers, and
investigation scripts. Don't add new scripts here — if a one-off
becomes useful enough to keep, wire it into `package.json` and promote
it to the top level.
