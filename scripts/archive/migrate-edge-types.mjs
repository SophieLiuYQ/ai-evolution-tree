#!/usr/bin/env node
/**
 * migrate-edge-types.mjs
 *
 * Project decision: keep ONLY three relationship types:
 * - builds_on
 * - competes_with
 * - open_alt_to
 *
 * This script rewrites existing node frontmatter relationships to fit
 * that reduced schema while preserving intent via `note`.
 *
 * Mapping:
 * - scales      -> builds_on   (note prefixed with "[scales]")
 * - fine_tunes  -> builds_on   ("[fine_tunes]")
 * - distills    -> builds_on   ("[distills]")
 * - applies     -> builds_on   ("[applies]")
 * - replaces    -> builds_on   ("[replaces]")
 * - surpasses   -> competes_with ("[surpasses]")
 * - competes_with/open_alt_to/builds_on unchanged
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

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

const MAP = {
  scales: { type: "builds_on", tag: "scales" },
  fine_tunes: { type: "builds_on", tag: "fine_tunes" },
  distills: { type: "builds_on", tag: "distills" },
  applies: { type: "builds_on", tag: "applies" },
  replaces: { type: "builds_on", tag: "replaces" },
  surpasses: { type: "competes_with", tag: "surpasses" },
};

function prefixNote(tag, note) {
  const n = String(note ?? "").trim();
  const p = `[${tag}]`;
  if (!n) return p;
  if (n.startsWith(p)) return n;
  return `${p} ${n}`;
}

function normalizeRel(r) {
  if (!r || typeof r !== "object") return null;
  const to = String(r.to ?? "").trim();
  const type = String(r.type ?? "").trim();
  if (!to || !type) return null;
  if (type === "builds_on" || type === "competes_with" || type === "open_alt_to") {
    return { to, type, note: r.note };
  }
  const m = MAP[type];
  if (!m) {
    // Unknown legacy type: conservatively fold into builds_on.
    return { to, type: "builds_on", note: prefixNote(type, r.note) };
  }
  return { to, type: m.type, note: prefixNote(m.tag, r.note) };
}

function dedupeRels(rels) {
  const out = [];
  const seen = new Set();
  for (const r of rels) {
    const key = `${r.type}@@${r.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let touched = 0;
  let changedEdges = 0;

  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;
    const rels = Array.isArray(fm.relationships) ? fm.relationships : [];
    if (!rels.length) continue;

    const next = dedupeRels(
      rels.map(normalizeRel).filter(Boolean),
    );

    const before = JSON.stringify(rels);
    const after = JSON.stringify(next);
    if (before === after) continue;

    touched++;
    changedEdges += Math.abs(rels.length - next.length) + 1;
    const nextFm = { ...fm, relationships: next };
    if (!ARG.dryRun) {
      await writeFile(p, matter.stringify(content, stripUndefinedDeep(nextFm)));
    }
  }

  console.log(`touched files: ${touched}`);
  console.log(`edge rewrites: ~${changedEdges}`);
  if (ARG.dryRun) console.log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

