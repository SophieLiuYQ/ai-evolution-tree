#!/usr/bin/env node
/**
 * V2 migration: read all MDX files in src/content/nodes/ and produce
 * a single embedded data/graph.json containing the full graph.
 *
 * Output schema (data/graph.json):
 * {
 *   "version": "0.2.0",
 *   "generated_at": "ISO timestamp",
 *   "stats": { "node_count": N, "edge_count": M, "year_range": [min, max] },
 *   "nodes": [
 *     {
 *       slug, title, date, era, category[], authors[], org,
 *       breakthrough_score, status, model_spec?, public_view,
 *       citations[], body_md   // ← markdown body extracted from MDX
 *     }
 *   ],
 *   "edges": [
 *     { from: slug, to: slug, type, note? }
 *   ]
 * }
 *
 * Edges are derived from each node's `relationships` array:
 *   node.relationships[i] = { to, type, note }
 *   → edge { from: parent_slug=to, to: this.slug, type, note }
 *
 * This is the V2 source-of-truth file. Astro pages will read FROM this file
 * (via src/lib/graph.ts) instead of using Astro Content Collections.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const OUT_DIR = join(REPO_ROOT, "data");
const OUT_FILE = join(OUT_DIR, "graph.json");

async function main() {
  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );

  // Two-tier graph compaction:
  // - Always exclude nodes with `graph_hidden: true`
  // - If any node is marked `graph_featured: true`, export ONLY featured nodes
  //   (keeps the graph readable: one representative per company-year).
  let hasFeatured = false;
  for (const file of files) {
    const raw = await readFile(join(NODES_DIR, file), "utf-8");
    const { data: fm } = matter(raw);
    if (fm?.graph_featured) {
      hasFeatured = true;
      break;
    }
  }

  const nodes = [];
  const edges = [];

  for (const file of files) {
    const path = join(NODES_DIR, file);
    const raw = await readFile(path, "utf-8");
    const { data: frontmatter, content: bodyMd } = matter(raw);
    if (frontmatter.graph_hidden) continue;
    if (hasFeatured && !frontmatter.graph_featured) continue;

    // Capture all node fields, normalize date
    const node = {
      slug: frontmatter.slug,
      title: frontmatter.title,
      date:
        frontmatter.date instanceof Date
          ? frontmatter.date.toISOString().slice(0, 10)
          : String(frontmatter.date),
      era: frontmatter.era,
      category: frontmatter.category ?? [],
      authors: frontmatter.authors ?? [],
      org: frontmatter.org,
      breakthrough_score: frontmatter.breakthrough_score,
      status: frontmatter.status,
      model_spec: frontmatter.model_spec ?? null,
      public_view: frontmatter.public_view,
      citations: frontmatter.citations ?? [],
      body_md: bodyMd.trim(),
      _source_file: file, // provenance for round-trip / debugging
    };
    nodes.push(node);

    // Convert relationships → edges
    for (const rel of frontmatter.relationships ?? []) {
      edges.push({
        from: rel.to, // parent / source / older work
        to: frontmatter.slug, // current node / newer / dependent
        type: rel.type,
        note: rel.note ?? null,
      });
    }
  }

  // Sort nodes by date for deterministic output
  nodes.sort((a, b) => a.date.localeCompare(b.date));

  // Sanity checks
  const slugs = new Set(nodes.map((n) => n.slug));
  const dangling = edges.filter((e) => !slugs.has(e.from) || !slugs.has(e.to));
  if (dangling.length > 0) {
    console.warn(
      `⚠ ${dangling.length} edges reference unknown slugs:`,
      dangling.slice(0, 5),
    );
  }

  const years = nodes.map((n) => parseInt(n.date.slice(0, 4)));
  const out = {
    version: "0.2.0",
    schema_url: "https://github.com/SophieLiuYQ/ai-evolution-tree",
    generated_at: new Date().toISOString(),
    stats: {
      node_count: nodes.length,
      edge_count: edges.length,
      year_range: [Math.min(...years), Math.max(...years)],
      orgs: [...new Set(nodes.map((n) => n.org))].sort(),
      eras: [...new Set(nodes.map((n) => n.era))].sort(),
      edge_types: [...new Set(edges.map((e) => e.type))].sort(),
    },
    nodes,
    edges,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2));

  console.log(`✓ Wrote ${OUT_FILE}`);
  console.log(`  ${out.stats.node_count} nodes`);
  console.log(`  ${out.stats.edge_count} edges`);
  console.log(
    `  ${out.stats.year_range[0]}–${out.stats.year_range[1]} (${out.stats.year_range[1] - out.stats.year_range[0] + 1} years span)`,
  );
  console.log(`  ${out.stats.orgs.length} orgs · ${out.stats.eras.length} eras`);
  console.log(
    `  File size: ${((JSON.stringify(out).length / 1024).toFixed(1))} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
