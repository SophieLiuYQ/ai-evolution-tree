#!/usr/bin/env node
/**
 * migrate-availability.mjs
 *
 * One-shot migration: for every node in src/content/nodes/*.mdx, set
 * `model_spec.availability` (a multi-channel array). The reality is many
 * flagship models live in 2–3 channels at once (GPT-5 = api + ChatGPT
 * app; DeepSeek V3 = open_weights + api + chat.deepseek.com), but the
 * old single-valued `release_type` couldn't express that.
 *
 * Strategy: 1:1 from release_type by default + manual MULTI_CHANNEL
 * overrides for flagship models. Manual whitelist beats fragile
 * org+date heuristics — knowing "Llama 3 had no first-party app, Llama 4
 * launched alongside Meta AI app" requires real model knowledge, not
 * a rule.
 *
 * Idempotent: skips nodes that already have `availability` set unless
 * --force is passed.
 *
 * Usage:
 *   node scripts/migrate-availability.mjs --dry-run       # log only
 *   node scripts/migrate-availability.mjs                 # commit
 *   node scripts/migrate-availability.mjs --force         # overwrite existing
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FORCE = argv.includes("--force");

// 1:1 mapping from release_type → primary availability channel
const RELEASE_TO_CHANNEL = {
  api: "api",
  open_weights: "open_weights",
  product: "product",
  paper: "research",
  demo: "demo",
};

// Manual overrides for flagship models that live in MULTIPLE channels.
// Keys are slugs; values are full channel arrays (NOT additions — full
// replacement). Add entries here as new flagship models ship.
//
// Selection criteria for inclusion:
//   • Has a first-party consumer app (ChatGPT, Claude, Gemini, Grok, etc.)
//   • Has a public API endpoint (paid or free)
//   • For open-weights: ALSO has hosted API or first-party chat
//
// When in doubt, leave OUT — under-claiming is honest. The default
// 1:1 fallback applies for everything not listed below.
const MULTI_CHANNEL_OVERRIDES = {
  // ====== OpenAI — ChatGPT app + API ======
  "gpt-3-5-turbo": ["api", "product"],
  "gpt-4": ["api", "product"],
  "gpt-4-turbo": ["api", "product"],
  "gpt-4o": ["api", "product"],
  "o1": ["api", "product"],
  "o3": ["api", "product"],
  "gpt-5": ["api", "product", "enterprise"],
  "gpt-oss": ["open_weights", "api"],
  "sora-2": ["product"],

  // ====== Anthropic — Claude app + API ======
  "claude-1": ["api", "product"],
  "claude-2": ["api", "product"],
  "claude-3": ["api", "product"],
  "claude-3-5-sonnet": ["api", "product"],
  "claude-3-7-sonnet": ["api", "product"],
  "claude-4": ["api", "product", "enterprise"],
  "claude-haiku-4-5": ["api", "product"],
  "claude-sonnet-4-6": ["api", "product", "enterprise"],
  "claude-opus-4-6": ["api", "product", "enterprise"],
  "claude-opus-4-7": ["api", "product", "enterprise"],

  // ====== Google / DeepMind — Gemini app + API ======
  "gemini-1": ["api", "product"],
  "gemini-1-5": ["api", "product"],
  "gemini-2-5-pro": ["api", "product", "enterprise"],
  "gemini-3-pro": ["api", "product", "enterprise"],
  "veo-3": ["api", "product"],
  "lyria-3": ["api", "product"],
  "nano-banana-pro": ["api", "product"],

  // ====== xAI — Grok app + API ======
  "grok-3": ["api", "product"],
  "grok-4": ["api", "product"],
  "grok-4-1": ["api", "product"],

  // ====== Meta — Meta AI app, no public API ======
  "llama-1": ["open_weights"],
  "llama-2": ["open_weights"],
  "llama-3": ["open_weights"],
  "llama-4": ["open_weights", "product"],

  // ====== DeepSeek — Open + API + chat.deepseek.com ======
  "deepseek-v3": ["open_weights", "api", "product"],

  // ====== Alibaba — Open + API + 通义 app ======
  "qwen-3": ["open_weights", "api", "product"],
  "qwen-3-coder": ["open_weights", "api"],

  // ====== Moonshot — Open + Kimi app + API ======
  "kimi-k2": ["open_weights", "api", "product"],
  "kimi-k2-thinking": ["open_weights", "api", "product"],
  "kimi-chat": ["product", "api"],

  // ====== Baidu — ERNIE Bot ======
  "baidu-ernie-4": ["api", "product"],

  // ====== Mistral — Le Chat + API ======
  "mistral-large-2": ["api", "product"],

  // ====== Image / video labs — product only ======
  "stable-diffusion": ["open_weights", "product"],
  "midjourney": ["product"],
  "flux-2": ["api", "product"],
  "ideogram-3": ["api", "product"],
  "runway-gen-4": ["api", "product"],
  "kling-2": ["api", "product"],
  "ltx-2": ["open_weights", "api"],
  "hunyuan-video": ["open_weights", "api"],

  // ====== Audio ======
  "suno-v5": ["api", "product"],
  "elevenlabs-v3": ["api", "product"],

  // ====== Code ======
  "cursor-composer": ["product"],

  // ====== Embedding / vision ======
  "sam-3": ["open_weights", "api"],

  // ====== Specialized large open ======
  "ling-ring-1t": ["open_weights", "api"],
};

function deriveAvailability(slug, release_type) {
  if (MULTI_CHANNEL_OVERRIDES[slug]) return MULTI_CHANNEL_OVERRIDES[slug];
  const ch = RELEASE_TO_CHANNEL[release_type];
  return ch ? [ch] : [];
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );
  let migrated = 0;
  let skipped = 0;
  let multi = 0;
  for (const file of files) {
    const path = join(NODES_DIR, file);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.slug) continue;

    const existing = fm.model_spec?.availability;
    if (existing && existing.length && !FORCE) {
      skipped++;
      continue;
    }

    const release_type = fm.model_spec?.release_type;
    if (!release_type) {
      skipped++;
      continue;
    }

    const availability = deriveAvailability(fm.slug, release_type);
    if (!availability.length) {
      skipped++;
      continue;
    }

    if (availability.length > 1) multi++;

    const newFm = {
      ...fm,
      model_spec: { ...fm.model_spec, availability },
    };

    if (DRY) {
      console.log(`  ${fm.slug.padEnd(30)} ${availability.join(" + ")}`);
    } else {
      await writeFile(path, matter.stringify(body, newFm));
    }
    migrated++;
  }

  console.log(`\nSummary:`);
  console.log(`  ${migrated} migrated  (${multi} are multi-channel)`);
  console.log(`  ${skipped} skipped  (no release_type or already has availability)`);
  if (DRY) console.log(`  DRY RUN — no files written. Drop --dry-run to commit.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
