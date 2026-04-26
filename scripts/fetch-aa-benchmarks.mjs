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
const BENCH_META = {
  // Reasoning
  aime:                 { name: "AIME 2024",                    unit: "pct",   eval: "aime" },
  aime25:               { name: "AIME 2025",                    unit: "pct",   eval: "aime" },
  gpqa:                 { name: "GPQA Diamond",                 unit: "pct",   eval: "gpqa-diamond" },
  hle:                  { name: "Humanity's Last Exam",         unit: "pct",   eval: "humanitys-last-exam" },
  critpt:               { name: "CritPt (graduate physics)",    unit: "pct",   eval: "critpt" },
  // Math
  math_500:             { name: "MATH-500",                     unit: "pct",   eval: null },
  math_index:           { name: "AA Math Index",                unit: "score", eval: null },
  // Coding
  humaneval:            { name: "HumanEval",                    unit: "pct",   eval: null },
  livecodebench:        { name: "LiveCodeBench",                unit: "pct",   eval: null },
  scicode:              { name: "SciCode",                      unit: "pct",   eval: "scicode" },
  coding_index:         { name: "AA Coding Index",              unit: "score", eval: null },
  // Agentic / tool use / real-world tasks
  tau2:                 { name: "𝜏²-Bench Telecom (agentic)",    unit: "pct",   eval: "tau2-bench" },
  terminalbench_hard:   { name: "Terminal-Bench Hard (agentic)", unit: "pct",  eval: "terminalbench-hard" },
  gdpval:               { name: "GDPval-AA (real-world tasks)", unit: "score", eval: "gdpval-aa" },
  agentic_index:        { name: "AA Agentic Index",             unit: "score", eval: null },
  apex_agents_aa:       { name: "Apex Agents",                  unit: "pct",   eval: "apex-agents-aa" },
  // Long context
  lcr:                  { name: "AA-LCR (long-context reason)", unit: "pct",   eval: "artificial-analysis-long-context-reasoning" },
  // Knowledge / instruction following
  mmlu_pro:             { name: "MMLU-Pro",                     unit: "pct",   eval: null },
  ifbench:              { name: "IFBench (instruction follow)", unit: "pct",   eval: "ifbench" },
  omniscience:          { name: "AA-Omniscience",               unit: "score", eval: "omniscience" },
  // Multimodal
  mmmu:                 { name: "MMMU",                         unit: "pct",   eval: null },
  mmmu_pro:             { name: "MMMU-Pro",                     unit: "pct",   eval: "mmmu-pro" },
  // Composite indices
  intelligence_index:   { name: "AA Intelligence Index",        unit: "score", eval: null },
  // Multilingual
  multilingual_index:   { name: "AA Multilingual Index",        unit: "score", eval: null },
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
  // Anthropic — our newer slugs map to AA's latest available family
  "claude-opus-4-7":    "claude-4-1",
  "claude-opus-4-6":    "claude-4-1",
  "claude-sonnet-4-6":  "claude-4-1",
  "claude-haiku-4-5":   "claude-4-1",
  "claude-4":           "claude-4",
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
  return qualifying.slice(0, 3);
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

    const aaSlug = SLUG_MAP[fm.slug];
    if (!aaSlug) { missing++; vlog(`  ${fm.slug} → no AA mapping, skip`); continue; }

    const top = pickTop3(aaSlug, ranks);
    if (top.length === 0) {
      missing++;
      // No qualifying ranks. If the existing benchmarks were AA-sourced
      // (vs_baseline contains "Rank #"), clear them — stale AA data is
      // worse than no data. Otherwise leave hand-curated benchmarks alone.
      const existing = fm.model_spec?.benchmarks ?? [];
      const aaSourced = existing.some((b) =>
        typeof b.vs_baseline === "string" && /Rank #\d+ of \d+/.test(b.vs_baseline),
      );
      if (aaSourced) {
        log(`  ${fm.slug} → ${aaSlug}: no Top ${Math.round(PERCENTILE_CAP * 100)}% rankings — clearing stale AA benchmarks`);
        if (!DRY) {
          const newSpec = { ...fm.model_spec };
          delete newSpec.benchmarks;
          await writeFile(path, matter.stringify(body, { ...fm, model_spec: newSpec }));
        }
        touched++;
      } else {
        vlog(`  ${fm.slug} → ${aaSlug}: no Top ${Math.round(PERCENTILE_CAP * 100)}% rankings — preserving hand-curated benchmarks`);
      }
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
      const newFm = {
        ...fm,
        model_spec: { ...(fm.model_spec ?? {}), benchmarks: newRows },
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
