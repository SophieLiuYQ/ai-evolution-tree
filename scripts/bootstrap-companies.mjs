#!/usr/bin/env node
/**
 * bootstrap-companies.mjs
 *
 * Ensures every org in `src/content.config.ts` ORGS enum has a corresponding
 * `src/content/companies/{slug}.mdx` entry.
 *
 * This does NOT attempt to discover all models. It only creates a place for
 * them to live (company page + catalog).
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CONTENT_CONFIG = join(REPO_ROOT, "src", "content.config.ts");
const COMPANIES_DIR = join(REPO_ROOT, "src", "content", "companies");

const argv = process.argv.slice(2);
const ARG = { dryRun: argv.includes("--dry-run") };

const log = (...a) => console.log(...a);

const kebab = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/['"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function extractOrgs(ts) {
  // Very small parser: find `const ORGS = [` and capture string literals.
  const start = ts.indexOf("const ORGS = [");
  if (start === -1) return [];
  const end = ts.indexOf("] as const", start);
  if (end === -1) return [];
  const chunk = ts.slice(start, end);
  const out = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(chunk))) out.push(m[1]);
  return out;
}

async function main() {
  await mkdir(COMPANIES_DIR, { recursive: true });
  const ts = await readFile(CONTENT_CONFIG, "utf-8");
  const orgs = extractOrgs(ts);
  if (!orgs.length) {
    console.error("Failed to parse ORGS from src/content.config.ts");
    process.exit(1);
  }

  const existing = new Set(
    (await readdir(COMPANIES_DIR))
      .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
      .map((f) => f.replace(/\.mdx$/, "")),
  );

  let created = 0;
  for (const org of orgs) {
    const slug = kebab(org);
    if (!slug) continue;
    if (existing.has(slug)) continue;

    const fm = [
      "---",
      `slug: ${slug}`,
      `name: ${org}`,
      "orgs:",
      `  - ${org.includes(":") ? `"${org}"` : org}`,
      `summary: Models and releases by ${org}.`,
      `summary_zh: ${org} 的模型与发布动态。`,
      "sources: []",
      "---",
      "",
      "TODO: Add official sources and a `catalog:` list of models.",
      "",
    ].join("\n");

    const outPath = join(COMPANIES_DIR, `${slug}.mdx`);
    log(`+ company stub: ${slug}`);
    created++;
    existing.add(slug);
    if (!ARG.dryRun) await writeFile(outPath, fm, "utf-8");
  }

  log(`\nSummary:`);
  log(`  created ${created} company file(s)`);
  if (ARG.dryRun) log(`  (DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

