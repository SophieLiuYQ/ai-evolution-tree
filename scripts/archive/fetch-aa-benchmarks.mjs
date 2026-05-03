#!/usr/bin/env node
/**
 * fetch-aa-benchmarks.mjs — Pull top-3 ranked benchmarks per model from
 * Artificial Analysis (https://artificialanalysis.ai/) and write them
 * into model_spec.benchmarks of each MDX node.
 *
 * Strategy:
 *   1. Fetch /models page once (7MB embedded RSC payload — contains full
 *      benchmark data for ~470 model variants)
 *   2. Parse all rich records via brace-balanced JSON.parse (regex anchor
 *      on `{"additional_text":` which uniquely opens each record)
 *   3. Collapse variants → one record per model_family_slug (pick the
 *      record with highest intelligence_index = best variant in family)
 *   4. Compute ranking per benchmark field across all families
 *   5. For each of OUR MDX nodes, look up the matching AA family slug
 *      (manual map below), find its 3 best ranks, write to frontmatter
 *
 * Each emitted benchmark row carries:
 *   - name: display name
 *   - score: "82.3%" (or numeric for non-pct indices)
 *   - vs_baseline: "Rank #N of M"
 *   - source_url: link to the specific evaluation page on AA
 *
 * Usage:
 *   node scripts/fetch-aa-benchmarks.mjs --dry-run       # log only
 *   node scripts/fetch-aa-benchmarks.mjs                 # commit
 *   node scripts/fetch-aa-benchmarks.mjs --slug=gpt-5    # one node
 *   node scripts/fetch-aa-benchmarks.mjs --force         # overwrite
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const AA_URL = "https://artificialanalysis.ai/models";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FORCE = argv.includes("--force");
const ONE_SLUG = argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");

const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

// ============== Benchmark display + source mapping ==============
// AA's internal field name → human-readable name + evaluation page slug.
// `unit` is "pct" for fractional values 0-1 (multiply ×100 + "%"),
// "score" for raw indices like intelligence_index, or "ratio" for x faster.
//
// Coverage spans reasoning · math · code · agentic · long-context ·
// knowledge · multimodal — so different model strengths surface in
// the right category (a coding model lights up on LiveCodeBench/SciCode,
// an agentic model lights up on Tau²-Bench/Terminal-Bench/GDPval).
// Benchmark name convention: prefixed with category ("Intelligence · ",
// "Coding · ", "Agentic · ") so the detail-page lookups (which key by the
// prefixed form) can find them. Keep this aligned with the lookup strings
// in src/pages/node/[slug].astro near `aaIntRank`/`speedRank`/etc.
const BENCH_META = {
  // Reasoning
  aime:                 { name: "Reasoning · AIME 2024",                  unit: "pct",   eval: "aime" },
  aime25:               { name: "Reasoning · AIME 2025",                  unit: "pct",   eval: "aime" },
  gpqa:                 { name: "Reasoning · GPQA Diamond",               unit: "pct",   eval: "gpqa-diamond" },
  hle:                  { name: "Reasoning · Humanity's Last Exam",       unit: "pct",   eval: "humanitys-last-exam" },
  critpt:               { name: "Reasoning · CritPt (graduate physics)",  unit: "pct",   eval: "critpt" },
  // Math
  math_500:             { name: "Math · MATH-500",                        unit: "pct",   eval: null },
  math_index:           { name: "Math · AA Math Index",                   unit: "score", eval: null },
  // Coding
  humaneval:            { name: "Coding · HumanEval",                     unit: "pct",   eval: null },
  livecodebench:        { name: "Coding · LiveCodeBench",                 unit: "pct",   eval: null },
  scicode:              { name: "Coding · SciCode",                       unit: "pct",   eval: "scicode" },
  coding_index:         { name: "Coding · AA Coding Index",               unit: "score", eval: null },
  // Agentic / tool use / real-world tasks
  tau2:                 { name: "Agentic · 𝜏²-Bench Telecom",              unit: "pct",   eval: "tau2-bench" },
  terminalbench_hard:   { name: "Agentic · Terminal-Bench Hard",          unit: "pct",   eval: "terminalbench-hard" },
  gdpval:               { name: "Agentic · GDPval-AA (real-world tasks)", unit: "score", eval: "gdpval-aa" },
  agentic_index:        { name: "Agentic · AA Agentic Index",             unit: "score", eval: null },
  apex_agents_aa:       { name: "Agentic · Apex Agents",                  unit: "pct",   eval: "apex-agents-aa" },
  // Long context
  lcr:                  { name: "Long-context · AA-LCR",                  unit: "pct",   eval: "artificial-analysis-long-context-reasoning" },
  // Knowledge / instruction following
  mmlu_pro:             { name: "Knowledge · MMLU-Pro",                   unit: "pct",   eval: null },
  ifbench:              { name: "Instruction · IFBench",                  unit: "pct",   eval: "ifbench" },
  omniscience:          { name: "Knowledge · AA-Omniscience",             unit: "score", eval: "omniscience" },
  // Multimodal
  mmmu:                 { name: "Vision · MMMU",                          unit: "pct",   eval: null },
  mmmu_pro:             { name: "Vision · MMMU-Pro",                      unit: "pct",   eval: "mmmu-pro" },
  // Composite indices
  intelligence_index:   { name: "Intelligence · AA Intelligence Index",   unit: "score", eval: null },
  // Multilingual
  multilingual_index:   { name: "Multilingual · AA Multilingual Index",   unit: "score", eval: null },
};
const BENCH_KEYS = Object.keys(BENCH_META);

// Quality threshold — only include benchmarks where the model ranks in
// the top PERCENTILE_CAP fraction of the pool. A #50/150 rank (33%) is
// honest but doesn't read as a strength; capping at 25% means we only
// surface benchmarks where the model is genuinely competitive. Lowering
// this further (e.g. 0.15) makes the panel "this model's specialties
// only" rather than "this model's three best showings".
const PERCENTILE_CAP = 0.25;
// Hard rank cap — even in tiny pools, ranks worse than this aren't shown.
const ABSOLUTE_RANK_CAP = 25;

// ============== Our slug → AA family_slug mapping ==============
// AA's family slug != our MDX slug. e.g. our "claude-opus-4-7" doesn't
// exist on AA yet (their newest is "claude-4-1"). Map only nodes where
// AA has comparable data; everything else gets skipped silently.
const SLUG_MAP = {
  // OpenAI
  "gpt-5":              "gpt-5",
  "gpt-oss":            "gpt-oss",
  "o3":                 "o3",
  "gpt-4o":             "gpt-4o",
  "gpt-4-turbo":        "gpt-4-turbo",
  "gpt-4":              "gpt-4",
  // Anthropic — see VARIANT_MAP below; these models need per-variant
  // name matching because they all live under AA's `claude-4` family
  // slug but score very differently. The SLUG_MAP entries here only
  // serve as a fallback if VARIANT_MAP doesn't match.
  "claude-opus-4-7":    "claude-4",
  "claude-opus-4-6":    "claude-4",
  "claude-sonnet-4-6":  "claude-4",
  "claude-haiku-4-5":   "claude-4",
  "claude-4":           "claude-4-1",
  "claude-3-7-sonnet":  "claude-3-7",
  "claude-3-5-sonnet":  "claude-3-5",
  "claude-3":           "claude-3",
  // Google
  "gemini-3-pro":       "gemini-3",
  "gemini-2-5-pro":     "gemini-2-5",
  "gemini-1-5":         "gemini-1-5",
  "gemini-1":           "gemini-1",
  // xAI
  "grok-4-1":           "grok-4-1",
  "grok-4":             "grok-4",
  "grok-3":             "grok-3",
  // Meta
  "llama-4":            "llama-4",
  "llama-3":            "llama-3",
  // DeepSeek
  "deepseek-v3":        "deepseek-v3",
  "deepseek-v3-2":      "deepseek-v3-1",
  // Alibaba
  "qwen-3":             "qwen-3",
  "qwen-3-coder":       "qwen-3-coder",
  "qwen-3-vl":          "qwen-3-vl",
  // Moonshot
  "kimi-k2":            "kimi-k2",
  "kimi-k2-thinking":   "kimi-k2",
  // MiniMax
  "minimax-m2":         "MiniMax-M2",
  // Mistral
  "mistral-large-2":    "mistral-large",
  // Baidu
  "baidu-ernie-4":      "ernie-4-5",
  // Open-source
  "ling-ring-1t":       "ling-1t",
  // Tencent
  "hy3":                "hy3",
};

// VARIANT_MAP: when an AA family aggregates many models with very
// different scores (e.g. Anthropic's `claude-4` slug holds Opus 4.7
// at 57.28 alongside Haiku 4.5 at 37.09), pick the specific record
// by exact `name` match. Falls back to SLUG_MAP/family champion if
// no record matches.
const VARIANT_MAP = {
  // Anthropic — see SLUG_MAP comment above
  "claude-opus-4-7":   "Claude Opus 4.7 (Adaptive Reasoning, Max Effort)",
  "claude-opus-4-6":   "Claude Opus 4.6 (Adaptive Reasoning, Max Effort)",
  "claude-sonnet-4-6": "Claude Sonnet 4.6 (Adaptive Reasoning, Max Effort)",
  "claude-opus-4-5":   "Claude Opus 4.5 (Reasoning)",
  "claude-haiku-4-5":  "Claude 4.5 Haiku (Reasoning)",
  "claude-4":          "Claude 4 Opus (Reasoning)",

  // DeepSeek — AA's `deepseek-v3` family aggregates V3 (Dec '24) all the
  // way to V3.2 (Reasoning); per-variant override pins each to its row.
  "deepseek-v3":                  "DeepSeek V3 (Dec '24)",
  "deepseek-v3-2":                "DeepSeek V3.2 (Reasoning)",
  "deepseek-r1":                  "DeepSeek R1 (Jan '25)",
  "deepseek-r1-0120":             "DeepSeek R1 (Jan '25)",
  "deepseek-r1-distill-llama-70b":"DeepSeek R1 Distill Llama 70B",
  "deepseek-v4-pro":              "DeepSeek V4 Pro (Reasoning, Max Effort)",
  "deepseek-v4-flash":            "DeepSeek V4 Flash (Reasoning, Max Effort)",

  // xAI / Grok — `grok-4` family champion is Grok 4.3; per-variant
  // override pins our specific Grok 4 (the original 2025-08 release) to
  // its actual record.
  "grok-3":                  "Grok 3",
  "grok-4":                  "Grok 4",
  "grok-4-1":                "Grok 4.1 Fast (Reasoning)",
  "grok-4-fast":             "Grok 4 Fast (Reasoning)",
  "grok-4-fast-reasoning":   "Grok 4 Fast (Reasoning)",
  "grok-4-1-fast":           "Grok 4.1 Fast (Non-reasoning)",
  "grok-4-1-fast-reasoning": "Grok 4.1 Fast (Reasoning)",
  "grok-4-20":               "Grok 4.20 0309 v2 (Reasoning)",
  "grok-4-20-0309":          "Grok 4.20 0309 v2 (Reasoning)",
  "grok-4-20-0309-non-reasoning": "Grok 4.20 0309 v2 (Non-reasoning)",
  "grok-4-20-non-reasoning": "Grok 4.20 0309 v2 (Non-reasoning)",
  "grok-3-mini-reasoning":   "Grok 3 mini Reasoning (high)",
  "grok-3-reasoning":        "Grok 3 mini Reasoning (high)",
  "grok-code-fast-1":        "Grok Code Fast 1",

  // Alibaba Qwen3-VL — AA stores these under family `qwen3` (not
  // `qwen-3-vl`). Pin the headline node to the largest reasoning variant.
  "qwen-3-vl":                       "Qwen3 VL 235B A22B (Reasoning)",
  "qwen3-vl-235b-a22b-reasoning":    "Qwen3 VL 235B A22B (Reasoning)",
  "qwen3-vl-235b-a22b-instruct":     "Qwen3 VL 235B A22B Instruct",
  "qwen3-vl-32b-reasoning":          "Qwen3 VL 32B (Reasoning)",
  "qwen3-vl-32b-instruct":           "Qwen3 VL 32B Instruct",
  "qwen3-vl-30b-a3b-reasoning":      "Qwen3 VL 30B A3B (Reasoning)",
  "qwen3-vl-30b-a3b-instruct":       "Qwen3 VL 30B A3B Instruct",

  // Z.ai (Tsinghua / Zhipu) GLM — AA spreads variants across `glm-4`,
  // `glm-4-5`, `glm-5`, `glm-5-1` family slugs that don't quite match
  // our naming (their "glm-4-5" champion is actually GLM-5 Non-reasoning).
  "glm-4-5":   "GLM-4.5 (Reasoning)",
  "glm-4":     "GLM-4.7 (Reasoning)",
  "glm-5":     "GLM-5.1 (Reasoning)",
  "glm-5-1":   "GLM-5.1 (Non-reasoning)",

  // Xiaomi MiMo — AA family `mimo` aggregates V2 / V2.5 / Pro / Flash.
  "mimo-v2-5-pro":            "MiMo-V2.5-Pro",
  "mimo-v2-pro":              "MiMo-V2-Pro",
  "mimo-v2":                  "MiMo-V2-Pro",
  "mimo-v2-0206":             "MiMo-V2-Pro",
  "mimo-v2-flash-reasoning":  "MiMo-V2-Flash (Reasoning)",
  "mimo-v2-flash":            "MiMo-V2-Flash (Non-reasoning)",
  "mimo-v2-omni":             "MiMo-V2-Omni",
  "mimo-v2-omni-0327":        "MiMo-V2-Omni-0327",
};

// ============== AA scrape + parse ==============
async function fetchAA() {
  log(`fetching ${AA_URL}…`);
  const r = await fetch(AA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ai-tree-fetch/0.1)",
      "Accept": "text/html",
    },
  });
  if (!r.ok) throw new Error(`AA returned HTTP ${r.status}`);
  const html = await r.text();
  log(`  got ${html.length} bytes`);
  return html;
}

function unescapeRSC(html) {
  // RSC streaming chunks live in self.__next_f.push([1, "<chunk>"]).
  // Concatenate all chunks, undo the JS string escapes inside.
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g)]
    .map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"));
  return chunks.join("\n");
}

function parseRecords(blob) {
  // Each rich record opens with {"additional_text":...
  // Walk forward brace-balanced (respecting JSON string quoting + escapes)
  // to find the matching close, then JSON.parse the slice.
  const re = /\{"additional_text":/g;
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
      else if (c === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    try {
      const obj = JSON.parse(blob.slice(start, i));
      if (obj.model_family_slug) out.push(obj);
    } catch {
      // skip malformed slices (shouldn't happen given correct brace walk)
    }
  }
  return out;
}

// ============== Aggregate + rank ==============
function aggregateByFamily(records) {
  // Each model_family_slug may have many variants (high/medium/low + xhigh).
  // Pick the one with highest intelligence_index as the family champion.
  const byFamily = new Map();
  for (const r of records) {
    const fam = r.model_family_slug;
    const ii = r.intelligence_index ?? -Infinity;
    const cur = byFamily.get(fam);
    if (!cur || (cur.intelligence_index ?? -Infinity) < ii) {
      byFamily.set(fam, r);
    }
  }
  // VARIANT_MAP overlays — for each `(our_slug → variant_name)` pair,
  // find the record whose `name` matches and add it under a synthetic
  // family slug "@variant:<our_slug>". The main loop will look this up
  // first, falling back to the regular SLUG_MAP champion if missing.
  for (const [ourSlug, variantName] of Object.entries(VARIANT_MAP)) {
    const rec = records.find((r) => r.name === variantName);
    if (rec) byFamily.set(`@variant:${ourSlug}`, rec);
  }
  return byFamily;
}

function computeRankings(byFamily) {
  // For each bench key, sort families desc by score; rank = 1-indexed position.
  const ranks = new Map(); // bench → Map<family_slug, {rank, score, total}>
  for (const k of BENCH_KEYS) {
    const scored = [];
    for (const [fam, r] of byFamily.entries()) {
      const v = r[k];
      if (typeof v === "number" && !Number.isNaN(v)) scored.push({ fam, score: v });
    }
    scored.sort((a, b) => b.score - a.score);
    const m = new Map();
    scored.forEach((s, i) => m.set(s.fam, { rank: i + 1, score: s.score, total: scored.length }));
    ranks.set(k, m);
  }
  return ranks;
}

// Always include AA Intelligence Index when AA has a score for the model,
// even if it's outside the Top 25% strength filter. The detail page's
// "Position" card and the relationship-analysis script both key off this
// benchmark — dropping it would silently break those features for any
// model that doesn't happen to be Top 25% on Intel.
const ALWAYS_KEEP = new Set(["intelligence_index"]);

function pickTop3(famSlug, ranks) {
  // For each bench where this family has a rank, collect (key, rank, score, total)
  const all = [];
  for (const [k, m] of ranks.entries()) {
    const r = m.get(famSlug);
    if (r) all.push({ k, ...r, percentile: r.rank / r.total });
  }
  // Filter to only "genuinely strong" rankings — within top PERCENTILE_CAP
  // of the pool AND under the absolute rank cap. Picking #50/150 just
  // because it's the model's least-bad rank doesn't read as a strength.
  const qualifying = all.filter(
    (a) => a.percentile <= PERCENTILE_CAP && a.rank <= ABSOLUTE_RANK_CAP,
  );
  // Sort by PERCENTILE asc (rank ÷ total) — ranks-from-bigger-pools edge
  // out ranks-from-smaller-pools because they're proportionally better.
  // Tiebreak: lower raw rank wins.
  qualifying.sort((a, b) => a.percentile - b.percentile || a.rank - b.rank);
  const top = qualifying.slice(0, 3);

  // Ensure the always-keep benches are present even if they weren't in the
  // top-3 strength picks. They're appended after the strength picks so the
  // top-of-page bullets still lead with the model's actual standout metrics.
  for (const k of ALWAYS_KEEP) {
    if (top.some((t) => t.k === k)) continue;
    const extra = all.find((a) => a.k === k);
    if (extra) top.push(extra);
  }
  return top;
}

function formatScore(value, unit) {
  if (unit === "pct") return `${(value * 100).toFixed(1)}%`;
  if (unit === "score") return `${value.toFixed(2)}`;
  return `${value}`;
}

function buildBenchRow(top) {
  const meta = BENCH_META[top.k];
  const url = meta.eval
    ? `https://artificialanalysis.ai/evaluations/${meta.eval}`
    : `https://artificialanalysis.ai/leaderboards/models`;
  // Percentile suffix for at-a-glance "top X%" framing on the page.
  const pct = top.percentile <= 0.01 ? "Top 1%"
    : top.percentile <= 0.05 ? "Top 5%"
    : top.percentile <= 0.1  ? "Top 10%"
    : top.percentile <= 0.2  ? "Top 20%"
    :                          `Top ${Math.ceil(top.percentile * 100)}%`;
  return {
    name: meta.name,
    score: formatScore(top.score, meta.unit),
    vs_baseline: `Rank #${top.rank} of ${top.total} · ${pct}`,
    source_url: url,
  };
}

// ============== Main ==============
async function main() {
  log(`fetch-aa-benchmarks — ${DRY ? "DRY RUN" : "LIVE"}${FORCE ? " · FORCE" : ""}`);
  const html = await fetchAA();
  const blob = unescapeRSC(html);
  log(`unescaped blob: ${blob.length} chars`);

  const records = parseRecords(blob);
  log(`parsed ${records.length} rich records`);

  const byFamily = aggregateByFamily(records);
  log(`aggregated into ${byFamily.size} families`);

  const ranks = computeRankings(byFamily);
  log(`computed rankings across ${BENCH_KEYS.length} benchmarks`);

  // Walk MDX
  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );
  let touched = 0, skipped = 0, missing = 0;
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.slug) continue;
    if (ONE_SLUG && fm.slug !== ONE_SLUG) continue;

    // Prefer per-variant override when present (synthetic key in
     // byFamily is "@variant:<our_slug>"); otherwise fall back to
     // SLUG_MAP family champion.
    const variantKey = VARIANT_MAP[fm.slug] ? `@variant:${fm.slug}` : null;
    const aaSlug = variantKey ?? SLUG_MAP[fm.slug];
    if (!aaSlug) { missing++; vlog(`  ${fm.slug} → no AA mapping, skip`); continue; }

    let top = pickTop3(aaSlug, ranks);
    // Guarantee that AA Intelligence Index is in `top` whenever AA has
    // a score for the model — even if it's outside the Top 25% strength
    // filter. The Position card on the detail page and the AA-band gate
    // in the relationship analysis script both depend on this row.
    if (!top.some((t) => t.k === "intelligence_index")) {
      const intelMap = ranks.get("intelligence_index");
      const intelEntry = intelMap?.get(aaSlug);
      if (intelEntry) {
        top = [
          ...top,
          { k: "intelligence_index", ...intelEntry, percentile: intelEntry.rank / intelEntry.total },
        ];
      }
    }
    if (top.length === 0) {
      missing++;
      // No AA data at all (not just no Top 25% — no Intel either). Leave
      // existing benchmarks alone; hand-curated entries are better than
      // empty.
      vlog(`  ${fm.slug} → ${aaSlug}: no AA scores at all — preserving existing benchmarks`);
      continue;
    }

    const newRows = top.map(buildBenchRow);
    const existing = fm.model_spec?.benchmarks ?? [];
    if (!FORCE && existing.length >= 3) {
      skipped++;
      vlog(`  ${fm.slug} → already has ${existing.length} benchmarks, skip (--force to overwrite)`);
      continue;
    }

    log(`  ${fm.slug} → ${aaSlug} (${top.length} qualifying): ${newRows.map((r) => `${r.name} ${r.score} [${r.vs_baseline}]`).join(" · ")}`);

    if (!DRY) {
      // Refresh Speed and Price rows directly from the AA family record
      // (`output_tokens`, `price_1m_input_tokens`, `price_1m_output_tokens`).
      // AA returns these per-model, not via the rank table, so they live
      // outside the top-3 strength picks.  When AA reports 0 (or no
      // numeric value), drop the row entirely — it's "no data", not
      // "free". The Speed and Cost attribute cards then hide cleanly.
      const aaRecord = byFamily.get(aaSlug);
      const aaModelUrl = aaRecord?.model_url
        ? `https://artificialanalysis.ai${aaRecord.model_url}`
        : "https://artificialanalysis.ai/leaderboards/models";
      // Real output speed lives in performanceByPromptLength as
      // `median_output_speed`. Average across prompt-length rows
      // ("short" / "medium" / "long") so we get a single representative
      // number — AA's own UI shows a single blended figure too.
      // `output_tokens` is the max output limit, NOT speed.
      const perfRows = Array.isArray(aaRecord?.performanceByPromptLength) ? aaRecord.performanceByPromptLength : [];
      const speeds = perfRows.map((r) => r?.median_output_speed).filter((v) => typeof v === "number" && v > 0);
      const speedAA = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
      const inAA = aaRecord?.price_1m_input_tokens;
      const outAA = aaRecord?.price_1m_output_tokens;
      const aaSpeedRow = (typeof speedAA === "number" && speedAA > 0)
        ? {
            name: "Speed · Output tok/s",
            score: String(Math.round(speedAA)),
            source_url: aaModelUrl,
          }
        : null;
      const aaPriceRow = (typeof inAA === "number" && typeof outAA === "number" && (inAA > 0 || outAA > 0))
        ? {
            name: "Price ($/M tokens)",
            score: `$${inAA.toFixed(2)} in / $${outAA.toFixed(2)} out`,
            source_url: aaModelUrl,
          }
        : null;

      // Merge: AA-derived strength picks (newRows) + AA Speed/Price
      // (when AA has them) + any hand-curated rows that we don't manage.
      // Drop existing Speed/Price entries first since we're overwriting
      // from fresh AA data (or removing if AA reports 0/0).
      const newNames = new Set(newRows.map((r) => String(r.name).toLowerCase()));
      const HAND_KEEP_RE = /^(preference|vision · mmmu-pro|hand-curated)/i;
      const SCRIPT_MANAGED_RE = /^(speed · output tok\/s|price \(\$\/m tokens\))/i;
      const preserved = existing.filter((b) =>
        !newNames.has(String(b.name).toLowerCase()) &&
        !SCRIPT_MANAGED_RE.test(String(b.name)) &&
        (HAND_KEEP_RE.test(String(b.name)) || !/Rank #\d+ of \d+/.test(b.vs_baseline ?? "")),
      );
      const merged = [
        ...newRows,
        ...(aaSpeedRow ? [aaSpeedRow] : []),
        ...(aaPriceRow ? [aaPriceRow] : []),
        ...preserved,
      ];
      const newFm = {
        ...fm,
        model_spec: { ...(fm.model_spec ?? {}), benchmarks: merged },
      };
      await writeFile(path, matter.stringify(body, newFm));
    }
    touched++;
  }

  log(`\nSummary:`);
  log(`  ${touched} touched · ${skipped} skipped (already filled) · ${missing} no AA data`);
  if (DRY) log(`  DRY RUN — drop --dry-run to commit.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
