# `data/` — V2 embedded JSON graph

This directory holds the **canonical V2 source-of-truth** for the AI Evolution
Tree as a single embedded JSON file.

## Files

### `graph.json`

The complete graph — every node, every edge, every field — in a single
file. Currently auto-generated from the v0.1 MDX content collection
(`src/content/nodes/*.mdx`) by the export script.

**Schema** (top-level keys):

```jsonc
{
  "version": "0.2.0",
  "schema_url": "https://github.com/aievolutiontree/aievolutiontree",
  "generated_at": "2026-04-17T00:34:10.232Z",
  "stats": {
    "node_count": 73,
    "edge_count": 126,
    "year_range": [1958, 2026],
    "orgs": [...],          // alphabetically sorted unique orgs
    "eras": [...],          // unique era values
    "edge_types": [...]     // unique relationship type values
  },
  "nodes": [
    {
      "slug": "transformer",
      "title": "Attention Is All You Need (Transformer)",
      "date": "2017-06-12",
      "era": "transformer",
      "category": ["nlp", "architecture"],
      "authors": [...],
      "org": "Google Brain",
      "breakthrough_score": 10,
      "status": "foundational",
      "model_spec": { "parameters": "...", "context_window": ..., "benchmarks": [...] },
      "public_view": { "plain_english": "...", "analogy": "...", ... },
      "citations": [...],
      "body_md": "## What it is\n\nA transformer is..."  // long-form Tech View
    }
  ],
  "edges": [
    { "from": "transformer", "to": "gpt-1", "type": "builds_on", "note": "..." }
  ]
}
```

**Edges** are derived from each node's `relationships` array (where
`relationships[i].to = parent_slug`). The `from` of an edge is the parent
(older work); the `to` is the child (newer work that depends on it).

## Why JSON over a graph database

Considered: Kuzu (embedded graph DB, Cypher queries), SQLite (graph extension),
Neo4j (server-based).

**Verdict for this scale (73 nodes, 126 edges)**: embedded JSON wins.

| Concern | JSON | Graph DB |
|---|---|---|
| Version control diffs | excellent (text) | poor (binary) |
| Contributor PR friction | low | high |
| Cold start | instant | DB init time |
| Query expressiveness | manual JS filters | rich Cypher |
| Runtime infra | none | DB process |
| Build-time analysis | trivial | overkill |

If the graph grows beyond ~5,000 nodes OR runtime traversal queries become
needed (recommended-path, shortest ancestry, etc.), reconsider Kuzu.

## How to regenerate

```bash
npm run graph:export
```

This re-reads all MDX files and overwrites `graph.json` with the latest content.

## Roadmap

- **v0.2.0 (current)**: JSON generated FROM MDX. MDX remains primary.
- **v0.2.1**: Astro pages migrate to read from `graph.json` instead of Astro
  Content Collections. MDX still authoring source.
- **v0.3.0**: JSON becomes primary. Markdown body files (`content/nodes/{slug}.md`)
  separated from structured graph metadata. MDX layer removed.
- **v0.4.0** (optional): introduce Kuzu / DuckDB if graph queries become needed.
