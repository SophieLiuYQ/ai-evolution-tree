#!/usr/bin/env node
/**
 * rewrite-placeholder-descriptions.mjs
 *
 * Many auto-imported model nodes still ship with a generic placeholder
 * `public_view.plain_english`. This script rewrites those descriptions using
 * the structured metadata we already store per node:
 *   - official homepage (model_spec.homepage)
 *   - Artificial Analysis benchmarks (+ rank/scope strings)
 *   - parameters / context / modalities_in/out / availability / pricing rows
 *
 * The goal is to make the model page readable without inventing facts.
 *
 * Usage:
 *   node scripts/rewrite-placeholder-descriptions.mjs --dry-run
 *   node scripts/rewrite-placeholder-descriptions.mjs
 *   node scripts/rewrite-placeholder-descriptions.mjs --slug=qwen3-5-27b-non-reasoning
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const ARG = {
  dryRun: argv.includes("--dry-run"),
  slug: argv.find((a) => a.startsWith("--slug="))?.split("=")[1],
  limit: Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || null,
};

const PLACEHOLDER_RE = /is an official model release from .*?This node is a canonical record/i;
const GENERATED_RE = /\bIt’s positioned for\b/i;
const NOISY_RE = /(On Artificial Analysis|AA Intelligence Index|Trade-offs:|Modalities:|Key specs:|Practical trade-offs:|Links:)/i;

function titleHead(title) {
  const t = String(title || "").trim();
  if (!t) return "This model";
  return t.split(/\s[—–-]\s/)[0].trim() || t;
}

function firstBench(spec, name) {
  const arr = spec?.benchmarks ?? [];
  return arr.find((b) => String(b?.name || "").toLowerCase() === name.toLowerCase()) ?? null;
}

function anyBench(spec, includes) {
  const arr = spec?.benchmarks ?? [];
  const want = includes.map((s) => s.toLowerCase());
  return arr.find((b) => want.some((w) => String(b?.name || "").toLowerCase().includes(w))) ?? null;
}

function fmtModalList(xs) {
  const arr = Array.isArray(xs) ? xs.filter(Boolean) : [];
  if (!arr.length) return null;
  return arr.join("+");
}

function describeReleaseType(releaseType) {
  if (releaseType === "api") return "an API model";
  if (releaseType === "open_weights") return "an open-weights model";
  if (releaseType === "product") return "a product-integrated model";
  if (releaseType === "paper") return "a research artifact (paper)";
  if (releaseType === "demo") return "a demo / limited-access model";
  return "a model release";
}

function describeBench(b) {
  if (!b?.score) return null;
  const rank = b?.vs_baseline ? ` (${b.vs_baseline})` : "";
  return `${b.score}${rank}`;
}

function capabilityPitch(cats) {
  const s = new Set(Array.isArray(cats) ? cats : []);
  // Keep this conservative: talk about *what it’s positioned for*,
  // not what it definitively “beats”.
  const bits = [];
  if (s.has("agents")) bits.push("tool use and multi-step workflows");
  if (s.has("reasoning")) bits.push("hard reasoning and planning");
  if (s.has("coding") || s.has("code")) bits.push("coding tasks");
  if (s.has("multimodal") || s.has("cv") || s.has("vision")) bits.push("vision + text tasks");
  if (s.has("audio")) bits.push("audio tasks");
  if (!bits.length && s.has("nlp")) bits.push("general text tasks");
  if (!bits.length) return null;
  if (bits.length === 1) return bits[0];
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`;
  return `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
}

function buildPlainEnglish(fm) {
  const spec = fm?.model_spec ?? {};
  const name = titleHead(fm?.title);
  const org = fm?.org || "Unknown org";
  const cats = fm?.category ?? [];

  const parts = [];
  parts.push(`${name} is ${describeReleaseType(spec.release_type)} from ${org}.`);

  const pitch = capabilityPitch(cats);
  if (pitch) {
    parts.push(`It’s positioned for ${pitch}—work that benefits from iteration, not just one-shot answers.`);
  } else {
    parts.push(`It’s positioned for general-purpose use, with the details captured in the specs and benchmark sections below.`);
  }

  return parts.join(" ");
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let changed = 0;
  let seen = 0;
  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf8");
    const { data: fm, content: body } = matter(raw);
    if (!fm?.slug) continue;
    if (ARG.slug && fm.slug !== ARG.slug) continue;

    const plain = fm?.public_view?.plain_english;
    if (typeof plain !== "string" || !(PLACEHOLDER_RE.test(plain) || NOISY_RE.test(plain))) continue;

    const next = buildPlainEnglish(fm);
    const nextFm = {
      ...fm,
      public_view: {
        ...(fm.public_view ?? {}),
        plain_english: next,
      },
    };

    changed++;
    seen++;
    if (!ARG.dryRun) {
      await writeFile(p, matter.stringify(body, nextFm));
    }
    if (ARG.limit && seen >= ARG.limit) break;
  }

  console.log(`rewrite-placeholder-descriptions: ${ARG.dryRun ? "DRY RUN" : "LIVE"}`);
  if (ARG.slug) console.log(`  filter: slug=${ARG.slug}`);
  if (ARG.limit) console.log(`  limit: ${ARG.limit}`);
  console.log(`  updated: ${changed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
