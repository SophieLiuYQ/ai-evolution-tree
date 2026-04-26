#!/usr/bin/env node
/**
 * auto-connect-series.mjs
 *
 * Adds a conservative "builds_on" edge between consecutive releases in the
 * same (company, nameGroup) series. This makes model evolution legible on
 * the tree without hand-authoring every relationship.
 *
 * Safety:
 * - Only touches nodes with `model_spec` present.
 * - Only adds ONE edge per node (to the nearest previous node in the same series).
 * - Never removes or rewrites existing relationships.
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

function dateValue(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

async function loadCanonicalCompanyByOrg() {
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

function hasBuildsOn(rel, toSlug) {
  return (rel ?? []).some((r) => r?.type === "builds_on" && r?.to === toSlug);
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
    if (!fm.model_spec) continue; // only connect models
    const dt = dateValue(fm.date);
    if (!dt) continue;
    const companySlug = orgToCompany.get(String(fm.org).toLowerCase()) ?? String(fm.org);
    const nameGroup = nameGroupKeyFromTitle(fm.title ?? fm.slug);
    nodes.push({ f, path, fm, content, dt, companySlug, nameGroup });
  }

  // Group series by (companySlug, nameGroup), sort chronologically.
  const groups = new Map();
  for (const n of nodes) {
    const k = `${n.companySlug}@@${n.nameGroup}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(n);
  }

  let touched = 0;
  for (const list of groups.values()) {
    list.sort((a, b) => a.dt.getTime() - b.dt.getTime());
    for (let i = 1; i < list.length; i++) {
      const cur = list[i];
      const prev = list[i - 1];
      const rel = Array.isArray(cur.fm.relationships) ? cur.fm.relationships : [];
      if (hasBuildsOn(rel, prev.fm.slug)) continue;
      // If the node already has a builds_on edge, don't auto-add another.
      if (rel.some((r) => r?.type === "builds_on")) continue;
      const nextRel = [
        ...rel,
        { to: String(prev.fm.slug), type: "builds_on", note: "Same-series previous release" },
      ];
      const nextFm = { ...cur.fm, relationships: nextRel };
      touched++;
      if (!ARG.dryRun) {
        await writeFile(cur.path, matter.stringify(cur.content, stripUndefinedDeep(nextFm)));
      }
    }
  }

  console.log(`touched files: ${touched}`);
  if (ARG.dryRun) console.log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

