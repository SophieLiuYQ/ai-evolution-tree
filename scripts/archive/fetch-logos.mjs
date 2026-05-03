#!/usr/bin/env node
// Fetch real org logos from authoritative sources and save them to
// public/logos/<slug>.svg.  Used by src/components/OrgLogo.astro to
// render brand-correct logos in the model-page hero + sidebar.
//
// Sources, in priority order:
//   1. SimpleIcons (simpleicons.org) — CC0-licensed brand SVGs.
//   2. Wikimedia Commons — for orgs SimpleIcons doesn't carry
//      (OpenAI, Microsoft, IBM, Amazon, Anthropic, etc.)
//   3. Curated official-site URLs — last resort, when neither catalog has it.
//
// Re-runnable: skips files that already exist; pass --force to overwrite.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_DIR = path.resolve(__dirname, "..", "public", "logos");
const FORCE = process.argv.includes("--force");

// Slug used for the file name on disk. Keep in sync with the keys in
// src/lib/org-logos.ts (the OrgLogo component derives the file path
// from the org name via the same slugify function).
const slugify = (s) =>
  s.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Each entry: { org: <ORGS enum value>, sources: [url, url, ...] }
// Sources are tried in order; first 200 wins.
const LOGO_SOURCES = [
  { org: "Anthropic",       sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/anthropic.svg",
  ]},
  { org: "OpenAI",          sources: [
    // SimpleIcons removed it, but Wikimedia carries the original.
    "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg",
    "https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg",
  ]},
  { org: "Google",          sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/google.svg",
  ]},
  { org: "Google DeepMind", sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/googlegemini.svg",
  ]},
  { org: "DeepMind",        sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/googlegemini.svg",
  ]},
  { org: "Google Brain",    sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/google.svg",
  ]},
  { org: "Meta AI",         sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/meta.svg",
  ]},
  { org: "Microsoft",       sources: [
    "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
  ]},
  { org: "Mistral AI",      sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/mistralai.svg",
  ]},
  { org: "xAI",             sources: [
    "https://upload.wikimedia.org/wikipedia/commons/2/29/Grok_logo.svg",
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/x.svg",
  ]},
  { org: "DeepSeek",        sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/deepseek.svg",
  ]},
  { org: "Alibaba",         sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/qwen.svg",
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/alibabacloud.svg",
  ]},
  { org: "Nvidia",          sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/nvidia.svg",
  ]},
  { org: "Amazon",          sources: [
    "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
  ]},
  { org: "Cohere",          sources: [
    "https://upload.wikimedia.org/wikipedia/commons/0/02/Cohere_logo.svg",
  ]},
  { org: "IBM",             sources: [
    "https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg",
  ]},
  { org: "Apple",           sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/apple.svg",
  ]},
  { org: "Liquid AI",       sources: [
    "https://liquid.ai/favicon.ico", // last-resort
  ]},
  { org: "AI21 Labs",       sources: [
    "https://upload.wikimedia.org/wikipedia/commons/1/16/AI21_Labs_logo.svg",
  ]},
  { org: "Perplexity",      sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/perplexity.svg",
  ]},
  { org: "MiniMax",         sources: [
    // Their site uses an SVG mark
    "https://www.minimax.io/_next/static/media/logo.07f0e3b5.svg",
  ]},
  { org: "Hugging Face",    sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/huggingface.svg",
  ]},
  { org: "Stability AI",    sources: [
    "https://upload.wikimedia.org/wikipedia/commons/8/89/Stability_AI_logo.svg",
  ]},
  { org: "Black Forest Labs", sources: [
    "https://blackforestlabs.ai/favicon.ico",
  ]},
  { org: "Tencent",         sources: [
    "https://upload.wikimedia.org/wikipedia/commons/4/49/Tencent_Logo.svg",
  ]},
  { org: "Baidu",           sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/baidu.svg",
  ]},
  { org: "Stepfun",         sources: [
    "https://www.stepfun.com/favicon.ico",
  ]},
  { org: "Moonshot AI",     sources: [
    "https://upload.wikimedia.org/wikipedia/commons/8/87/Kimi_logo.svg",
  ]},
  { org: "ByteDance",       sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/bytedance.svg",
  ]},
  { org: "Tsinghua / Zhipu", sources: [
    "https://chatglm.cn/favicon.ico",
  ]},
  { org: "Allen AI",        sources: [
    "https://allenai.org/favicon.ico",
  ]},
  { org: "Salesforce",      sources: [
    "https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg",
  ]},
  { org: "Hume AI",         sources: [
    "https://hume.ai/favicon.svg",
  ]},
  { org: "Suno",            sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/suno.svg",
  ]},
  { org: "Runway",          sources: [
    "https://runwayml.com/icons/favicon.svg",
  ]},
  { org: "Midjourney",      sources: [
    "https://www.midjourney.com/favicon.ico",
  ]},
  { org: "Luma AI",         sources: [
    "https://lumalabs.ai/favicon.ico",
  ]},
  { org: "ElevenLabs",      sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/elevenlabs.svg",
  ]},
  { org: "01.AI",           sources: [
    "https://www.01.ai/favicon.ico",
  ]},
  { org: "Databricks",      sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/databricks.svg",
  ]},
  { org: "Adobe",           sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/adobe.svg",
  ]},
  { org: "Tesla",           sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/tesla.svg",
  ]},
  { org: "Huawei",          sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/huawei.svg",
  ]},
  { org: "Xiaomi",          sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/xiaomi.svg",
  ]},
  { org: "Snowflake",       sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/snowflake.svg",
  ]},
  { org: "Together AI",     sources: [
    "https://www.together.ai/favicon.svg",
  ]},
  { org: "Pika Labs",       sources: [
    "https://pika.art/favicon.ico",
  ]},
  { org: "Ideogram",        sources: [
    "https://ideogram.ai/favicon.ico",
  ]},
  { org: "Recraft",         sources: [
    "https://www.recraft.ai/favicon.ico",
  ]},
  { org: "Synthesia",       sources: [
    "https://www.synthesia.io/favicon.ico",
  ]},
  { org: "Boston Dynamics", sources: [
    "https://bostondynamics.com/favicon.ico",
  ]},
  { org: "Cartesia",        sources: [
    "https://cartesia.ai/favicon.ico",
  ]},
  { org: "Cognition",       sources: [
    "https://www.cognition.ai/favicon.ico",
  ]},
  { org: "Figure AI",       sources: [
    "https://www.figure.ai/favicon.ico",
  ]},
  { org: "Lightricks",      sources: [
    "https://www.lightricks.com/favicon.ico",
  ]},
  { org: "MIT",             sources: [
    "https://upload.wikimedia.org/wikipedia/commons/0/0c/MIT_logo.svg",
  ]},
  { org: "Physical Intelligence", sources: [
    "https://www.physicalintelligence.company/favicon.ico",
  ]},
  { org: "Sesame",          sources: [
    "https://www.sesame.com/favicon.ico",
  ]},
  { org: "Tencent",         sources: [
    "https://upload.wikimedia.org/wikipedia/commons/4/49/Tencent_Logo.svg",
  ]},
  { org: "Unitree",         sources: [
    "https://www.unitree.com/favicon.ico",
  ]},
  { org: "Voyage AI",       sources: [
    "https://www.voyageai.com/favicon.ico",
  ]},
  { org: "Wayve",           sources: [
    "https://wayve.ai/favicon.ico",
  ]},
  { org: "Writer",          sources: [
    "https://writer.com/favicon.ico",
  ]},
  { org: "Hedra",           sources: [
    "https://www.hedra.com/favicon.ico",
  ]},
  { org: "Nari Labs",       sources: [
    "https://nari-labs.com/favicon.ico",
  ]},
  { org: "Reka AI",         sources: [
    "https://www.reka.ai/favicon.ico",
  ]},
  { org: "Hugging Face",    sources: [
    "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/huggingface.svg",
  ]},
  { org: "Kuaishou",        sources: [
    "https://kling.kuaishou.com/favicon.ico",
  ]},
  { org: "EleutherAI",      sources: [
    "https://www.eleuther.ai/favicon.ico",
  ]},
  { org: "BAAI",            sources: [
    "https://www.baai.ac.cn/favicon.ico",
  ]},
  { org: "Shanghai AI Lab", sources: [
    "https://internlm.intern-ai.org.cn/favicon.ico",
  ]},
];

async function fetchOne(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "ai-tree-logo-fetcher/1.0 (+https://ai-tree.dev)" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, contentType: res.headers.get("content-type") ?? "" };
  } catch (err) {
    return null;
  }
}

function isSvg(buf, ct) {
  if (ct.includes("svg")) return true;
  // sniff: SVG starts with "<?xml" or "<svg"
  const head = buf.slice(0, 200).toString("utf8").trim();
  return head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg");
}

async function main() {
  await fs.mkdir(LOGO_DIR, { recursive: true });
  const summary = { ok: [], skipped: [], failed: [] };
  const manifest = {}; // org → { slug, ext }

  for (const { org, sources } of LOGO_SOURCES) {
    const slug = slugify(org);
    if (!slug) continue;

    // Decide extension by trying SVG first, then ICO/PNG.
    const svgPath = path.join(LOGO_DIR, `${slug}.svg`);
    const icoPath = path.join(LOGO_DIR, `${slug}.ico`);
    const pngPath = path.join(LOGO_DIR, `${slug}.png`);
    if (!FORCE) {
      const exists = await Promise.all([
        fs.access(svgPath).then(() => true, () => false),
        fs.access(icoPath).then(() => true, () => false),
        fs.access(pngPath).then(() => true, () => false),
      ]);
      if (exists.some(Boolean)) {
        summary.skipped.push(org);
        continue;
      }
    }

    let saved = false;
    for (const url of sources) {
      const result = await fetchOne(url);
      if (!result) continue;
      const { buf, contentType } = result;
      let ext = "svg";
      if (isSvg(buf, contentType)) ext = "svg";
      else if (contentType.includes("png") || url.endsWith(".png")) ext = "png";
      else if (contentType.includes("icon") || url.endsWith(".ico")) ext = "ico";
      else ext = "svg";
      const outPath = path.join(LOGO_DIR, `${slug}.${ext}`);
      await fs.writeFile(outPath, buf);
      console.log(`  ✓ ${org} → ${slug}.${ext} (${url.slice(0, 60)}…)`);
      summary.ok.push(org);
      manifest[org] = { slug, ext };
      saved = true;
      break;
    }
    if (!saved) {
      console.warn(`  ✗ ${org} (no source returned 200)`);
      summary.failed.push(org);
    }
  }

  // Always rebuild manifest from the contents of the logo directory so
  // skipped (already-on-disk) entries still appear. Auto-detects ext by
  // probing for svg, png, ico in that order.
  for (const { org } of LOGO_SOURCES) {
    if (manifest[org]) continue;
    const slug = slugify(org);
    for (const ext of ["svg", "png", "ico"]) {
      const p = path.join(LOGO_DIR, `${slug}.${ext}`);
      try {
        await fs.access(p);
        manifest[org] = { slug, ext };
        break;
      } catch { /* not found */ }
    }
  }

  // Write the manifest as a TS module the Astro components can import.
  const manifestPath = path.resolve(__dirname, "..", "src", "lib", "logo-manifest.ts");
  const lines = [
    "// AUTO-GENERATED by scripts/fetch-logos.mjs — do not edit by hand.",
    "// Regenerate with `node scripts/fetch-logos.mjs`.",
    "",
    "export type LogoManifestEntry = { slug: string; ext: \"svg\" | \"png\" | \"ico\" };",
    "",
    "export const LOGO_MANIFEST: Record<string, LogoManifestEntry> = {",
  ];
  const orderedOrgs = Object.keys(manifest).sort();
  for (const org of orderedOrgs) {
    const { slug, ext } = manifest[org];
    lines.push(`  ${JSON.stringify(org)}: { slug: ${JSON.stringify(slug)}, ext: ${JSON.stringify(ext)} },`);
  }
  lines.push("};");
  lines.push("");
  await fs.writeFile(manifestPath, lines.join("\n"));
  console.log(`Manifest: ${manifestPath} (${orderedOrgs.length} entries)`);

  console.log("");
  console.log(`Summary: ${summary.ok.length} fetched · ${summary.skipped.length} skipped · ${summary.failed.length} failed`);
  if (summary.failed.length) {
    console.log("Failed:", summary.failed.join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
