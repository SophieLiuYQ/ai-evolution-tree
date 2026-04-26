#!/usr/bin/env node
/**
 * clean-invalid-frontmatter.mjs
 *
 * Fixes YAML frontmatter produced by earlier scripts where Date objects
 * were accidentally serialized as `{}` (e.g. `released_at: {}`), which
 * breaks the Astro content schema (`z.coerce.date()`).
 *
 * Strategy:
 * - Remove `released_at: {}` / `retired_at: {}` / `released_at: null` etc.
 * - Do not attempt to infer the correct date (we keep it optional).
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const COMPANIES_DIR = join(REPO_ROOT, "src", "content", "companies");

const argv = process.argv.slice(2);
const ARG = { dryRun: argv.includes("--dry-run") };

const log = (...a) => console.log(...a);

function cleanYamlBlocks(s) {
  // Remove invalid date objects in YAML frontmatter. Keep indentation-safe.
  return s
    .replace(/^\s+released_at:\s*\{\}\s*$/gm, "")
    .replace(/^\s+retired_at:\s*\{\}\s*$/gm, "")
    .replace(/^\s+released_at:\s*null\s*$/gm, "")
    .replace(/^\s+retired_at:\s*null\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

async function main() {
  const files = (await readdir(COMPANIES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let touched = 0;
  for (const f of files) {
    const p = join(COMPANIES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const next = cleanYamlBlocks(raw);
    if (next === raw) continue;
    touched++;
    log(`clean: ${f}`);
    if (!ARG.dryRun) await writeFile(p, next, "utf-8");
  }
  log(`\nSummary: cleaned ${touched} file(s)`);
  if (ARG.dryRun) log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

