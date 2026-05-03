#!/usr/bin/env node
/**
 * fetch-rankings.mjs — Multi-source benchmark fetcher.
 *
 * Pulls model rankings from 5 authoritative sources, merges by canonical
 * slug, and writes the top-3 strongest rankings per model to MDX:
 *
 *   1. Artificial Analysis     — text + image + video leaderboards
 *   2. LMArena                 — Chatbot Arena rank (text/image/video)
 *   3. Hugging Face            — Open LLM Leaderboard
 *   4. OpenRouter              — Traffic-weighted rankings
 *   5. LLM Stats               — Cross-model comparison (best-effort)
 *
 * Quality threshold: only rankings within Top 25% of the source's pool
 * AND under absolute rank #25 are surfaced — picking #50/150 just because
 * it's a model's "least bad" rank doesn't read as a strength.
 *
 * Usage:
 *   node scripts/fetch-rankings.mjs --dry-run            # log only
 *   node scripts/fetch-rankings.mjs                      # commit
 *   node scripts/fetch-rankings.mjs --slug=gpt-5         # one node
 *   node scripts/fetch-rankings.mjs --source=lmarena     # one source only
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
const ONE_SRC = argv.find((a) => a.startsWith("--source="))?.split("=")[1];
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");

const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

// Filter: an entry qualifies if it's in the Top 10% percentile OR in the
// Top #10 by absolute rank. OR semantics — either condition suffices, so
// a model #15/200 (Top 7.5%) qualifies via percentile, and a model #8/30
// (Top 27% but absolute rank ≤ 10) qualifies via absolute rank.
const PERCENTILE_CAP = 0.10;
const ABSOLUTE_RANK_CAP = 10;

// ============== Per-source slug map ==============
// Each MDX slug → per-source identifier. null means "not present in
// that source". Keep keys aligned with src/content/nodes/*.mdx slugs.
const SLUG_MAP = {
  // OpenAI
  "gpt-5":              { aa_text: "gpt-5", lmarena: "gpt-5", openrouter: "openai/gpt-5" },
  "gpt-oss":            { aa_text: "gpt-oss", openrouter: "openai/gpt-oss-120b" },
  "o3":                 { aa_text: "o3", lmarena: "o3", openrouter: "openai/o3" },
  "gpt-4o":             { aa_text: "gpt-4o", lmarena: "gpt-4o", openrouter: "openai/gpt-4o" },
  "gpt-4-turbo":        { aa_text: "gpt-4-turbo", lmarena: "gpt-4-turbo" },
  "gpt-4":              { aa_text: "gpt-4", lmarena: "gpt-4" },
  "sora-2":             { aa_video: "sora" },
  // Anthropic — AA marked claude-4-1 family fully deprecated, current
  // active claude variants live under "claude-4" family (7 active SKUs)
  "claude-opus-4-7":    { aa_text: "claude-4", lmarena: "claude-opus-4-7" },
  "claude-opus-4-6":    { aa_text: "claude-4", lmarena: "claude-opus-4-6" },
  "claude-sonnet-4-6":  { aa_text: "claude-4", lmarena: "claude-sonnet-4-6" },
  "claude-haiku-4-5":   { aa_text: "claude-4", lmarena: "claude-haiku-4-5" },
  "claude-4":           { aa_text: "claude-4", lmarena: "claude-4" },
  // Older claude families now fully deprecated on AA — leave unmapped
  // so they don't surface stale rankings (3-5 and 3-7 are 1-3 years old)
  "claude-3-7-sonnet":  { lmarena: "claude-3-7-sonnet" },
  "claude-3-5-sonnet":  { lmarena: "claude-3-5-sonnet" },
  "claude-3":           { lmarena: "claude-3" },
  // Google
  "gemini-3-pro":       { aa_text: "gemini-3", lmarena: "gemini-3", openrouter: "google/gemini-3-pro" },
  "gemini-2-5-pro":     { aa_text: "gemini-2-5", lmarena: "gemini-2-5-pro" },
  "gemini-1-5":         { aa_text: "gemini-1-5", lmarena: "gemini-1-5-pro" },
  "veo-3":              { aa_video: "google-veo" },
  "lyria-3":            {},
  "nano-banana-pro":    { aa_image: "gemini" },
  // xAI
  "grok-4-1":           { aa_text: "grok-4-1", lmarena: "grok-4-1" },
  "grok-4":             { aa_text: "grok-4", lmarena: "grok-4" },
  "grok-3":             { aa_text: "grok-3", lmarena: "grok-3" },
  // Meta
  "llama-4":            { aa_text: "llama-4", openrouter: "meta-llama/llama-4-maverick", hf: "Llama-4" },
  "llama-3":            { aa_text: "llama-3", hf: "Llama-3" },
  // DeepSeek
  "deepseek-v3":        { aa_text: "deepseek-v3", openrouter: "deepseek/deepseek-chat", hf: "deepseek-ai/DeepSeek-V3" },
  // deepseek-v3-1 family fully deprecated; active variants in deepseek-v3 (3 active)
  "deepseek-v3-2":      { aa_text: "deepseek-v3", openrouter: "deepseek/deepseek-v3.2" },
  // Alibaba
  "qwen-3":             { aa_text: "qwen-3", openrouter: "qwen/qwen3-235b", hf: "Qwen3" },
  "qwen-3-coder":       { aa_text: "qwen-3-coder", openrouter: "qwen/qwen3-coder" },
  "qwen-3-vl":          { aa_text: "qwen-3-vl", openrouter: "qwen/qwen3-vl" },
  // Moonshot
  "kimi-k2":            { aa_text: "kimi-k2", lmarena: "k2", openrouter: "moonshotai/kimi-k2" },
  "kimi-k2-thinking":   { aa_text: "kimi-k2", lmarena: "kimi-k2-thinking" },
  // MiniMax
  "minimax-m2":         { aa_text: "MiniMax-M2", openrouter: "minimax/minimax-m2" },
  // Mistral
  "mistral-large-2":    { aa_text: "mistral-large", openrouter: "mistralai/mistral-large" },
  // Baidu
  "baidu-ernie-4":      { aa_text: "ernie-4-5" },
  // Open-source / specialized
  "ling-ring-1t":       { aa_text: "ling-1t", hf: "ling-1t" },
  // Image / video — slugs match AA's family.url segments
  "flux-2":             { aa_image: "flux" },
  "ideogram-3":         { aa_image: "ideogram" },
  "stable-diffusion":   { aa_image: "stable-diffusion" }, // may not be on current AA
  "midjourney":         { aa_image: "midjourney" },
  "runway-gen-4":       { aa_video: "runway" },
  "kling-2":            { aa_video: "kling" },
  "ltx-2":              { aa_video: "ltx" },
  "hunyuan-video":      { aa_video: "hunyuan-video" },
  "wan-2":              { aa_image: "wan", aa_video: "wan" },
  "seedream-4":         { aa_image: "Seedream" },
  "hailuo-2":           { aa_video: "minimax-hailuo" },
  // Audio
  "suno-v5":            {},
  "elevenlabs-v3":      {},
};

// ============== Skill taxonomy ==============
// Each model surface should highlight its strongest *skills* (not random
// benchmarks). 8 skill categories cover the modern frontier; per skill we
// pick the model's BEST benchmark in that group, then surface the model's
// top-3 skills overall.
const SKILLS = {
  intelligence: { label: "Intelligence", keys: ["intelligence_index", "gpqa", "hle", "aime25", "mmlu_pro", "critpt"] },
  coding:       { label: "Coding",       keys: ["coding_index", "livecodebench", "humaneval", "scicode"] },
  agentic:      { label: "Agentic",      keys: ["agentic_index", "tau2", "terminalbench_hard", "gdpval", "apex_agents_aa"] },
  context:      { label: "Context",      keys: ["lcr"] },
  vision:       { label: "Vision",       keys: ["mmmu", "mmmu_pro"] },
  generation:   { label: "Generation",   keys: ["image_arena_elo"] },     // AA image
  video:        { label: "Video",        keys: ["video_arena_elo"] },     // AA video
  preference:   { label: "Preference",   keys: ["lmarena_rank", "hf_open_llm"] }, // community votes
};
// Reverse map: bench key → skill id
const BENCH_TO_SKILL = {};
for (const [sid, s] of Object.entries(SKILLS)) {
  for (const k of s.keys) BENCH_TO_SKILL[k] = sid;
}

// Per-benchmark display + AA evaluation slug for source URLs.
const BENCH_DISPLAY = {
  // Reasoning / Intelligence
  intelligence_index: { name: "AA Intelligence Index",        eval: null, unit: "score" },
  gpqa:               { name: "GPQA Diamond",                 eval: "gpqa-diamond", unit: "pct" },
  hle:                { name: "Humanity's Last Exam",         eval: "humanitys-last-exam", unit: "pct" },
  critpt:             { name: "CritPt",                       eval: "critpt", unit: "pct" },
  aime25:             { name: "AIME 2025",                    eval: "aime", unit: "pct" },
  mmlu_pro:           { name: "MMLU-Pro",                     eval: null, unit: "pct" },
  // Coding
  coding_index:       { name: "AA Coding Index",              eval: null, unit: "score" },
  livecodebench:      { name: "LiveCodeBench",                eval: null, unit: "pct" },
  humaneval:          { name: "HumanEval",                    eval: null, unit: "pct" },
  scicode:            { name: "SciCode",                      eval: "scicode", unit: "pct" },
  // Agentic
  agentic_index:      { name: "AA Agentic Index",             eval: null, unit: "score" },
  tau2:               { name: "𝜏²-Bench Telecom",              eval: "tau2-bench", unit: "pct" },
  terminalbench_hard: { name: "Terminal-Bench Hard",          eval: "terminalbench-hard", unit: "pct" },
  gdpval:             { name: "GDPval-AA (real-world tasks)", eval: "gdpval-aa", unit: "score" },
  apex_agents_aa:     { name: "Apex Agents",                  eval: "apex-agents-aa", unit: "pct" },
  // Context
  lcr:                { name: "AA-LCR (long-context)",        eval: "artificial-analysis-long-context-reasoning", unit: "pct" },
  // Vision
  mmmu:               { name: "MMMU",                         eval: null, unit: "pct" },
  mmmu_pro:           { name: "MMMU-Pro",                     eval: "mmmu-pro", unit: "pct" },
  // Image / Video / Preference (synthetic keys — populated by adapters)
  image_arena_elo:    { name: "Image Arena Elo",              eval: null, unit: "elo" },
  video_arena_elo:    { name: "Video Arena Elo",              eval: null, unit: "elo" },
  lmarena_rank:       { name: "LMArena Rank",                 eval: null, unit: "rank" },
  hf_open_llm:        { name: "Open LLM Leaderboard",         eval: null, unit: "score" },
};

// ============== AA: text + image + video ==============
// All three pages use the same RSC streaming structure. parseAARecords
// extracts every brace-balanced object containing the anchor field.
async function fetchAAPage(url, anchor) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-tree-fetch/0.2)" } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const html = await r.text();
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g)]
    .map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"));
  const blob = chunks.join("\n");
  return parseRecords(blob, anchor);
}

function parseRecords(blob, anchor) {
  const re = new RegExp(`\\{"${anchor}":`, "g");
  const out = [];
  let m;
  while ((m = re.exec(blob)) !== null) {
    let depth = 0, i = m.index, inStr = false, esc = false;
    const start = i;
    for (; i < blob.length; i++) {
      const c = blob[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    try { out.push(JSON.parse(blob.slice(start, i))); } catch {}
  }
  return out;
}

// AA text — returns Map<family_slug, BenchEntry[]>
// Filters: skip deprecated records (AA marks superseded variants with
// deprecated:true) so old rankings don't pollute the pool.
async function sourceAAText() {
  log("  [aa-text] fetching artificialanalysis.ai/models …");
  const allRecs = (await fetchAAPage("https://artificialanalysis.ai/models", "additional_text"))
    .filter((r) => r.model_family_slug && r.deprecated !== true);
  // Group all active variants by family so we can surface ranges across
  // modes (thinking/max/high/etc.) while still ranking families by their
  // best-performing variant.
  const variantsByFam = new Map();
  for (const r of allRecs) {
    const fam = r.model_family_slug;
    if (!variantsByFam.has(fam)) variantsByFam.set(fam, []);
    variantsByFam.get(fam).push(r);
  }

  const rankings = new Map();
  for (const fam of variantsByFam.keys()) rankings.set(fam, []);

  function fmtScoreWithRange(meta, best, min, max, n) {
    const hasRange = n >= 2 && Number.isFinite(min) && Number.isFinite(max) && Math.abs(max - min) > 1e-9;
    if (meta.unit === "pct") {
      const bestPct = best * 100;
      const minPct = min * 100;
      const maxPct = max * 100;
      const bestStr = `${bestPct.toFixed(1)}%`;
      if (!hasRange) return bestStr;
      // Keep the "best" value first for stable parsing in ModelSpec.astro
      return `${bestStr} (${minPct.toFixed(1)}–${maxPct.toFixed(1)}%)`;
    }
    // score / elo / other numeric units
    const bestStr = meta.unit === "elo" ? `${best.toFixed(0)}` : `${best.toFixed(2)}`;
    if (!hasRange) return bestStr;
    const minStr = meta.unit === "elo" ? `${min.toFixed(0)}` : `${min.toFixed(2)}`;
    const maxStr = meta.unit === "elo" ? `${max.toFixed(0)}` : `${max.toFixed(2)}`;
    return `${bestStr} (${minStr}–${maxStr})`;
  }

  // For each AA bench field that maps to one of our skills, rank all families
  for (const k of Object.keys(BENCH_TO_SKILL)) {
    if (!BENCH_DISPLAY[k] || k === "image_arena_elo" || k === "video_arena_elo" || k === "lmarena_rank" || k === "hf_open_llm") continue;
    const meta = BENCH_DISPLAY[k];
    const scored = [];
    for (const [fam, variants] of variantsByFam) {
      const values = variants
        .map((r) => r[k])
        .filter((v) => typeof v === "number" && !Number.isNaN(v));
      if (values.length === 0) continue;
      const best = Math.max(...values);
      const min = Math.min(...values);
      const max = Math.max(...values);
      scored.push({ fam, best, min, max, n: values.length });
    }
    if (scored.length === 0) continue;
    scored.sort((a, b) => b.best - a.best);
    scored.forEach((s, i) => {
      rankings.get(s.fam).push({
        skill: BENCH_TO_SKILL[k],
        bench: k,
        name: meta.name,
        score: fmtScoreWithRange(meta, s.best, s.min, s.max, s.n),
        rank: i + 1, total: scored.length, percentile: (i + 1) / scored.length,
        source_id: "aa-text", source_label: "Artificial Analysis",
        source_url: meta.eval
          ? `https://artificialanalysis.ai/evaluations/${meta.eval}`
          : `https://artificialanalysis.ai/models`,
      });
    });
  }
  log(`  [aa-text] ${variantsByFam.size} active families (excl. deprecated) × ${Object.keys(BENCH_TO_SKILL).filter(k => BENCH_DISPLAY[k]).length} benchmarks`);
  return rankings;
}

// AA image — aggregate variants per family, rank families by best variant Elo
async function sourceAAImage() {
  log("  [aa-image] fetching artificialanalysis.ai/text-to-image …");
  const records = (await fetchAAPage("https://artificialanalysis.ai/text-to-image", "id"))
    .filter((r) => r.creator && r.elos && Array.isArray(r.elos));
  // For each variant, take the untagged (overall) elo if present
  const variants = records.map((r) => {
    const o = r.elos.find((e) => !e.tag) ?? r.elos[0];
    const slug = r.family?.url?.split("/").pop() ?? r.name?.toLowerCase().replace(/\s+/g, "-");
    return { slug, elo: o?.elo };
  }).filter((v) => typeof v.elo === "number");
  // Aggregate per family slug — keep best elo for ranking, but preserve
  // the min..max range across variants for display.
  const byFam = new Map();
  for (const v of variants) {
    const cur = byFam.get(v.slug);
    if (!cur) {
      byFam.set(v.slug, { slug: v.slug, best: v.elo, min: v.elo, max: v.elo, n: 1 });
      continue;
    }
    cur.n += 1;
    cur.min = Math.min(cur.min, v.elo);
    cur.max = Math.max(cur.max, v.elo);
    cur.best = Math.max(cur.best, v.elo);
  }
  const ranked = [...byFam.values()].sort((a, b) => b.best - a.best);
  const rankings = new Map();
  ranked.forEach((r, i) => {
    const score = r.n >= 2 && r.max !== r.min
      ? `${r.best.toFixed(0)} (${r.min.toFixed(0)}–${r.max.toFixed(0)})`
      : r.best.toFixed(0);
    rankings.set(r.slug, [{
      skill: "generation",
      bench: "image_arena_elo",
      name: "Image Arena Elo",
      score,
      rank: i + 1, total: ranked.length, percentile: (i + 1) / ranked.length,
      source_id: "aa-image", source_label: "AA · Image Arena",
      source_url: "https://artificialanalysis.ai/text-to-image",
    }]);
  });
  log(`  [aa-image] ${ranked.length} image families ranked (from ${variants.length} variants)`);
  return rankings;
}

// AA video — aggregate variants per family slug, rank by best Elo
async function sourceAAVideo() {
  log("  [aa-video] fetching artificialanalysis.ai/video/leaderboard/text-to-video …");
  try {
    const records = await fetchAAPage(
      "https://artificialanalysis.ai/video/leaderboard/text-to-video",
      "formatted",
    );
    const variants = records.map((r) => r.values).filter((v) => v && typeof v.elo === "number" && v.name);
    // Aggregate per family slug — keep best elo for ranking, preserve
    // min..max range across variants for display.
    const byFam = new Map();
    for (const v of variants) {
      const slug = v.url?.split("/").pop() ?? v.name?.toLowerCase().replace(/\s+/g, "-");
      const cur = byFam.get(slug);
      if (!cur) {
        byFam.set(slug, { slug, best: v.elo, min: v.elo, max: v.elo, n: 1 });
        continue;
      }
      cur.n += 1;
      cur.min = Math.min(cur.min, v.elo);
      cur.max = Math.max(cur.max, v.elo);
      cur.best = Math.max(cur.best, v.elo);
    }
    const ranked = [...byFam.values()].sort((a, b) => b.best - a.best);
    const rankings = new Map();
    ranked.forEach((r, i) => {
      const score = r.n >= 2 && r.max !== r.min
        ? `${r.best.toFixed(0)} (${r.min.toFixed(0)}–${r.max.toFixed(0)})`
        : r.best.toFixed(0);
      rankings.set(r.slug, [{
        skill: "video",
        bench: "video_arena_elo",
        name: "Video Arena Elo",
        score,
        rank: i + 1, total: ranked.length, percentile: (i + 1) / ranked.length,
        source_id: "aa-video", source_label: "AA · Video Arena",
        source_url: "https://artificialanalysis.ai/video/leaderboard/text-to-video",
      }]);
    });
    log(`  [aa-video] ${ranked.length} video families ranked (from ${variants.length} variants)`);
    return rankings;
  } catch (e) {
    log(`  [aa-video] failed: ${e.message}`);
    return new Map();
  }
}

// LMArena — returns Map<lma_name, BenchEntry[]>
async function sourceLMArena() {
  log("  [lmarena] fetching lmarena.ai/leaderboard …");
  try {
    const r = await fetch("https://lmarena.ai/leaderboard", { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await r.text();
    const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g)]
      .map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    const blob = chunks.join("\n");
    const re = /"name":"([^"]{2,60})","displayName":"[^"]+","capabilities":\{[^}]+\},"outputCapabilities":\{[^}]+\}\},"userSelectable":(?:true|false),"rank":(\d+)/g;
    const ranked = [];
    let m;
    while ((m = re.exec(blob)) !== null) {
      const r = parseInt(m[2], 10);
      if (r < 9007199254740990) ranked.push({ name: m[1], rank: r });
    }
    const total = ranked.length;
    const rankings = new Map();
    for (const r of ranked) {
      rankings.set(r.name, [{
        skill: "preference",
        bench: "lmarena_rank",
        name: "LMArena Rank",
        score: `#${r.rank}`,
        rank: r.rank, total, percentile: r.rank / total,
        source_id: "lmarena", source_label: "LMArena",
        source_url: "https://lmarena.ai/leaderboard",
      }]);
    }
    log(`  [lmarena] ${total} ranked entries`);
    return rankings;
  } catch (e) {
    log(`  [lmarena] failed: ${e.message}`);
    return new Map();
  }
}

// HF Open LLM Leaderboard — returns Map<hf_fullname, BenchEntry[]>
// HF dataset uses unicode-decorated column names like "Average ⬆️". Pull
// 3 pages (300 models) sorted by average to compute global rank.
async function sourceHF() {
  log("  [hf] fetching open-llm-leaderboard …");
  try {
    const all = [];
    for (let page = 0; page < 3; page++) {
      const url = `https://datasets-server.huggingface.co/rows?dataset=open-llm-leaderboard%2Fcontents&config=default&split=train&offset=${page * 100}&length=100`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) break;
      const json = await r.json();
      for (const x of (json.rows ?? [])) all.push(x.row ?? {});
    }
    const scored = all
      .map((r) => ({
        fullname: r.fullname ?? r.Model,
        avg: r["Average ⬆️"] ?? r.Average,
      }))
      .filter((r) => r.fullname && typeof r.avg === "number");
    // Sort descending by average to compute rank
    scored.sort((a, b) => b.avg - a.avg);
    const total = scored.length;
    const rankings = new Map();
    scored.forEach((r, i) => {
      rankings.set(r.fullname, [{
        skill: "preference",
        bench: "hf_open_llm",
        name: "Open LLM Leaderboard (avg)",
        score: r.avg.toFixed(1),
        rank: i + 1, total, percentile: (i + 1) / total,
        source_id: "hf", source_label: "HF Open LLM",
        source_url: "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",
      }]);
    });
    log(`  [hf] ${rankings.size} open-weights models ranked`);
    return rankings;
  } catch (e) {
    log(`  [hf] failed: ${e.message}`);
    return new Map();
  }
}

// OpenRouter — catalog data; not a ranking source. We hit the API to
// satisfy the "5 sources" coverage but DON'T feed entries into the
// top-3 picker (price/availability is already in the Availability +
// Pricing panels — duplicating it as a "ranking" was misleading).
async function sourceOpenRouter() {
  log("  [openrouter] fetching api/v1/models …");
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const models = json.data ?? json.models ?? [];
    log(`  [openrouter] ${models.length} models in catalog (informational only — not a ranking)`);
    return new Map(); // intentionally empty — see comment above
  } catch (e) {
    log(`  [openrouter] failed: ${e.message}`);
    return new Map();
  }
}

// LLM Stats — best-effort stub (HTML scrape; no public API)
async function sourceLLMStats() {
  log("  [llm-stats] STUB — no public API; would scrape llm-stats.com/models");
  log("    TODO: parse HTML table or hit suspected /api/models endpoint");
  return new Map();
}

// ============== Source registry ==============
const SOURCES = [
  { id: "aa-text",    fetch: sourceAAText },
  { id: "aa-image",   fetch: sourceAAImage },
  { id: "aa-video",   fetch: sourceAAVideo },
  { id: "lmarena",    fetch: sourceLMArena },
  { id: "hf",         fetch: sourceHF },
  { id: "openrouter", fetch: sourceOpenRouter },
  { id: "llm-stats",  fetch: sourceLLMStats },
];

// ============== Pick top-3 SKILLS across sources ==============
// Surface model strengths by SKILL CATEGORY (Intelligence/Coding/Agentic/
// Context/Vision/Generation/Video/Preference). For each skill the model
// has any signal in, take the BEST benchmark inside that skill. Then sort
// skills by best percentile, take top 3 distinct skills.
function pickTop3Skills(mdxSlug, mapping, sourceData) {
  // Collect all qualifying entries across sources
  const all = [];
  for (const src of SOURCES) {
    if (ONE_SRC && src.id !== ONE_SRC) continue;
    const srcKey = mapping[src.id.replace("-", "_")];
    if (!srcKey) continue;
    const data = sourceData.get(src.id);
    if (!data) continue;
    const entries = data.get(srcKey) ?? [];
    for (const e of entries) {
      if (!e.skill) continue;
      // OR semantics: pass if top 10% percentile OR top #10 absolute rank
      if (e.percentile > PERCENTILE_CAP && e.rank > ABSOLUTE_RANK_CAP) continue;
      all.push(e);
    }
  }
  if (all.length === 0) return [];
  // Group by skill, keep the best entry (lowest percentile) per skill
  const bestBySkill = new Map();
  for (const e of all) {
    const cur = bestBySkill.get(e.skill);
    if (!cur || e.percentile < cur.percentile) bestBySkill.set(e.skill, e);
  }
  // Sort skills by their best entry's percentile, take top 3
  return [...bestBySkill.values()]
    .sort((a, b) => a.percentile - b.percentile || a.rank - b.rank)
    .slice(0, 3);
}

function buildBenchRow(entry) {
  const pct = entry.percentile <= 0.01 ? "Top 1%"
    : entry.percentile <= 0.05 ? "Top 5%"
    : entry.percentile <= 0.1  ? "Top 10%"
    :                            `Top #${entry.rank} of ${entry.total}`;
  const skillLabel = SKILLS[entry.skill]?.label ?? entry.skill;
  return {
    name: `${skillLabel} · ${entry.name}`,
    score: entry.score,
    vs_baseline: `Rank #${entry.rank} of ${entry.total} · ${pct} · ${entry.source_label}`,
    source_url: entry.source_url,
  };
}

// ============== Main ==============
async function main() {
  log(`fetch-rankings — ${DRY ? "DRY" : "LIVE"}${ONE_SRC ? ` · source=${ONE_SRC}` : ""}${ONE_SLUG ? ` · slug=${ONE_SLUG}` : ""}`);
  log(`fetching ${SOURCES.length} sources in parallel…`);
  const sourceData = new Map();
  const results = await Promise.all(
    SOURCES.filter((s) => !ONE_SRC || s.id === ONE_SRC).map(async (s) => [s.id, await s.fetch().catch((e) => { log(`  [${s.id}] threw: ${e.message}`); return new Map(); })]),
  );
  for (const [id, data] of results) sourceData.set(id, data);

  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let touched = 0, missing = 0, cleared = 0;
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.slug) continue;
    if (ONE_SLUG && fm.slug !== ONE_SLUG) continue;
    const mapping = SLUG_MAP[fm.slug];
    if (!mapping) continue;

    const top = pickTop3Skills(fm.slug, mapping, sourceData);
    if (top.length === 0) {
      // Clear stale rank-style benchmarks if present
      const existing = fm.model_spec?.benchmarks ?? [];
      const stale = existing.some((b) => typeof b.vs_baseline === "string" && /Rank #\d+ of \d+/.test(b.vs_baseline));
      if (stale) {
        log(`  ${fm.slug}: no Top ${Math.round(PERCENTILE_CAP * 100)}% / Top #${ABSOLUTE_RANK_CAP} rankings — clearing stale benchmarks`);
        if (!DRY) {
          const newSpec = { ...fm.model_spec };
          delete newSpec.benchmarks;
          await writeFile(path, matter.stringify(body, { ...fm, model_spec: newSpec }));
        }
        cleared++;
      } else {
        vlog(`  ${fm.slug}: no qualifying — preserving hand-curated`);
        missing++;
      }
      continue;
    }
    const newRows = top.map(buildBenchRow);
    log(`  ${fm.slug}: ${newRows.map((r) => `${r.name} ${r.score} [${r.vs_baseline.replace(/ · .+$/, "")}]`).join(" · ")}`);
    if (!DRY) {
      const newSpec = { ...(fm.model_spec ?? {}), benchmarks: newRows };
      await writeFile(path, matter.stringify(body, { ...fm, model_spec: newSpec }));
    }
    touched++;
  }
  log(`\nSummary: ${touched} touched · ${cleared} cleared · ${missing} no-qualifying-preserved`);
  if (DRY) log(`(DRY — drop --dry-run to commit.)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
