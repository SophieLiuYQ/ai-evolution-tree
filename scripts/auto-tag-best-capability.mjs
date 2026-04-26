#!/usr/bin/env node
/**
 * auto-tag-best-capability.mjs
 *
 * For collapsed "— Series" nodes, ensure the node's `category[]` includes
 * the model line's *best* capability (agents / code / reasoning / multimodal),
 * inferred from benchmark ranks (and falling back to modalities).
 *
 * Why: a "Series" node represents many SKUs; the graph should still place it
 * under the capability it excels at most, otherwise filters + alternative
 * matching become noisy.
 *
 * Usage:
 *   node scripts/auto-tag-best-capability.mjs --dry-run
 *   node scripts/auto-tag-best-capability.mjs
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
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");

const vlog = (...a) => VERBOSE && console.log(" ", ...a);

const SERIES_RE = /\bseries\b/i;

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

function parseRank(vs) {
  // "Rank #1 of 86 · Top (5%)" or "Rank #12 of 143"
  const m = String(vs || "").match(/Rank\s*#\s*(\d+)\s*of\s*(\d+)/i);
  if (!m) return null;
  return { rank: Number(m[1]), total: Number(m[2]) };
}

function benchToGroup(name) {
  const s = String(name || "").toLowerCase();
  if (s.includes("agentic") || s.includes("terminal-bench") || s.includes("tau") || s.includes("gdpval") || s.includes("apex agents")) {
    return "agents";
  }
  if (s.includes("code") || s.includes("scicode") || s.includes("humaneval") || s.includes("livecodebench") || s.includes("swe-bench")) {
    return "code";
  }
  if (s.includes("mmmu") || s.includes("multimodal") || s.includes("mathvista") || s.includes("vbench")) {
    return "multimodal";
  }
  if (s.includes("mmlu") || s.includes("gpqa") || s.includes("humanity") || s.includes("aime") || s.includes("math-")) {
    return "reasoning";
  }
  if (s.includes("intelligence")) return "reasoning";
  return null;
}

function inferBestCapability(fm) {
  const benches = fm?.model_spec?.benchmarks;
  const bestRankByGroup = new Map();
  if (Array.isArray(benches)) {
    for (const b of benches) {
      const g = benchToGroup(b?.name);
      if (!g) continue;
      const r = parseRank(b?.vs_baseline);
      if (!r) continue;
      const cur = bestRankByGroup.get(g);
      if (!cur || r.rank < cur.rank) bestRankByGroup.set(g, r);
    }
  }
  if (bestRankByGroup.size) {
    let best = null;
    for (const [g, r] of bestRankByGroup.entries()) {
      if (!best || r.rank < best.rank) best = { g, ...r };
    }
    return best?.g ?? null;
  }

  // Fallback: modalities imply capability buckets.
  const modsIn = fm?.model_spec?.modalities_in ?? fm?.model_spec?.modalities ?? [];
  const modsOut = fm?.model_spec?.modalities_out ?? fm?.model_spec?.modalities ?? [];
  const mods = new Set([...(Array.isArray(modsIn) ? modsIn : []), ...(Array.isArray(modsOut) ? modsOut : [])]
    .map((m) => String(m).toLowerCase()));
  if (mods.has("video")) return "video";
  if (mods.has("audio") || mods.has("speech")) return "audio";
  if (mods.has("image") || mods.has("vision")) return "cv";
  if (mods.has("text")) return "reasoning";
  return null;
}

function addTag(cats, tag) {
  const arr = Array.isArray(cats) ? [...cats] : [];
  if (!arr.includes(tag)) arr.push(tag);
  return arr;
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let touched = 0;

  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const { data: fm, content } = matter(raw);

    if (!SERIES_RE.test(String(fm?.title ?? ""))) continue;

    const best = inferBestCapability(fm);
    if (!best) continue;

    // Only add high-level capability tags used by the graph filters.
    const CAP_TAGS = new Set(["agents", "code", "reasoning", "multimodal", "audio", "video", "cv"]);
    if (!CAP_TAGS.has(best)) continue;

    const before = Array.isArray(fm.category) ? fm.category.slice() : [];
    const after = addTag(before, best);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;

    fm.category = after;
    touched++;
    vlog(`${fm.slug}: +${best}`);
    if (!DRY) {
      const out = matter.stringify(content, stripUndefinedDeep(fm));
      await writeFile(p, out);
    }
  }

  console.log(`auto-tag-best-capability: ${touched} ${DRY ? "would update" : "updated"} series nodes.`);
  if (DRY) console.log("DRY RUN — drop --dry-run to commit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

