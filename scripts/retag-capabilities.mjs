#!/usr/bin/env node
/**
 * retag-capabilities.mjs — one-shot retagging to fix Capabilities filter.
 *
 * Five fixes:
 *   1. Coding: ensure ~36 coding-focused models have `code` in category.
 *      Consolidate stray `coding` → `code`.
 *   2. Image gen: introduce `image_gen` for text-to-image / image generators.
 *   3. Robotics: introduce `robotics` for embodied / robot foundation models.
 *   4. Embedding: introduce `embedding` for embedding / retrieval / reranker models.
 *   5. (NLP filter dropped at UI level — no MDX changes needed.)
 *
 * Tag policy: add the new tag at the head of category[] so it appears first
 * in chips, but preserve existing tags. Idempotent — re-runs are safe.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

const NODES_DIR = "src/content/nodes";

// ---------- 1. Coding ----------
// Slug-pattern + org/family signals. Aim is "primarily coding model", not
// "frontier model that does coding well" — the latter is half the tree.
const CODING_SLUG_RE =
  /^(?:[0-9]+-[0-9]+-)?(?:.*-)?(?:codex|coder|codestral|devstral|devin|seed-code|code-fast|code-llama|starcoder|magicoder|wizardcoder|granite-code|polycoder|incoder|codegen|santacoder|replit-code|codet5|stablelm-code|aider|cursor|continue-dev|github-copilot)(?:-|\.|$)/i;

// ---------- 2. Image generation ----------
// Generative image models — distinct from "vision" (cv = image
// understanding). Pattern matches model lines like Midjourney, DALL-E,
// FLUX, Ideogram, Imagen, Stable Diffusion, Recraft, Lumiere image,
// Gemini Image / Flash Image, etc.
const IMAGE_GEN_SLUG_RE =
  /^(?:[0-9]+-[0-9]+-)?(?:.*-)?(?:midjourney|dall-?e|imagen(?:-|$)|flux|ideogram|recraft|stable-?diffusion|sd-?(?:xl|3)|kandinsky|playground-?v|leonardo|adobe-firefly|hi-?dream|reve|gpt-image|gemini.*-image|flash.*image|firefly|nano-banana|hidream|reframe|pixart|playgroundai|emu(?:-|$)|pixel-?dreams)(?:-|\.|$)/i;

// ---------- 3. Robotics ----------
// Embodied / humanoid / manipulation policies and robot foundation models.
const ROBOTICS_SLUG_RE =
  /^(?:[0-9]+-[0-9]+-)?(?:.*-)?(?:pi-?(?:zero|0|1|0-?5)|figure-?(?:helix|02|03)|groot|gemini-?robotics|nvidia-groot|rt-?(?:1|2|x|h)|spot|atlas|unitree|optimus|aloha|isaac-?gr00t|helix|smolvla|openvla|cogact|octo-?policy)(?:-|\.|$)/i;

// Also: org="Boston Dynamics" / "Figure AI" / "Physical Intelligence" / "Unitree"
const ROBOTICS_ORGS = new Set([
  "Boston Dynamics",
  "Figure AI",
  "Physical Intelligence",
  "Unitree",
]);

// ---------- 4. Embedding / Retrieval ----------
const EMBEDDING_SLUG_RE =
  /^(?:[0-9]+-[0-9]+-)?(?:.*-)?(?:embedding|embed-?(?:v|3)|voyage|bge-?|e5(?:-|$)|gte(?:-|$)|jina(?:-?embed)?|rerank|reranker|cohere-?embed|text-embedding|nomic-?embed|gemini-?embed|qwen.?embedding|gritlm)(?:-|\.|$)/i;

// ---------- helpers ----------
function parseCategoryBlock(raw) {
  // Find the `category:` block, return {indices, items, indent}
  const lines = raw.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^category:/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const items = [];
  let end = start + 1;
  for (; end < lines.length; end++) {
    const m = lines[end].match(/^(\s+)-\s+(.+)$/);
    if (!m) break;
    items.push(m[2].trim().replace(/^['"]|['"]$/g, ""));
  }
  return { start, end, items };
}

function rewriteCategory(raw, newItems) {
  const block = parseCategoryBlock(raw);
  if (!block) return raw;
  const lines = raw.split("\n");
  const replacement = ["category:", ...newItems.map((c) => `  - ${c}`)];
  lines.splice(block.start, block.end - block.start, ...replacement);
  return lines.join("\n");
}

function ensureTag(items, tag) {
  return items.includes(tag) ? items : [tag, ...items];
}

function replaceTag(items, from, to) {
  return items.map((c) => (c === from ? to : c));
}

function getOrg(raw) {
  const m = raw.match(/^org:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  return m ? m[1].trim() : null;
}

// ---------- main ----------
const files = (await readdir(NODES_DIR))
  .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));

let codingAdded = 0;
let codingConsolidated = 0;
let imageGenAdded = 0;
let roboticsAdded = 0;
let embeddingAdded = 0;
const touched = new Set();

for (const f of files) {
  const path = join(NODES_DIR, f);
  let raw = await readFile(path, "utf8");
  const block = parseCategoryBlock(raw);
  if (!block) continue;
  let items = [...block.items];
  const before = JSON.stringify(items);
  const org = getOrg(raw);

  // 1. Coding consolidation
  if (items.includes("coding") && !items.includes("code")) {
    items = replaceTag(items, "coding", "code");
    codingConsolidated++;
  } else if (items.includes("coding")) {
    items = items.filter((c) => c !== "coding");
    codingConsolidated++;
  }

  // 1. Coding tag
  if (CODING_SLUG_RE.test(f) && !items.includes("code")) {
    items = ensureTag(items, "code");
    codingAdded++;
  }

  // 2. Image gen
  if (IMAGE_GEN_SLUG_RE.test(f) && !items.includes("image_gen")) {
    items = ensureTag(items, "image_gen");
    imageGenAdded++;
  }

  // 3. Robotics
  const isRoboticsByOrg = org && ROBOTICS_ORGS.has(org);
  if ((ROBOTICS_SLUG_RE.test(f) || isRoboticsByOrg) && !items.includes("robotics")) {
    items = ensureTag(items, "robotics");
    roboticsAdded++;
  }

  // 4. Embedding
  if (EMBEDDING_SLUG_RE.test(f) && !items.includes("embedding")) {
    items = ensureTag(items, "embedding");
    embeddingAdded++;
  }

  if (JSON.stringify(items) !== before) {
    raw = rewriteCategory(raw, items);
    await writeFile(path, raw);
    touched.add(f);
  }
}

console.log("Capability retag summary");
console.log("  code added       :", codingAdded);
console.log("  coding→code      :", codingConsolidated);
console.log("  image_gen added  :", imageGenAdded);
console.log("  robotics added   :", roboticsAdded);
console.log("  embedding added  :", embeddingAdded);
console.log("  files touched    :", touched.size);
