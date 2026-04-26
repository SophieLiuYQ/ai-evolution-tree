#!/usr/bin/env node
/**
 * import-aa-catalog.mjs
 *
 * Pulls model lists from Artificial Analysis Free Data API and merges them
 * into `src/content/companies/*.mdx` frontmatter `catalog[]`.
 *
 * Why: user chose "A mode" — every official model becomes a graph node.
 * This script provides a scalable source-of-truth model inventory per company.
 *
 * Setup:
 *   export AA_API_KEY="..."   # from https://artificialanalysis.ai/api-reference/
 *
 * Usage:
 *   node scripts/import-aa-catalog.mjs --dry-run
 *   node scripts/import-aa-catalog.mjs --company=openai
 *   node scripts/import-aa-catalog.mjs --all   # disable per-company cap
 *
 * Notes:
 * - This imports *LLM* inventory only (AA /api/v2/data/llms/models).
 * - For image/video/audio leaderboards, extend with /api/v2/data/media/*.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const COMPANIES_DIR = join(REPO_ROOT, "src", "content", "companies");

const argv = process.argv.slice(2);
const ARG = {
  dryRun: argv.includes("--dry-run"),
  company: argv.find((a) => a.startsWith("--company="))?.split("=")[1],
  all: argv.includes("--all"),
  maxPerCompany: Number(argv.find((a) => a.startsWith("--max-per-company="))?.split("=")[1] ?? "100"),
};

const log = (...a) => console.log(...a);

function stripUndefinedDeep(v) {
  if (v instanceof Date) {
    // Prefer stable date-only string for YAML and content schemas.
    return v.toISOString().slice(0, 10);
  }
  if (Array.isArray(v)) return v.map(stripUndefinedDeep).filter((x) => x !== undefined);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      const next = stripUndefinedDeep(val);
      if (next === undefined) continue;
      out[k] = next;
    }
    return out;
  }
  return v;
}

async function loadDotEnvLocal() {
  // Minimal dotenv loader (no dependency). Supports KEY=VALUE lines.
  // Loads `.env.local` first, then `.env` as fallback.
  const paths = [join(REPO_ROOT, ".env.local"), join(REPO_ROOT, ".env")];
  for (const p of paths) {
    try {
      const raw = await readFile(p, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const s = line.trim();
        if (!s || s.startsWith("#")) continue;
        const eq = s.indexOf("=");
        if (eq === -1) continue;
        const k = s.slice(0, eq).trim();
        let v = s.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!k) continue;
        if (process.env[k] == null) process.env[k] = v;
      }
    } catch {
      // ignore missing file
    }
  }
}

const kebab = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/['"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function mergeCatalog(existing, incoming) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const idx = new Map(out.map((x, i) => [String(x.id), i]));
  let added = 0;
  let updated = 0;
  for (const it of incoming) {
    const key = String(it.id);
    const i = idx.get(key);
    if (i == null) {
      out.push(it);
      idx.set(key, out.length - 1);
      added++;
      continue;
    }
    // Merge shallow; keep existing label if set.
    const prev = out[i];
    out[i] = {
      ...it,
      ...prev,
      label: prev.label ?? it.label,
      source_url: prev.source_url ?? it.source_url,
      api_model: prev.api_model ?? it.api_model,
      node_slug: prev.node_slug ?? it.node_slug,
      released_at: prev.released_at ?? it.released_at,
      retired_at: prev.retired_at ?? it.retired_at,
    };
    updated++;
  }
  return { out: out.map(stripUndefinedDeep), added, updated };
}

async function fetchAAModels(apiKey) {
  const r = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
    headers: { Accept: "application/json", "x-api-key": apiKey },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return json.data ?? [];
}

async function main() {
  await loadDotEnvLocal();
  const apiKey =
    process.env.AA_API_KEY ||
    process.env.ARTIFICIAL_ANALYSIS_API_KEY ||
    process.env.ARTIFICIALANALYSIS_API_KEY;
  if (!apiKey) {
    log("import-aa-catalog: missing AA_API_KEY");
    process.exit(1);
  }

  const aaModels = await fetchAAModels(apiKey);
  log(`AA models: ${aaModels.length}`);

  const files = (await readdir(COMPANIES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));

  // Choose one canonical company file per org (prefer aggregated pages that
  // cover multiple org aliases).
  const companies = [];
  for (const f of files) {
    const raw = await readFile(join(COMPANIES_DIR, f), "utf-8");
    const { data: fm } = matter(raw);
    const orgs = Array.isArray(fm.orgs) ? fm.orgs : [];
    companies.push({ file: f, slug: f.replace(/\.mdx$/, ""), orgs, orgCount: orgs.length });
  }
  const bestCompanyForOrg = new Map();
  for (const c of companies) {
    for (const org of c.orgs) {
      const key = String(org).toLowerCase();
      const prev = bestCompanyForOrg.get(key);
      if (!prev || c.orgCount > prev.orgCount) bestCompanyForOrg.set(key, c);
    }
  }
  const canonicalCompanySlugs = new Set([...bestCompanyForOrg.values()].map((c) => c.slug));

  let touched = 0;
  let totalAdded = 0;
  let totalUpdated = 0;

  for (const f of files) {
    const companySlug = f.replace(/\.mdx$/, "");
    if (ARG.company && ARG.company !== companySlug) continue;
    if (!ARG.company && !canonicalCompanySlugs.has(companySlug)) continue;

    const path = join(COMPANIES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content } = matter(raw);
    const orgs = Array.isArray(fm.orgs) ? fm.orgs : [];
    if (!orgs.length) continue;

    const orgKeys = orgs.map((x) => String(x).toLowerCase());
    const mine = aaModels.filter((m) => {
      const creator = String(m.model_creator?.name ?? "").toLowerCase();
      if (!creator) return false;
      // Match if creator contains any org token (handles "Google DeepMind").
      return orgKeys.some((o) => creator === o || creator.includes(o));
    });
    if (!mine.length) continue;

    // Cap to avoid generating thousands of nodes accidentally.
    const selected = ARG.all ? mine : mine.slice(0, Math.max(0, ARG.maxPerCompany));
    const incoming = selected.map((m) => ({
      id: String(m.slug || m.id || kebab(m.name)),
      label: String(m.name || m.slug || m.id),
      kind: "llm",
      node_slug: kebab(m.slug || m.name),
      source_url: m.slug ? `https://artificialanalysis.ai/models/${m.slug}` : "https://artificialanalysis.ai/",
    }));

    const { out, added, updated } = mergeCatalog(fm.catalog, incoming);
    if (!added && !updated) continue;

    touched++;
    totalAdded += added;
    totalUpdated += updated;
    log(`  ${companySlug}: +${added} ~${updated} (AA LLM catalog)`);

    if (!ARG.dryRun) {
      const nextFm = stripUndefinedDeep({ ...fm, catalog: out });
      const nextRaw = matter.stringify(content, nextFm);
      await writeFile(path, nextRaw, "utf-8");
    }
  }

  log("\nSummary:");
  log(`  touched ${touched} company file(s)`);
  log(`  added ${totalAdded} catalog item(s)`);
  log(`  updated ${totalUpdated} catalog item(s)`);
  if (ARG.dryRun) log("  (DRY RUN — no files written.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
