#!/usr/bin/env node
/**
 * refresh-series-from-variants.mjs
 *
 * For "— Series" nodes, pick the best-performing variant node (from the
 * node's `model_spec.variants[].id` list) and:
 * - set the Series node's `model_spec.aa_url` to the best variant's AA page
 * - copy over parameters/context/modality I/O when available
 * - copy over the best variant's benchmark snapshot (best-performance view)
 *
 * Also patches known broken AA links for DeepSeek V4 preview nodes by mapping:
 *   deepseek-v4-pro   -> deepseek-v4-pro-high (if present)
 *   deepseek-v4-flash -> deepseek-v4-flash-high (if present)
 *
 * Usage:
 *   node scripts/refresh-series-from-variants.mjs --dry-run
 *   node scripts/refresh-series-from-variants.mjs
 *   node scripts/refresh-series-from-variants.mjs --slug=deepseek-v4
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ONE_SLUG = argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

const SERIES_RE = /—\s*series\b/i;

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

function parseNum(s) {
  if (s == null) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function intelligenceScore(spec) {
  const benches = spec?.benchmarks;
  if (!Array.isArray(benches)) return null;
  const row = benches.find((b) => /aa intelligence index/i.test(String(b?.name ?? "")));
  const v = row ? parseNum(row.score) : null;
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function firstAaUrlFromBench(spec) {
  const benches = spec?.benchmarks;
  if (!Array.isArray(benches)) return null;
  for (const b of benches) {
    const u = String(b?.source_url ?? "").trim();
    if (u.includes("artificialanalysis.ai/models/")) return u;
  }
  return null;
}

function pickBestVariant(variantSlugs, metaBySlug) {
  const candidates = variantSlugs
    .map((s) => ({ slug: s, node: metaBySlug.get(s) }))
    .filter((x) => !!x.node && !!x.node.fm?.model_spec);

  let best = null;
  for (const c of candidates) {
    const spec = c.node.fm.model_spec;
    const ii = intelligenceScore(spec);
    const score = ii ?? -Infinity;
    if (!best || score > best.score) best = { slug: c.slug, node: c.node, score };
  }
  return best;
}

async function loadAllNodes() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const bySlug = new Map();
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;
    bySlug.set(String(fm.slug), { path, fm, content });
  }
  return bySlug;
}

function patchDeepSeekPreviewAa(bySlug) {
  const map = [
    { slug: "deepseek-v4-pro", target: "deepseek-v4-pro-high" },
    { slug: "deepseek-v4-flash", target: "deepseek-v4-flash-high" },
  ];
  const touched = [];
  for (const { slug, target } of map) {
    const n = bySlug.get(slug);
    const t = bySlug.get(target);
    if (!n || !t) continue;
    const aa = t.fm?.model_spec?.aa_url ?? firstAaUrlFromBench(t.fm?.model_spec);
    if (!aa) continue;
    n.fm.model_spec ??= {};
    if (n.fm.model_spec.aa_url !== aa) {
      n.fm.model_spec.aa_url = aa;
      touched.push(slug);
    }
  }
  return touched;
}

async function main() {
  const bySlug = await loadAllNodes();
  const previewPatched = patchDeepSeekPreviewAa(bySlug);
  if (previewPatched.length) vlog("patched DeepSeek preview AA:", previewPatched.join(", "));

  let updated = 0;
  for (const [slug, node] of bySlug.entries()) {
    if (ONE_SLUG && slug !== ONE_SLUG) continue;
    const title = String(node.fm?.title ?? "");
    if (!SERIES_RE.test(title)) continue;

    const spec = node.fm?.model_spec;
    if (!spec) continue;
    const variantIds = Array.isArray(spec.variants) ? spec.variants.map((v) => String(v?.id ?? "")).filter(Boolean) : [];
    if (!variantIds.length) continue;

    const best = pickBestVariant(variantIds, bySlug);
    if (!best) continue;

    const bestSpec = best.node.fm.model_spec;
    const nextSpec = structuredClone(spec);

    // Prefer explicit aa_url on the best variant; fall back to its AA bench source.
    const bestAa = bestSpec.aa_url ?? firstAaUrlFromBench(bestSpec);
    if (bestAa) nextSpec.aa_url = bestAa;

    // Copy best-known technical fields from the best variant.
    for (const k of ["parameters", "context_window", "modalities", "modalities_in", "modalities_out", "hf_url", "github"]) {
      if (bestSpec?.[k] != null) nextSpec[k] = bestSpec[k];
    }

    // Best-performance benchmark snapshot: copy the variant's benches verbatim.
    if (Array.isArray(bestSpec?.benchmarks) && bestSpec.benchmarks.length) {
      nextSpec.benchmarks = bestSpec.benchmarks;
    }

    const changed = JSON.stringify(spec) !== JSON.stringify(nextSpec);
    if (!changed) continue;

    node.fm.model_spec = stripUndefinedDeep(nextSpec);
    updated++;
    vlog(`series ${slug}: best=${best.slug} ii=${best.score}`);
  }

  // Write back any changed nodes (including preview patches).
  let wrote = 0;
  for (const [slug, node] of bySlug.entries()) {
    if (ONE_SLUG && slug !== ONE_SLUG) continue;
    const rawNext = matter.stringify(node.content, stripUndefinedDeep(node.fm));
    if (rawNext === (await readFile(node.path, "utf-8"))) continue;
    wrote++;
    if (!DRY) await writeFile(node.path, rawNext, "utf-8");
  }

  console.log(`refresh-series-from-variants: ${wrote} ${DRY ? "would update" : "updated"} node(s).`);
  if (DRY) console.log("DRY RUN — drop --dry-run to commit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
