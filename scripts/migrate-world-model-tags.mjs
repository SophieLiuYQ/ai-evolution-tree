#!/usr/bin/env node
/**
 * migrate-world-model-tags.mjs
 *
 * Adds `world_model` to `category[]` for nodes that are clearly world models.
 * Heuristic-only, but conservative: only tags when "world model" appears in
 * the title or model_spec.architecture, or when the slug is a known world-model.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const ARG = { dryRun: argv.includes("--dry-run") };

const KNOWN = new Set([
  "genie-3",
]);

function stripUndefinedDeep(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(stripUndefinedDeep).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      const next = stripUndefinedDeep(val);
      if (next === undefined) continue;
      out[k] = next;
    }
    return out;
  }
  return v;
}

function shouldTag(fm) {
  const slug = String(fm.slug ?? "");
  if (KNOWN.has(slug)) return true;
  const title = String(fm.title ?? "").toLowerCase();
  if (title.includes("world model")) return true;
  const arch = String(fm.model_spec?.architecture ?? "").toLowerCase();
  if (arch.includes("world model")) return true;
  return false;
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let touched = 0;
  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;
    if (!shouldTag(fm)) continue;
    const cats = Array.isArray(fm.category) ? fm.category.map(String) : [];
    if (cats.includes("world_model")) continue;
    const next = { ...fm, category: [...cats, "world_model"] };
    touched++;
    if (!ARG.dryRun) {
      await writeFile(p, matter.stringify(content, stripUndefinedDeep(next)));
    }
  }
  console.log(`touched files: ${touched}`);
  if (ARG.dryRun) console.log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

