#!/usr/bin/env node
/**
 * stub-new-aa-models.mjs — create stub MDX node pages for AA families
 * that have no corresponding node in src/content/nodes/ yet.
 *
 * Reads /tmp/aa-fams-full.json (produced by the AA scraper) and the
 * SLUG_MAP from fetch-aa-benchmarks.mjs. Anything in AA but not covered
 * by an existing slug or mapping → new MDX file.
 *
 * Each stub has only the data we can derive from AA: name, org, date,
 * params, context, license, modalities, AA Intelligence score, top
 * benchmarks. Reviews, lineage, public_view sections are left empty
 * for hand-curation later.
 *
 * Usage:
 *   node scripts/stub-new-aa-models.mjs --dry-run
 *   node scripts/stub-new-aa-models.mjs            # writes files
 */

import { readdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const FAMS_PATH = "/tmp/aa-fams-full.json";

const DRY = process.argv.includes("--dry-run");

if (!existsSync(FAMS_PATH)) {
  console.error(`ERROR: ${FAMS_PATH} missing — run the AA scraper first.`);
  process.exit(1);
}

// Load family records
const fams = JSON.parse(readFileSync(FAMS_PATH, "utf8"));

// Read SLUG_MAP from fetch script
const fetchSrc = readFileSync(join(REPO_ROOT, "scripts", "fetch-aa-benchmarks.mjs"), "utf8");
const slugMapMatch = fetchSrc.match(/const SLUG_MAP = \{([\s\S]*?)\};/);
const SLUG_MAP = {};
if (slugMapMatch) {
  for (const m of slugMapMatch[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    SLUG_MAP[m[1]] = m[2];
  }
}
const mappedAaSlugs = new Set(Object.values(SLUG_MAP));

// Existing node slugs
const files = await readdir(NODES_DIR);
const existingSlugs = new Set();
for (const f of files) {
  if (!f.endsWith(".mdx") || f.startsWith("_")) continue;
  const txt = await readFile(join(NODES_DIR, f), "utf8");
  const m = txt.match(/^slug:\s*([^\s\n]+)/m);
  if (m) existingSlugs.add(m[1]);
}

// Helpers
const slugify = (s) => String(s)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const yamlString = (v) => {
  if (v === null || v === undefined || v === "") return '""';
  const s = String(v);
  // Always JSON-encode (safest); only bare-emit safe alphanumeric strings.
  if (/^[A-Za-z][A-Za-z0-9 ._]*$/.test(s)) return s;
  return JSON.stringify(s);
};

const fmtCtx = (n) => {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
};

const fmtParams = (rec) => {
  const total = rec.parameters || rec.parameters_billions;
  const active = rec.inference_parameters_active_billions;
  if (total && active && total !== active) return `${total}B total / ${active}B active`;
  if (total) return `${total}B`;
  if (active) return `${active}B active`;
  return "undisclosed";
};

const inferEra = (releaseDate) => {
  if (!releaseDate) return "frontier";
  const y = parseInt(releaseDate.slice(0, 4), 10);
  if (y >= 2026) return "frontier";
  if (y >= 2024) return "agents";
  if (y >= 2023) return "alignment";
  return "transformer";
};

const inferCategories = (rec) => {
  const cats = ["nlp", "generative"];
  if (rec.input_modality_image || rec.input_modality_video || rec.output_modality_image) cats.push("multimodal");
  if (rec.input_modality_image || rec.output_modality_image) cats.push("cv");
  if (rec.input_modality_speech || rec.output_modality_speech) cats.push("audio");
  // Reasoning model heuristic from name
  const nm = (rec.name || "").toLowerCase();
  if (nm.includes("reasoning") || nm.includes("thinking") || rec.reasoning_model) {
    cats.push("reasoning");
  }
  if (nm.includes("coder") || nm.includes("code")) {
    cats.push("code");
  }
  return cats;
};

// Org enum allowed by src/content.config.ts — must match exactly. Anything
// outside this set gets coerced to "Academic / Independent" so the schema
// validator doesn't reject the file.
const ORG_ENUM = new Set([
  "OpenAI","Anthropic","Google","Google DeepMind","DeepMind","Google Brain",
  "Meta AI","Microsoft","Mistral AI","Stability AI","EleutherAI","Cohere",
  "xAI","Alibaba","DeepSeek","Tsinghua / Zhipu","01.AI","Baidu","Tencent",
  "Moonshot AI","MiniMax","ByteDance","Stepfun","Suno","Runway",
  "Black Forest Labs","Databricks","Perplexity","Kuaishou","Hugging Face",
  "BigScience","Allen AI","Salesforce","Nvidia","Apple","IBM","Huawei",
  "Xiaomi","Ant Group","Shanghai AI Lab","BAAI","AI21 Labs","Reka AI",
  "Adobe","Amazon","Arc Institute","Boston Dynamics","Cartesia","Cognition",
  "ElevenLabs","Figure AI","Ideogram","Lightricks","Liquid AI","Luma AI",
  "Midjourney","MIT","Physical Intelligence","Pika Labs","Sesame","Snowflake",
  "Synthesia","Tesla","Together AI","Ultralytics","Unitree","Voyage AI",
  "Wayve","Writer","Hedra","Hume AI","Nari Labs","Recraft",
  "Academic / Independent","US Office of Naval Research",
  "UC San Diego / CMU","University of Toronto","Université de Montréal",
  "Cornell Aeronautical Laboratory",
]);
const ORG_OVERRIDES = {
  "Kimi":            "Moonshot AI",
  "Moonshot":        "Moonshot AI",
  "Z.ai":            "Tsinghua / Zhipu",
  "Z AI":            "Tsinghua / Zhipu",
  "ZAI":             "Tsinghua / Zhipu",
  "Zhipu":           "Tsinghua / Zhipu",
  "Zhipu AI":        "Tsinghua / Zhipu",
  "ZhipuAI":         "Tsinghua / Zhipu",
  "NVIDIA":          "Nvidia",
  "Mistral":         "Mistral AI",
  "Meta":            "Meta AI",
  "Mistral AI":      "Mistral AI",
};
const orgFromCreator = (rec) => {
  const c = rec.model_creators;
  const raw = (typeof c === "object" && c?.name) ? c.name : (typeof c === "string" ? c : null);
  if (!raw) return "Academic / Independent";
  const mapped = ORG_OVERRIDES[raw] || raw;
  return ORG_ENUM.has(mapped) ? mapped : "Academic / Independent";
};

// Pre-compute AA Intelligence Index rank table so each stub gets a
// `vs_baseline: 'Rank #N of M'` line — without it the Position card on
// the detail page stays empty, and the relationship-analysis script's
// AA-band gate falls back to "no data".
const intelEntries = Object.entries(fams)
  .filter(([, v]) => typeof v.intelligence_index === "number")
  .sort(([, a], [, b]) => b.intelligence_index - a.intelligence_index);
const intelRank = new Map();
intelEntries.forEach(([k], i) => intelRank.set(k, { rank: i + 1, total: intelEntries.length }));

// Build benchmark rows from AA fields
const PCT = (v) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : null);
const SCORE = (v) => (typeof v === "number" ? v.toFixed(2) : null);
const buildBenches = (famKey, rec) => {
  const out = [];
  if (typeof rec.intelligence_index === "number") {
    const r = intelRank.get(famKey);
    out.push({
      name: "Intelligence · AA Intelligence Index",
      score: SCORE(rec.intelligence_index),
      vs_baseline: r ? `Rank #${r.rank} of ${r.total}` : null,
      source_url: `https://artificialanalysis.ai/models/${rec.model_family_slug || rec.slug || ""}`,
    });
  }
  if (typeof rec.coding_index === "number") {
    out.push({
      name: "Coding · AA Coding Index",
      score: SCORE(rec.coding_index),
      source_url: `https://artificialanalysis.ai/models/${rec.model_family_slug || ""}`,
    });
  }
  if (typeof rec.scicode === "number") {
    out.push({
      name: "Coding · SciCode",
      score: PCT(rec.scicode),
      source_url: "https://artificialanalysis.ai/evaluations/scicode",
    });
  }
  if (typeof rec.terminalbench_hard === "number") {
    out.push({
      name: "Agentic · Terminal-Bench Hard",
      score: PCT(rec.terminalbench_hard),
      source_url: "https://artificialanalysis.ai/evaluations/terminal-bench-hard",
    });
  }
  if (typeof rec.gpqa === "number") {
    out.push({
      name: "GPQA",
      score: PCT(rec.gpqa),
      source_url: "https://artificialanalysis.ai/evaluations/gpqa-diamond",
    });
  }
  if (typeof rec.hle === "number") {
    out.push({
      name: "HLE",
      score: PCT(rec.hle),
      source_url: "https://artificialanalysis.ai/evaluations/humanitys-last-exam",
    });
  }
  if (typeof rec.price_1m_input_tokens === "number" && typeof rec.price_1m_output_tokens === "number") {
    out.push({
      name: "Price ($/M tokens)",
      score: `$${rec.price_1m_input_tokens.toFixed(2)} in / $${rec.price_1m_output_tokens.toFixed(2)} out`,
      source_url: "https://artificialanalysis.ai/leaderboards/models",
    });
  }
  return out;
};

// Build YAML for benchmarks. Score is always quoted so the schema (which
// expects string) accepts numeric-looking values like "53.90".
const benchYaml = (rows) => rows.map((r) => {
  let s = `    - name: ${yamlString(r.name)}\n      score: ${JSON.stringify(String(r.score))}`;
  if (r.vs_baseline) s += `\n      vs_baseline: ${yamlString(r.vs_baseline)}`;
  if (r.source_url) s += `\n      source_url: ${yamlString(r.source_url)}`;
  return s;
}).join("\n");

// Build a stub MDX for a family record
function buildMdx(famSlug, rec) {
  const slug = slugify(famSlug);
  const title = rec.name ? `${rec.name}` : slug;
  const date = rec.release_date || "2026-01-01";
  const era = inferEra(date);
  const cats = inferCategories(rec);
  const org = orgFromCreator(rec);
  const params = fmtParams(rec);
  const ctx = rec.context_window_tokens || null;
  const releaseType = rec.is_open_weights ? "open_weights" : "api";
  const modalities = ["text"];
  if (rec.input_modality_image || rec.output_modality_image) modalities.push("image");
  if (rec.input_modality_video) modalities.push("video");
  if (rec.input_modality_speech || rec.output_modality_speech) modalities.push("audio");
  const aaUrl = rec.model_url ? `https://artificialanalysis.ai${rec.model_url}` : null;
  const benches = buildBenches(famSlug, rec);
  const cw = ctx ? `\n  context_window: ${ctx}` : "";

  return `---
slug: ${slug}
title: ${yamlString(title)}
date: '${date}'
era: ${era}
category:
${cats.map((c) => `  - ${c}`).join("\n")}
authors:
  - ${yamlString(org + " Team")}
org: ${yamlString(org)}
breakthrough_score: 5
status: active
model_spec:
  parameters: ${yamlString(params)}
  architecture: ${yamlString(rec.reasoning_model ? "Reasoning-tuned LLM (auto-generated stub)" : "Decoder-only transformer (auto-generated stub)")}${cw}
  release_type: ${releaseType}
  modalities:
${modalities.map((m) => `    - ${m}`).join("\n")}
  benchmarks:
${benchYaml(benches)}${aaUrl ? `\n  aa_url: ${yamlString(aaUrl)}` : ""}${rec.model_creators?.creator_url ? `\n  homepage: ${yamlString(rec.model_creators.creator_url)}` : ""}
  availability:
    - ${releaseType}
  reviews:
    feels_like:
      - "Auto-generated stub from Artificial Analysis catalog — verify before publishing"
    best_for:
      - "See benchmarks below for capability profile"
    not_ideal_for:
      - "Tasks far outside the modalities or capabilities this model targets"
public_view:
  plain_english: |
    Stub page for ${title}. Auto-imported from Artificial Analysis on
    ${new Date().toISOString().slice(0, 10)}. Scores below are pulled
    from AA; lineage and prose still need hand-curation.
  analogy: |
    Like other ${cats.includes("reasoning") ? "reasoning" : "general-purpose"}
    LLMs in its tier — see benchmarks for relative positioning. Hand-curated
    analogy goes here once the entry is reviewed.
  applications:
    - product: ${yamlString(title)}
      company: ${yamlString(org)}
      year_deployed: ${parseInt(date.slice(0, 4), 10) || 2026}
  investment_angle: |
    ${org} positions ${title} in the ${cats.includes("code") ? "developer-tools" :
      cats.includes("reasoning") ? "frontier-reasoning" : "general LLM"}
    market. Refine this paragraph with deployment data, moat shape, and
    distribution channels once curated.
  why_it_matters: |
    See AA's evaluation page for benchmark detail. This stub exists so the
    model appears alongside its peers in the tree and detail-page peer
    comparisons; replace with curated context when ready.

citations:
  - type: blog
    key: ${("aa_" + slug).replace(/-/g, "_").replace(/[^a-z0-9_]/g, "")}
    title: ${yamlString(title + " — Artificial Analysis catalog entry")}
    url: ${yamlString(aaUrl || "https://artificialanalysis.ai/models")}
    year: ${parseInt(date.slice(0, 4), 10) || 2026}
---

## Notes

This page was auto-generated from Artificial Analysis catalog data.
Replace with curated context, lineage relationships, and prose when
ready.
`;
}

// Pick a date prefix for the file name from release_date
const filePrefix = (rec) => {
  const d = rec.release_date || "2026-01-01";
  return d.slice(0, 7); // YYYY-MM
};

// AA family slugs we already cover with a curated node, even though
// the slug doesn't match exactly. Skipping these prevents creating a
// duplicate stub for a model that's already richly represented.
const SKIP_FAMS = new Set([
  // Sub-versions of existing families — don't create one node per AA variant
  "llama-3-1", "llama-3-2", "llama-3-3", "llama-2", "llama",
  "gemma-3", "gemma-4",
  "claude-3-5", "claude-3-7", "claude-3", "claude-4", "claude-4-1",
  "gemini-2-0", "gemini-2-5", "gemini-3",
  "gpt-3-5", "gpt-4", "gpt-4-1", "gpt-4o", "gpt-4-turbo",
  "o1", "o3", "o4",
  "deepseek-v3", "deepseek-v3-1", "deepseek-r1", "deepseek-v4",
  "mixtral", "minimax-m1", "MiniMax-M2",
  "jamba-1-5", "jamba-1-6", "jamba-1-7",
  "command-r",
  "qwen2-5", "qwen-3-5", "qwen-3-6", "qwen3", "qwen3-5-omni",
  "qwq", "seed-oss",
  "phi-4", "lfm2", "step-3-5", "ernie-4-5",
  "grok-3", "grok-4", "grok-code", "grok-4-1",
  "gpt-5", "gpt-oss",
  // AA's family slug differs from ours but maps to a curated node
  "mimo",            // → mimo-v2-5-pro
  "mistral",         // → mistral-medium-3-1
  "mistral-large",   // → mistral-large-3
  "mistral-medium",  // covered by mistral-medium-3-1 + variants
  "mistral-small",   // covered by mistral-small-4-v25-12 etc.
  "nova",            // → nova-premier
  "nova-2",          // → covered by nova-2-0-* nodes
  "olmo",            // → olmo-2 (older, different)
  "granite-3-3", "granite-4-0",  // similar covered
  "reka",            // → reka-flash-3
  "command",         // → command-a / command-r-plus
  "kimi-k2",         // → kimi-k2 already exists
]);

// MAIN
const toCreate = [];
for (const [famKey, rec] of Object.entries(fams)) {
  if (SKIP_FAMS.has(famKey)) continue;
  // Skip if AA family is already covered by an existing slug or mapping
  if (existingSlugs.has(famKey)) continue;
  if (mappedAaSlugs.has(famKey)) continue;
  // Some AA family slugs don't kebab-case cleanly; canonicalize
  const candidateSlug = slugify(famKey);
  if (existingSlugs.has(candidateSlug)) continue;
  // Skip media-output models (different schema)
  if (rec.output_modality_image || rec.output_modality_video) continue;
  toCreate.push({ famKey, candidateSlug, rec });
}

console.log(`Found ${toCreate.length} new AA families to stub.`);
for (const { famKey, candidateSlug, rec } of toCreate) {
  const fname = `${filePrefix(rec)}-${candidateSlug}.mdx`;
  const fpath = join(NODES_DIR, fname);
  if (existsSync(fpath)) {
    console.log(`  SKIP existing: ${fname}`);
    continue;
  }
  const body = buildMdx(famKey, rec);
  console.log(`  ${DRY ? "DRY" : "WRITE"} ${fname}  (${rec.name}, AA Intel ${rec.intelligence_index})`);
  if (!DRY) await writeFile(fpath, body);
}
if (DRY) console.log("\nDRY RUN — drop --dry-run to write files.");
