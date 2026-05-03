#!/usr/bin/env node
/**
 * audit-strong-claims.mjs
 *
 * Heuristic audit: find nodes whose `public_view.plain_english` (or zh)
 * contains strong/quantified claims that may require explicit citations.
 *
 * This does NOT prove a claim is wrong — it’s a review queue generator.
 *
 * Usage:
 *   node scripts/audit-strong-claims.mjs
 *   node scripts/audit-strong-claims.mjs --limit=50
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const ARG = {
  limit: Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || null,
};

const TRIGGERS = [
  /\bmost\b/i,
  /\bstate of the art\b/i,
  /\bsota\b/i,
  /\bin production\b/i,
  /\bbehind (most|many)\b/i,
  /\b\d+\s*(?:hours?|hr)\b/i,
  /\b\d+–\d+\s*(?:hours?|hr)\b/i,
  /\b\d+(\.\d+)?%\b/i,
  /\b\d+(\.\d+)?x\b/i,
  /\btop\s+\d+/i,
];

function hit(text) {
  if (!text || typeof text !== "string") return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const s = lines.join(" ");
  const matches = TRIGGERS.filter((re) => re.test(s)).map((re) => re.toString());
  if (!matches.length) return null;
  return { matches, sample: s.slice(0, 220) + (s.length > 220 ? "…" : "") };
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const out = [];
  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf8");
    const { data: fm } = matter(raw);
    const en = hit(fm?.public_view?.plain_english);
    const zh = hit(fm?.public_view_zh?.plain_english);
    if (!en && !zh) continue;
    out.push({
      slug: fm?.slug,
      file: f,
      en: en ? { matches: en.matches, sample: en.sample } : null,
      zh: zh ? { matches: zh.matches, sample: zh.sample } : null,
      citation_types: Array.isArray(fm?.citations) ? [...new Set(fm.citations.map((c) => c?.type).filter(Boolean))] : [],
    });
    if (ARG.limit && out.length >= ARG.limit) break;
  }

  console.log(`strong-claims audit: ${out.length} node(s) flagged`);
  for (const row of out) {
    console.log(`- ${row.slug}\t${row.file}\t[${row.citation_types.join(",")}]`);
    if (row.en) console.log(`  en: ${row.en.sample}`);
    if (row.zh) console.log(`  zh: ${row.zh.sample}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

