#!/usr/bin/env node
/**
 * feature-company-year.mjs
 *
 * Marks representative nodes per (company, year, name-group) with `graph_featured: true`.
 * If any node is featured, /tree and /timeline will render only featured nodes.
 *
 * Selection heuristic (per company-year-nameGroup):
 *  1) Prefer nodes with AA Intelligence Index (higher is better)
 *  2) Else prefer higher breakthrough_score
 *  3) Bonus for series nodes (has variants)
 *  4) Prefer single-model names over multi-model rollups
 *  5) Tie-breaker: latest date in that year
 *
 * Usage:
 *   node scripts/feature-company-year.mjs --dry-run
 *   node scripts/feature-company-year.mjs
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { nameGroupKeyFromTitle } from "./lib/name-group.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const COMPANIES_DIR = join(REPO_ROOT, "src", "content", "companies");

const argv = process.argv.slice(2);
const ARG = { dryRun: argv.includes("--dry-run") };

const log = (...a) => console.log(...a);

function stripUndefinedDeep(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
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

function aaIntelligenceIndex(fm) {
  const benches = fm?.model_spec?.benchmarks ?? [];
  const row = benches.find((b) => String(b.name).toLowerCase().includes("aa intelligence index"));
  if (!row) return null;
  const m = String(row.score ?? "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function dateValue(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function isMultiModelRollup(title) {
  const s = String(title ?? "").toLowerCase();
  return s.includes("&") || s.includes(",") || s.includes("—") || s.includes("family");
}

async function loadCanonicalCompanyByOrg() {
  // One canonical company slug per org. Prefer aggregated company pages that
  // cover multiple org aliases (e.g. Google/DeepMind combined).
  const files = (await readdir(COMPANIES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const companies = [];
  for (const f of files) {
    const raw = await readFile(join(COMPANIES_DIR, f), "utf-8");
    const { data: fm } = matter(raw);
    const orgs = Array.isArray(fm.orgs) ? fm.orgs : [];
    if (!fm.slug || !orgs.length) continue;
    companies.push({ slug: String(fm.slug), orgs: orgs.map((o) => String(o)), orgCount: orgs.length });
  }
  const best = new Map();
  for (const c of companies) {
    for (const org of c.orgs) {
      const key = String(org).toLowerCase();
      const prev = best.get(key);
      if (!prev || c.orgCount > prev.orgCount) best.set(key, c.slug);
    }
  }
  return best; // orgLower -> companySlug
}

async function main() {
  const orgToCompany = await loadCanonicalCompanyByOrg();
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const nodes = [];
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;
    if (fm.graph_hidden) continue; // never feature hidden variants
    const dt = dateValue(fm.date);
    const year = dt ? dt.getUTCFullYear() : null;
    if (!year) continue;
    const companySlug = orgToCompany.get(String(fm.org).toLowerCase()) ?? String(fm.org);
    const nameGroup = nameGroupKeyFromTitle(fm.title ?? fm.slug);
    nodes.push({ file: f, path, raw, fm, body: content, year, companySlug, nameGroup });
  }

  // Group by company-year-nameGroup so distinct lines (e.g. Sonnet vs Haiku)
  // render as separate featured nodes in the same year.
  const groups = new Map();
  for (const n of nodes) {
    const key = `${n.companySlug}@@${n.year}@@${n.nameGroup}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(n);
  }

  const winners = new Set();
  for (const [key, list] of groups.entries()) {
    list.sort((a, b) => {
      const aAA = aaIntelligenceIndex(a.fm);
      const bAA = aaIntelligenceIndex(b.fm);
      if (aAA != null || bAA != null) {
        if (bAA == null) return -1;
        if (aAA == null) return 1;
        if (bAA !== aAA) return bAA - aAA;
      }
      const aBreak = Number(a.fm.breakthrough_score ?? 0);
      const bBreak = Number(b.fm.breakthrough_score ?? 0);
      if (bBreak !== aBreak) return bBreak - aBreak;
      const aVar = (a.fm.model_spec?.variants?.length ?? 0) > 0 ? 1 : 0;
      const bVar = (b.fm.model_spec?.variants?.length ?? 0) > 0 ? 1 : 0;
      if (bVar !== aVar) return bVar - aVar;
      const aMulti = isMultiModelRollup(a.fm.title) ? 1 : 0;
      const bMulti = isMultiModelRollup(b.fm.title) ? 1 : 0;
      if (aMulti !== bMulti) return aMulti - bMulti; // prefer single-model titles
      const aDt = dateValue(a.fm.date)?.getTime() ?? 0;
      const bDt = dateValue(b.fm.date)?.getTime() ?? 0;
      return bDt - aDt;
    });
    winners.add(list[0].fm.slug);
  }

  // Write: clear existing graph_featured then set winners.
  let touched = 0;
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;
    if (fm.graph_hidden) {
      // keep hidden variants untouched
      if (fm.graph_featured) {
        delete fm.graph_featured;
        touched++;
        if (!ARG.dryRun) await writeFile(path, matter.stringify(content, stripUndefinedDeep(fm)));
      }
      continue;
    }
    const should = winners.has(fm.slug);
    const cur = !!fm.graph_featured;
    if (should === cur) continue;
    if (should) fm.graph_featured = true;
    else delete fm.graph_featured;
    touched++;
    if (!ARG.dryRun) await writeFile(path, matter.stringify(content, stripUndefinedDeep(fm)));
  }

  log(`featured nodes: ${winners.size}`);
  log(`touched files: ${touched}`);
  if (ARG.dryRun) log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
