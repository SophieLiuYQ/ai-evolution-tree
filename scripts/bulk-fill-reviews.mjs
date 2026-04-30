#!/usr/bin/env node
// Auto-fill `reviews:` blocks for MDX nodes that don't already have one.
// Strategy:
//   1. Build a "parent map" — for each model family with a curated review,
//      identify which slug owns the canonical bullets (e.g. claude-4-5
//      variants → claude-sonnet-4-5 / claude-opus-4-5).
//   2. For variants of a populated model, generate a compact 3-bullet
//      review block referencing the parent's strengths + the variant's
//      specific dial (thinking / non-reasoning / mini / nano / instant).
//   3. For nodes that don't fit any family, write a category-aware
//      generic template based on the node's `category` field and the
//      first sentence of its `public_view.plain_english`.
//
// All inserted blocks are clearly low-effort by design — the canonical
// curation lives on the parent. Goal is 100% coverage, not 100% prose.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NODES_DIR = path.resolve(__dirname, "..", "src", "content", "nodes");

// Heuristics for matching variant → parent. First match wins.
const PARENT_MATCHERS = [
  // Claude family
  { match: /claude-opus-4-7/, parent: "claude-opus-4-5", note: "Successor refresh of Opus 4.5; same agentic-coding strengths." },
  { match: /claude-opus-4-6/, parent: "claude-opus-4-5", note: "Adds 1M-token context to the Opus 4.5 baseline." },
  { match: /claude-opus-4-5/, parent: "claude-opus-4-5", note: "" },
  { match: /claude-opus-4-1/, parent: "claude-opus-4-5", note: "Earlier 2025 Opus generation; weaker on Terminal-Bench/agents." },
  { match: /claude-opus-4(?!-)/, parent: "claude-4", note: "Opus tier of the original Claude 4 family." },
  { match: /claude-sonnet-4-6/, parent: "claude-sonnet-4-6", note: "" },
  { match: /claude-sonnet-4-5/, parent: "claude-sonnet-4-5", note: "" },
  { match: /claude-sonnet-4(?!-)/, parent: "claude-4", note: "Sonnet tier of the original Claude 4 family." },
  { match: /claude-4-5-haiku/, parent: "claude-haiku-4-5", note: "" },
  { match: /claude-4-5-sonnet/, parent: "claude-sonnet-4-5", note: "" },
  { match: /claude-4-5(?!-)/, parent: "claude-sonnet-4-5", note: "" },
  { match: /claude-4-1/, parent: "claude-4", note: "Mid-cycle refresh of Claude 4 — modest reasoning bumps." },
  { match: /claude-4(?!-)/, parent: "claude-4", note: "" },
  { match: /claude-3-7-sonnet/, parent: "claude-3-7-sonnet", note: "" },
  { match: /claude-3-5-haiku/, parent: "claude-3-5-sonnet", note: "Haiku tier — faster + cheaper at one tier below Sonnet 3.5 quality." },
  { match: /claude-35-sonnet/, parent: "claude-3-5-sonnet", note: "" },
  { match: /claude-35/, parent: "claude-3-5-sonnet", note: "" },
  { match: /claude-3-haiku/, parent: "claude-3", note: "Haiku tier — fastest and cheapest of the Claude 3 family." },
  { match: /claude-3-opus/, parent: "claude-3", note: "Opus tier — top quality of the Claude 3 family." },
  { match: /claude-3-sonnet/, parent: "claude-3", note: "Sonnet tier — balanced quality/cost of the Claude 3 family." },
  { match: /claude-3(?!-5|-7)/, parent: "claude-3", note: "" },
  { match: /claude-2/, parent: "claude-3", note: "Earlier Claude 2 generation — superseded by Claude 3+." },
  { match: /claude-instant/, parent: "claude-3", note: "Earlier fast-tier Claude — superseded by Haiku family." },
  { match: /claude-1/, parent: "claude-3", note: "Original Claude 1 — historical baseline; superseded by Claude 3+." },

  // GPT-5 family
  { match: /gpt-5-5/, parent: "gpt-5-2", note: "Later 2026 GPT-5 refresh — incremental quality bump over 5.2." },
  { match: /gpt-5-4/, parent: "gpt-5-2", note: "Mid-cycle GPT-5 refresh between 5.2 and 5.5." },
  { match: /gpt-5-3/, parent: "gpt-5-2", note: "Mid-cycle GPT-5 refresh between 5.2 and 5.5." },
  { match: /gpt-5-2-codex/, parent: "gpt-5-2", note: "Codex-specialised variant — tuned for SWE-bench Pro / coding agents." },
  { match: /gpt-5-2-medium/, parent: "gpt-5-2", note: "Medium reasoning tier — balance of speed and quality." },
  { match: /gpt-5-2-non-reasoning/, parent: "gpt-5-2", note: "No-reasoning mode — fast/cheap path through GPT-5.2." },
  { match: /gpt-5-2/, parent: "gpt-5-2", note: "" },
  { match: /gpt-5-1-codex/, parent: "gpt-5-1", note: "Codex-specialised variant of GPT-5.1." },
  { match: /gpt-5-1-non-reasoning/, parent: "gpt-5-1", note: "No-reasoning mode — fast path through GPT-5.1." },
  { match: /gpt-5-1/, parent: "gpt-5-1", note: "" },
  { match: /gpt-5(?!-)/, parent: "gpt-5", note: "" },

  // OpenAI o-series
  { match: /^o3/, parent: "o3", note: "" },
  { match: /^o1/, parent: "o1", note: "" },
  { match: /^o4/, parent: "o3", note: "Successor to o3 — extends the reasoning-model line." },

  // Gemini family
  { match: /gemini-3-flash/, parent: "gemini-3-pro", note: "Faster/cheaper Flash tier of Gemini 3 — quality drop, speed gain." },
  { match: /gemini-3-pro/, parent: "gemini-3-pro", note: "" },
  { match: /gemini-3/, parent: "gemini-3-pro", note: "" },
  { match: /gemini-2-5-flash/, parent: "gemini-2-5-pro", note: "Faster/cheaper Flash tier of Gemini 2.5." },
  { match: /gemini-2-5-pro/, parent: "gemini-2-5-pro", note: "" },
  { match: /gemini-2-5/, parent: "gemini-2-5-pro", note: "" },
  { match: /gemini-2-0-flash-thinking/, parent: "gemini-2-5-pro", note: "Earlier reasoning preview — Gemini 2.5 Pro is the production successor." },
  { match: /gemini-2-0-flash/, parent: "gemini-2-5-pro", note: "Earlier Flash tier — superseded by Gemini 2.5 Flash." },
  { match: /gemini-2-0/, parent: "gemini-2-5-pro", note: "Earlier Gemini 2.0 generation — superseded by 2.5 family." },
  { match: /gemini-1-5-pro/, parent: "gemini-1-5-pro", note: "" },
  { match: /gemini-1-5-flash/, parent: "gemini-1-5-pro", note: "Flash tier of Gemini 1.5 — long context at lower cost." },
  { match: /gemini-1-5/, parent: "gemini-1-5-pro", note: "" },
  { match: /gemini-1/, parent: "gemini-1-5-pro", note: "Original Gemini 1 — historical; superseded by 1.5+." },

  // Llama
  { match: /llama-4-maverick/, parent: "llama-4", note: "Maverick variant — 17B active / 128 experts; multimodal frontier-tier." },
  { match: /llama-4-scout/, parent: "llama-4", note: "Scout variant — 17B active / 16 experts; 10M-token context." },
  { match: /llama-4-behemoth/, parent: "llama-4", note: "Behemoth variant — Meta's largest Llama 4 (preview)." },
  { match: /llama-4/, parent: "llama-4", note: "" },
  { match: /llama-3-3/, parent: "llama-3-3", note: "" },
  { match: /llama-3-1/, parent: "llama-3-1", note: "" },
  { match: /llama-3/, parent: "llama-3", note: "" },
  { match: /llama-2/, parent: "llama-3", note: "Llama 2 era — historical baseline; superseded by Llama 3+." },
  { match: /llama-1/, parent: "llama-3", note: "Original Llama — historical; superseded by Llama 2+." },

  // Qwen
  { match: /qwen-3-coder/, parent: "qwen-3", note: "Coding-specialist variant — large-context coder." },
  { match: /qwen-3-vl/, parent: "qwen-3", note: "Vision-language variant of Qwen 3." },
  { match: /qwen3-embedding/, parent: "qwen-3", note: "Embedding model derived from Qwen 3." },
  { match: /qwen-3/, parent: "qwen-3", note: "" },
  { match: /qwen-2-5/, parent: "qwen-2-5", note: "" },
  { match: /qwen-1/, parent: "qwen-2-5", note: "First-generation Qwen — historical; superseded by 2.5+." },

  // DeepSeek
  { match: /deepseek-v4-pro/, parent: "deepseek-r1", note: "Pro tier of V4 — frontier coding/reasoning at open-weights price." },
  { match: /deepseek-v4-flash/, parent: "deepseek-r1", note: "Flash tier of V4 — speed-optimised." },
  { match: /deepseek-v4/, parent: "deepseek-r1", note: "Successor to V3/R1 generation." },
  { match: /deepseek-v3-2/, parent: "deepseek-v3", note: "Refresh of V3 with reasoning capabilities folded in." },
  { match: /deepseek-v3/, parent: "deepseek-v3", note: "" },
  { match: /deepseek-r1-distill/, parent: "deepseek-r1", note: "Distilled smaller variant — R1 reasoning into Llama/Qwen base." },
  { match: /deepseek-r1/, parent: "deepseek-r1", note: "" },
  { match: /deepseek-coder-v2-lite/, parent: "deepseek-coder-v2", note: "Lite variant — 16B with 2.4B active for single-GPU coding." },
  { match: /deepseek-coder-v2/, parent: "deepseek-coder-v2", note: "" },
  { match: /deepseek-v2/, parent: "deepseek-v2", note: "" },
  { match: /deepseek-llm-67b/, parent: "deepseek-v2", note: "Earlier DeepSeek 67B — historical baseline." },
  { match: /deepseek-chat/, parent: "deepseek-r1", note: "Production chat surface for DeepSeek's frontier model." },
  { match: /deepseek-reasoner/, parent: "deepseek-r1", note: "Production reasoning surface for DeepSeek's R1-class model." },

  // Grok
  { match: /grok-4-1/, parent: "grok-4", note: "Mid-cycle refresh of Grok 4." },
  { match: /grok-4-heavy/, parent: "grok-4", note: "Heavy variant — runs multiple reasoning agents in parallel." },
  { match: /grok-4/, parent: "grok-4", note: "" },
  { match: /grok-3/, parent: "grok-3", note: "" },

  // Mistral
  { match: /mistral-large-3/, parent: "mistral-large-3", note: "" },
  { match: /mistral-medium-3/, parent: "mistral-large-3", note: "Medium tier — cheaper/faster than Large 3." },
  { match: /mistral-medium/, parent: "mistral-large-2", note: "Medium tier of the Mistral Large 2 generation." },
  { match: /mistral-small/, parent: "mistral-large-2", note: "Small tier — laptop-class deployment." },
  { match: /mistral-large-2/, parent: "mistral-large-2", note: "" },
  { match: /mistral-large/, parent: "mistral-large-2", note: "" },
  { match: /mistral-7b/, parent: "mixtral", note: "Original 7B dense Mistral that preceded Mixtral." },
  { match: /mixtral/, parent: "mixtral", note: "" },
  { match: /pixtral/, parent: "pixtral-large", note: "" },

  // Phi
  { match: /phi-4/, parent: "phi-4", note: "" },
  { match: /phi-3/, parent: "phi-3", note: "" },

  // Gemma
  { match: /gemma-3n/, parent: "gemma-3", note: "Edge-optimised Gemma 3 variant." },
  { match: /gemma-3/, parent: "gemma-3", note: "" },
  { match: /gemma-2/, parent: "gemma-3", note: "Earlier Gemma 2 family — superseded by Gemma 3." },
  { match: /gemma/, parent: "gemma-3", note: "" },

  // Cohere
  { match: /command-r-plus/, parent: "command-r-plus", note: "" },
  { match: /command-r/, parent: "command-r-plus", note: "Smaller / cheaper Command R — tier below Command R+." },
  { match: /command-a/, parent: "command-r-plus", note: "Refreshed Command-A enterprise tier." },
  { match: /command/, parent: "command-r-plus", note: "" },

  // Hunyuan
  { match: /hunyuan-video/, parent: "hunyuan-video", note: "" },
  { match: /hunyuan-large/, parent: "hunyuan-large", note: "" },
  { match: /hunyuan/, parent: "hunyuan-large", note: "" },

  // Doubao
  { match: /doubao/, parent: "doubao-1-5", note: "" },

  // Kimi
  { match: /kimi-k2/, parent: "kimi-k2", note: "" },
  { match: /kimi/, parent: "kimi-k2", note: "" },

  // Yi
  { match: /yi-/, parent: "yi-34b", note: "" },

  // Suno
  { match: /suno-v/, parent: "suno-v3", note: "" },
  { match: /suno/, parent: "suno-v3", note: "" },

  // Sora
  { match: /sora-2/, parent: "sora-2", note: "" },
  { match: /sora/, parent: "sora-2", note: "Earlier Sora preview — succeeded by Sora 2." },

  // Veo
  { match: /veo-3/, parent: "veo-3", note: "" },
  { match: /veo/, parent: "veo-3", note: "" },

  // Flux
  { match: /flux-2/, parent: "flux-2", note: "" },
  { match: /flux/, parent: "flux-2", note: "Earlier FLUX.1 generation — superseded by FLUX.2." },

  // Midjourney
  { match: /midjourney/, parent: "midjourney-v7", note: "" },

  // Kling
  { match: /kling/, parent: "kling-2", note: "" },

  // GPT-image
  { match: /gpt-image/, parent: "gpt-image-1", note: "" },

  // GPT-4 / older OpenAI
  { match: /gpt-4o/, parent: "gpt-4o", note: "" },
  { match: /gpt-4/, parent: "gpt-4", note: "" },
  { match: /gpt-3/, parent: "gpt-4", note: "Earlier GPT-3 generation — historical baseline." },
  { match: /gpt-2/, parent: "gpt-4", note: "Original GPT-2 — historical; preceded ChatGPT." },
  { match: /gpt-1/, parent: "gpt-4", note: "Original GPT-1 — historical; foundational paper." },
  { match: /chatgpt/, parent: "gpt-4", note: "ChatGPT product launch surface for GPT-3.5 / 4." },
  { match: /instructgpt/, parent: "gpt-4", note: "InstructGPT — RLHF precursor that fed into ChatGPT/GPT-4." },

  // Stable Diffusion / Stability
  { match: /stable-diffusion/, parent: "stable-diffusion", note: "" },
  { match: /stable-audio/, parent: "stable-diffusion", note: "Stability's audio diffusion sibling — same lab heritage." },

  // Whisper / OpenAI audio
  { match: /whisper/, parent: "whisper", note: "" },

  // Molmo
  { match: /molmo/, parent: "molmo", note: "" },

  // Pi-Zero / Physical Intelligence
  { match: /pi-zero/, parent: "molmo", note: "Physical Intelligence's robot foundation model — separate field but adjacent open ecosystem." },
];

// Read parent reviews from MDX once and cache.
const reviewsCache = new Map();

async function loadParentReviews(parentSlug) {
  if (reviewsCache.has(parentSlug)) return reviewsCache.get(parentSlug);
  // Find the file by matching slug regardless of date prefix.
  const files = await fs.readdir(NODES_DIR);
  const file = files.find((f) => f.endsWith(`-${parentSlug}.mdx`));
  if (!file) {
    reviewsCache.set(parentSlug, null);
    return null;
  }
  const content = await fs.readFile(path.join(NODES_DIR, file), "utf8");
  // Crude YAML extraction: find `  reviews:` line, then read until the next
  // non-indented top-level key.
  const lines = content.split("\n");
  const start = lines.findIndex((l) => l === "  reviews:");
  if (start === -1) {
    reviewsCache.set(parentSlug, null);
    return null;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^[A-Za-z]/.test(line) || line === "---") {
      end = i;
      break;
    }
  }
  const block = lines.slice(start, end).join("\n");
  reviewsCache.set(parentSlug, block);
  return block;
}

function makeCompactReviews(parentBlock, variantNote, slug) {
  // Take the parent's first 3 feels_like, 3 best_for, 2 not_ideal_for, all sources.
  // Then prepend the variant note as a feels_like bullet so the variant page
  // signals what's specific.
  const lines = parentBlock.split("\n");
  function take(section, n) {
    const out = [];
    let inSec = false;
    for (const l of lines) {
      if (l.trim() === `${section}:`) { inSec = true; continue; }
      if (inSec && /^    [a-z_]+:/.test(l)) break;
      if (inSec && l.trim().startsWith("- ") && out.length < n) out.push(l);
    }
    return out;
  }
  const feels = take("feels_like", 3);
  const best = take("best_for", 3);
  const notIdeal = take("not_ideal_for", 2);
  // Sources block — copy verbatim.
  const srcStart = lines.findIndex((l) => l.trim() === "sources:");
  const srcLines = srcStart >= 0 ? lines.slice(srcStart) : [];

  const out = [];
  out.push("  reviews:");
  out.push("    feels_like:");
  if (variantNote) out.push(`      - "${variantNote}"`);
  for (const f of feels) out.push(f);
  out.push("    best_for:");
  for (const b of best) out.push(b);
  if (notIdeal.length) {
    out.push("    not_ideal_for:");
    for (const n of notIdeal) out.push(n);
  }
  if (srcLines.length) {
    out.push("    " + srcLines[0].trim());
    for (const s of srcLines.slice(1)) out.push(s);
  }
  return out.join("\n");
}

function genericReviews(node) {
  const cats = (node.frontmatter.match(/category:\s*\n([\s\S]*?)\n[a-z]/i) || ["", ""])[1] || "";
  const isPaper = /paper/.test(cats);
  const isVision = /\bcv\b|vision/.test(cats);
  const isAudio = /audio/.test(cats);
  const isVideo = /video/.test(cats);
  const isAgent = /agents?/.test(cats);
  const isCode = /code|coding/.test(cats);
  const org = (node.frontmatter.match(/^org:\s*(.+)$/m) || [, "the lab"])[1].trim();
  const title = (node.frontmatter.match(/^title:\s*(.+)$/m) || [, "this model"])[1].trim().replace(/^"(.*)"$/, "$1");

  let cat = "Language model";
  if (isPaper) cat = "Research paper";
  else if (isAudio) cat = "Audio model";
  else if (isVideo) cat = "Video model";
  else if (isVision) cat = "Vision-language model";

  const out = [];
  out.push("  reviews:");
  out.push("    feels_like:");
  if (isPaper) {
    out.push(`      - "Foundational paper from ${org} — see the citations block for the canonical reference"`);
    out.push(`      - "Establishes ideas later picked up by production models in the AI Evolution Tree"`);
    out.push(`      - "Reception: well-cited in the field; see the linked citations and DOI/arXiv for primary sources"`);
  } else {
    out.push(`      - "${cat} from ${org} — see the linked sources below for benchmark and review coverage"`);
    if (isCode) out.push(`      - "Code-leaning workloads are the typical fit per the published model card"`);
    if (isAgent) out.push(`      - "Tool-use and agent loops are the typical fit per the published model card"`);
    if (isVision) out.push(`      - "Vision and multimodal tasks are the typical fit per the published model card"`);
    if (isAudio) out.push(`      - "Audio synthesis or transcription per the published model card"`);
    if (isVideo) out.push(`      - "Video generation per the published model card"`);
  }
  out.push("    best_for:");
  if (isCode) out.push(`      - "Coding workflows that match the model's published benchmarks"`);
  if (isAgent) out.push(`      - "Agent / tool-use workflows that match the model's published benchmarks"`);
  if (isVision) out.push(`      - "Vision tasks (charts, documents, images) per the model card"`);
  if (isAudio) out.push(`      - "Audio synthesis / transcription tasks per the model card"`);
  if (isVideo) out.push(`      - "Video generation per the model card"`);
  if (!isCode && !isAgent && !isVision && !isAudio && !isVideo)
    out.push(`      - "General-purpose tasks within ${org}'s deployment footprint"`);
  out.push(`      - "See the model spec and sources block for benchmarked use cases"`);
  out.push("    not_ideal_for:");
  out.push(`      - "Tasks far outside the modalities listed in this model's spec"`);
  out.push(`      - "Workflows where a more recent successor in the same family scores higher"`);
  return out.join("\n");
}

async function processFile(filename) {
  const filepath = path.join(NODES_DIR, filename);
  const content = await fs.readFile(filepath, "utf8");
  if (content.includes("\n  reviews:")) return { filename, status: "skipped" };

  // Only operate on the YAML frontmatter (between first two `---`).
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { filename, status: "no-frontmatter" };
  const frontmatter = fmMatch[1];

  const slugMatch = frontmatter.match(/^slug:\s*(.+)$/m);
  if (!slugMatch) return { filename, status: "no-slug" };
  const slug = slugMatch[1].trim();

  // Decide what reviews block to insert.
  let reviewsBlock = null;
  let kind = "generic";
  for (const m of PARENT_MATCHERS) {
    if (m.match.test(slug)) {
      const parent = await loadParentReviews(m.parent);
      if (parent) {
        reviewsBlock = makeCompactReviews(parent, m.note, slug);
        kind = `variant-of-${m.parent}`;
        break;
      }
    }
  }
  if (!reviewsBlock) {
    reviewsBlock = genericReviews({ frontmatter });
  }

  // Find the right insertion point in the YAML — before `public_view:` (top-level)
  // and inside the model_spec block. We look for the LAST `  last_verified_at:`
  // line inside model_spec (the frontmatter has some at deeper indentation that
  // we don't want — model_spec.last_verified_at is always at exactly 2-space
  // indent and immediately precedes either the next model_spec field or the
  // top-level `public_view:` / `title_zh:` etc.).
  //
  // Strategy: find the first 2-space-indented `last_verified_at:` line that is
  // NOT preceded by 6+ spaces (those are inside sources arrays).
  const lines = content.split("\n");
  let insertIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Match exactly 2 spaces + last_verified_at:
    if (/^  last_verified_at:/.test(l)) {
      insertIdx = i + 1; // insert AFTER this line
      // Keep going to find the LAST one (model_spec scope tends to have it last)
    }
  }
  if (insertIdx === -1) {
    // Fallback: insert before the first top-level `public_view:` line.
    insertIdx = lines.findIndex((l) => l === "public_view:");
    if (insertIdx === -1) return { filename, status: "no-insertion-point" };
  }

  // If a model has top-level extra keys after model_spec but before public_view
  // (like `title_zh:` or `availability:` at the wrong indent — actually
  // availability is inside spec), the simple insert before public_view would
  // place reviews outside model_spec. Detect that by checking whether the line
  // before public_view starts with 2 spaces (inside model_spec) — if not, we
  // need to walk backward to find the last model_spec line.
  while (
    insertIdx > 0 &&
    !/^  [a-zA-Z_]/.test(lines[insertIdx - 1]) &&
    !/^    /.test(lines[insertIdx - 1]) &&
    !/^      /.test(lines[insertIdx - 1])
  ) {
    insertIdx--;
  }

  const before = lines.slice(0, insertIdx).join("\n");
  const after = lines.slice(insertIdx).join("\n");
  const updated = `${before}\n${reviewsBlock}\n${after}`;
  // Cleanup: avoid double blank lines we may have created.
  const cleaned = updated.replace(/\n\n\n+/g, "\n\n");

  await fs.writeFile(filepath, cleaned);
  return { filename, status: "filled", kind };
}

async function main() {
  const files = (await fs.readdir(NODES_DIR))
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .sort();

  const results = { filled: [], skipped: [], failed: [] };
  for (const f of files) {
    try {
      const r = await processFile(f);
      if (r.status === "filled") results.filled.push(r);
      else if (r.status === "skipped") results.skipped.push(r);
      else results.failed.push(r);
    } catch (err) {
      results.failed.push({ filename: f, error: String(err) });
    }
  }

  const variantCount = results.filled.filter((r) => r.kind?.startsWith("variant-of-")).length;
  const genericCount = results.filled.filter((r) => r.kind === "generic").length;
  console.log(`Filled ${results.filled.length} files (${variantCount} variant-style, ${genericCount} generic).`);
  console.log(`Skipped ${results.skipped.length} (already had reviews).`);
  if (results.failed.length) {
    console.log(`Failed ${results.failed.length}:`);
    for (const f of results.failed) console.log(`  ${f.filename}: ${f.status ?? f.error}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
