#!/usr/bin/env node
// refresh-open-source.mjs — sweep every MDX node, auto-match to an AA
// catalog record (same fallback chain as refresh-aa-pricing.mjs), and
// reconcile `release_type` against AA's `is_open_weights` flag.
//
// AA's flag is the most authoritative signal for whether a model has
// downloadable weights. We update release_type when AA disagrees with
// our MDX. For nodes with no AA match, hand-curated data wins (we
// don't downgrade `paper` / `demo` / curated `open_weights`).
//
// Also writes license_name + license_url + hf_url from AA when missing,
// so the metadata trail is consistent.
//
// Usage:
//   node scripts/refresh-open-source.mjs --dry-run
//   node scripts/refresh-open-source.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const DRY = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");
const AA_URL = "https://artificialanalysis.ai/models";

// ---------- Re-fetch + parse AA ----------
async function fetchAA() {
  const r = await fetch(AA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ai-tree-oss/0.1)",
      "Accept": "text/html",
    },
  });
  return await r.text();
}
function unescapeRSC(html) {
  return html.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  ).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
function parseRecords(blob) {
  const out = [];
  let i = 0;
  while ((i = blob.indexOf('"model_family_slug"', i)) !== -1) {
    let start = blob.lastIndexOf("{", i);
    if (start === -1) break;
    let depth = 0, end = -1;
    for (let j = start; j < blob.length; j++) {
      const c = blob[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { end = j; break; }
      } else if (c === '"') {
        for (j++; j < blob.length && blob[j] !== '"'; j++) {
          if (blob[j] === "\\") j++;
        }
      }
    }
    if (end === -1) break;
    try {
      const obj = JSON.parse(blob.slice(start, end + 1));
      if (obj.model_family_slug) out.push(obj);
    } catch {
      // skip
    }
    i = end + 1;
  }
  return out;
}

// ---------- Load AA ----------
console.error("fetching AA…");
const html = await fetchAA();
const blob = unescapeRSC(html);
const records = parseRecords(blob);
console.error(`parsed ${records.length} AA records`);

const norm = (s) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const stripParens = (s) => String(s ?? "").replace(/\s*\([^)]*\)\s*$/g, "").trim();

const byName = new Map();
const byNameStripped = new Map();
const bySlug = new Map();
for (const r of records.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""))) {
  byName.set(norm(r.name), r);
  byNameStripped.set(norm(stripParens(r.name)), r);
  bySlug.set(norm(r.model_family_slug), r);
}

const familyChampion = new Map();
for (const r of records) {
  const f = r.model_family_slug;
  const ii = r.intelligence_index ?? -Infinity;
  const cur = familyChampion.get(f);
  if (!cur || (cur.intelligence_index ?? -Infinity) < ii) familyChampion.set(f, r);
}

// SLUG_MAP / VARIANT_MAP from fetch-aa-benchmarks
const fetchSrc = readFileSync(join(REPO_ROOT, "scripts", "fetch-aa-benchmarks.mjs"), "utf8");
const variantMap = new Map();
const variantBlock = fetchSrc.match(/const VARIANT_MAP = \{([\s\S]*?)\n\};/);
if (variantBlock) {
  for (const m of variantBlock[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) variantMap.set(m[1], m[2]);
}
const slugMap = new Map();
const slugBlock = fetchSrc.match(/const SLUG_MAP = \{([\s\S]*?)\n\};/);
if (slugBlock) {
  for (const m of slugBlock[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) slugMap.set(m[1], m[2]);
}

function findAaRecord(fmSlug, fmTitle) {
  const vName = variantMap.get(fmSlug);
  if (vName) {
    const r = records.find((x) => x.name === vName);
    if (r) return { rec: r, how: "variant" };
  }
  const sf = slugMap.get(fmSlug);
  if (sf) {
    const r = familyChampion.get(sf);
    if (r) return { rec: r, how: "slug-family" };
  }
  const titleCore = stripParens(String(fmTitle ?? "").split(/\s+[—–-]\s+/)[0] || fmTitle);
  const normTitle = norm(titleCore);
  if (normTitle && byNameStripped.has(normTitle)) return { rec: byNameStripped.get(normTitle), how: "title-match" };
  if (normTitle && byName.has(normTitle)) return { rec: byName.get(normTitle), how: "title-exact" };
  const normSlug = norm(fmSlug);
  if (normSlug && bySlug.has(normSlug)) return { rec: bySlug.get(normSlug), how: "slug-match" };
  return null;
}

// ---------- Walk MDX ----------
const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));

let promotedToOpen = 0;
let demotedToApi = 0;
let alreadyCorrect = 0;
let noAaMatch = 0;
let preservedPaper = 0;
let preservedDemo = 0;
let preservedProduct = 0;

for (const f of files) {
  const path = join(NODES_DIR, f);
  const raw = await readFile(path, "utf-8");
  const { data: fm, content: body } = matter(raw);
  if (!fm.slug || !fm.model_spec) continue;

  const cur = fm.model_spec.release_type;

  // Never override these — they're hand-curated and AA doesn't track them
  if (cur === "paper") { preservedPaper++; continue; }
  if (cur === "demo") { preservedDemo++; continue; }
  if (cur === "product") {
    // Some products (like Sora 2) are genuinely product-only; AA doesn't
    // track them. Only override if AA explicitly says open_weights.
    const match = findAaRecord(fm.slug, fm.title);
    if (match && match.rec.is_open_weights === true) {
      // Rare — log but don't auto-promote products without manual review
      if (VERBOSE) console.log(`  product → AA says open: ${fm.slug}`);
    }
    preservedProduct++;
    continue;
  }

  const match = findAaRecord(fm.slug, fm.title);
  if (!match) { noAaMatch++; continue; }

  const aaOpen = match.rec.is_open_weights === true;
  const desired = aaOpen ? "open_weights" : "api";

  if (cur === desired) { alreadyCorrect++; continue; }

  // Build update — also fill license + hf_url when AA has them
  const newSpec = { ...fm.model_spec, release_type: desired };
  if (aaOpen) {
    if (match.rec.license_name && !newSpec.license_name) {
      newSpec.license_name = match.rec.license_name;
    }
    if (match.rec.license_url && !newSpec.license_url) {
      newSpec.license_url = match.rec.license_url;
    }
    if (match.rec.model_weights_source_url && !newSpec.hf_url &&
        match.rec.model_weights_source_url.includes("huggingface.co")) {
      newSpec.hf_url = match.rec.model_weights_source_url;
    }
    promotedToOpen++;
    console.log(`  api → open_weights   ${fm.slug.padEnd(40)} ← ${match.rec.name}`);
  } else {
    demotedToApi++;
    console.log(`  open_weights → api   ${fm.slug.padEnd(40)} ← ${match.rec.name}`);
  }

  if (!DRY) {
    const newFm = { ...fm, model_spec: newSpec };
    await writeFile(path, matter.stringify(body, newFm));
  }
}

console.log(`\n  ${promotedToOpen} promoted to open_weights · ${demotedToApi} demoted to api`);
console.log(`  ${alreadyCorrect} already correct · ${noAaMatch} no AA match`);
console.log(`  preserved: ${preservedPaper} paper, ${preservedDemo} demo, ${preservedProduct} product`);
if (DRY) console.log("DRY RUN — drop --dry-run to write.");
