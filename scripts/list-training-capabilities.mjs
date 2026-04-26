#!/usr/bin/env node
/**
 * List nodes whose frontmatter category[] includes "training".
 *
 * Usage:
 *   node scripts/list-training-capabilities.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const files = (await readdir(NODES_DIR))
  .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
  .sort();

const hits = [];
for (const f of files) {
  const p = join(NODES_DIR, f);
  const raw = await readFile(p, "utf-8");
  const { data: fm } = matter(raw);
  const cats = Array.isArray(fm?.category) ? fm.category.map((x) => String(x)) : [];
  if (!cats.includes("training")) continue;
  hits.push({ slug: String(fm.slug ?? ""), title: String(fm.title ?? ""), file: f });
}

for (const h of hits) {
  console.log(`${h.slug}\t${h.title}\t${h.file}`);
}
console.log(`\nTotal: ${hits.length}`);

