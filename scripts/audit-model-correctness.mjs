#!/usr/bin/env node
/**
 * audit-model-correctness.mjs
 *
 * Lightweight, offline audit for "model info correctness" risks.
 *
 * It intentionally does NOT fetch the network (run validate-homepages.mjs
 * or AA fetch scripts separately). This script flags:
 * - Non-canonical AA/HF URLs
 * - Missing provenance (`model_spec.sources`) when links/spec fields exist
 * - Missing `model_spec.last_verified_at`
 * - Availability relying on release_type fallback (UI-derived)
 * - Benchmark rows lacking both source_url and structured provenance
 * - Series nodes missing `best_for` (underspecified aggregates)
 *
 * Usage:
 *   node scripts/audit-model-correctness.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

function isHttpUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeAaModelUrl(u) {
  return isHttpUrl(u) && u.startsWith("https://artificialanalysis.ai/models/");
}

function looksLikeHfUrl(u) {
  return isHttpUrl(u) && u.startsWith("https://huggingface.co/");
}

function pushWarn(warnings, slug, msg, hard = false) {
  warnings.push({ slug, msg, hard });
}

async function listNodeFiles() {
  const files = await readdir(NODES_DIR);
  return files
    .filter((f) => f.endsWith(".mdx"))
    .filter((f) => !f.startsWith("_"))
    .map((f) => join(NODES_DIR, f));
}

function slugFromPath(path) {
  const base = path.split("/").at(-1) ?? path;
  return base.replace(/\.mdx$/, "");
}

async function main() {
  const STRICT = process.argv.includes("--strict");
  const MIN_DATE_RAW = process.argv.find((a) => a.startsWith("--min-date="))?.split("=")[1];
  const MIN_DATE = MIN_DATE_RAW ? new Date(MIN_DATE_RAW) : null;
  const files = await listNodeFiles();
  const warnings = [];
  let audited = 0;

  for (const path of files) {
    const raw = await readFile(path, "utf-8");
    const fm = matter(raw).data ?? {};
    const slug = typeof fm.slug === "string" ? fm.slug : slugFromPath(path);
    const spec = fm.model_spec;
    if (!spec || typeof spec !== "object") continue;
    audited += 1;

    const releaseType = typeof spec.release_type === "string" ? spec.release_type : null;
    const date = fm.date ? new Date(fm.date) : null;
    if (MIN_DATE && date && Number.isFinite(date.valueOf()) && date < MIN_DATE) continue;
    const isRecent = date ? date >= new Date("2023-01-01") : false;
    const isDeployableSurface =
      releaseType === "api" || releaseType === "open_weights" || releaseType === "product" || releaseType === "demo";
    const hasAnyLink =
      typeof spec.homepage === "string" ||
      typeof spec.github === "string" ||
      typeof spec.aa_url === "string" ||
      typeof spec.hf_url === "string";
    const needsHighCorrectness = isRecent && (isDeployableSurface || hasAnyLink);

    // Link hygiene
    if (typeof spec.aa_url === "string" && !looksLikeAaModelUrl(spec.aa_url)) {
      pushWarn(warnings, slug, `model_spec.aa_url should be https://artificialanalysis.ai/models/... (got ${spec.aa_url})`, true);
    }
    if (typeof spec.hf_url === "string" && !looksLikeHfUrl(spec.hf_url)) {
      pushWarn(warnings, slug, `model_spec.hf_url should be https://huggingface.co/... (got ${spec.hf_url})`, true);
    }

    // Provenance expectations
    const sourcesOk = Array.isArray(spec.sources) && spec.sources.length > 0;
    if (needsHighCorrectness && !sourcesOk) {
      pushWarn(warnings, slug, "model_spec.sources missing (add at least Official docs / AA / HF where applicable)", true);
    }
    if (needsHighCorrectness && !spec.last_verified_at) {
      pushWarn(warnings, slug, "model_spec.last_verified_at missing (spec may be stale)", true);
    }

    // Availability correctness: warn when UI will derive from release_type
    if (needsHighCorrectness && !Array.isArray(spec.availability) && typeof spec.release_type === "string") {
      pushWarn(warnings, slug, `model_spec.availability missing; UI will derive from release_type="${spec.release_type}" (may be inaccurate)`, true);
    }

    // Benchmarks
    if (Array.isArray(spec.benchmarks)) {
      for (const b of spec.benchmarks) {
        if (!b || typeof b !== "object") continue;
        const hasSourceUrl = typeof b.source_url === "string";
        const hasStructuredSource = typeof b.source === "object" && b.source !== null;
        // Always warn, but don't fail strict builds on this alone — many
        // historical/non-AA benchmarks are intentionally narrative.
        if (needsHighCorrectness && !hasSourceUrl && !hasStructuredSource) {
          pushWarn(warnings, slug, `benchmark "${b.name ?? "?"}" missing source_url/source (risk of stale or untraceable score)`, false);
        }
      }
    }

    // Series nodes: expect best_for to avoid underspecified aggregates.
    if (typeof fm.title === "string" && fm.title.includes("Series") && !spec.best_for) {
      pushWarn(warnings, slug, 'Series node missing model_spec.best_for (needs “what this series is best for”)');
    }
  }

  warnings.sort((a, b) => a.slug.localeCompare(b.slug));
  console.log(`Audited ${audited} nodes with model_spec.`);

  if (!warnings.length) {
    console.log("OK: no correctness warnings.");
    process.exit(0);
  }

  console.log(`\nFound ${warnings.length} potential correctness issues:\n`);
  for (const w of warnings) console.log(`- ${w.slug}: ${w.msg}`);
  if (STRICT && warnings.some((w) => w.hard)) process.exitCode = 1;
}

await main();
