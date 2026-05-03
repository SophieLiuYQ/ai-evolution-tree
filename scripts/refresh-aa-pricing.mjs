#!/usr/bin/env node
// refresh-aa-pricing.mjs — sweep every MDX node, auto-match it to an AA
// catalog record (by SLUG_MAP/VARIANT_MAP first, then fuzzy title match),
// and refresh just the Speed and Price benchmark rows from AA's current
// per-model data.
//
// Doesn't touch Intelligence, GPQA, MMLU-Pro, etc. — those are already
// handled by fetch-aa-benchmarks.mjs. This script focuses on the two
// rows that drive the Speed and Cost attribute cards.
//
// When AA reports $0/$0 (no pricing data, NOT "free"), the Price row is
// removed entirely so the Cost card hides cleanly.
//
// Usage:
//   node scripts/refresh-aa-pricing.mjs --dry-run
//   node scripts/refresh-aa-pricing.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const DRY = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("-v") || process.argv.includes("--verbose");

const AA_URL = "https://artificialanalysis.ai/models";

// ---------- Re-fetch + parse AA (lifted from fetch-aa-benchmarks) ----------
async function fetchAA() {
  const r = await fetch(AA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ai-tree-pricing/0.1)",
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
      // skip malformed
    }
    i = end + 1;
  }
  return out;
}

// ---------- Load AA + build name index ----------
console.error("fetching AA…");
const html = await fetchAA();
const blob = unescapeRSC(html);
const records = parseRecords(blob);
console.error(`parsed ${records.length} rich records`);

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const stripParens = (s) => String(s ?? "").replace(/\s*\([^)]*\)\s*$/g, "").trim();

// Map of normalized name → record  (most-recent first if duplicates)
const byName = new Map();
const byNameStripped = new Map();
const bySlug = new Map();
for (const r of records.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""))) {
  byName.set(norm(r.name), r);
  byNameStripped.set(norm(stripParens(r.name)), r);
  bySlug.set(norm(r.model_family_slug), r);
}

// SLUG_MAP / VARIANT_MAP from fetch-aa-benchmarks (read source so we
// can take advantage of the mappings already in place).
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

// Family champion (used as last-resort fallback for SLUG_MAP entries)
const familyChampion = new Map();
for (const r of records) {
  const f = r.model_family_slug;
  const ii = r.intelligence_index ?? -Infinity;
  const cur = familyChampion.get(f);
  if (!cur || (cur.intelligence_index ?? -Infinity) < ii) familyChampion.set(f, r);
}

// Pre-compute speed-rank table across all AA records that have a numeric
// median_output_speed. Detail page uses this to bucket Speed into the same
// "Top 1% / Top 5% / Top 10% / Good / Medium / Below avg" scheme as
// Intelligence, computed off (rank / total) percentile.
function speedFor(rec) {
  const perfRows = Array.isArray(rec?.performanceByPromptLength) ? rec.performanceByPromptLength : [];
  const speeds = perfRows.map((r) => r?.median_output_speed).filter((v) => typeof v === "number" && v > 0);
  return speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
}
const speedTable = records
  .map((r) => ({ id: r.id, speed: speedFor(r) }))
  .filter((x) => typeof x.speed === "number" && x.speed > 0)
  .sort((a, b) => b.speed - a.speed);
const speedTotal = speedTable.length;
const speedRankByRecordId = new Map();
speedTable.forEach((x, i) => speedRankByRecordId.set(x.id, i + 1));

function findAaRecord(fmSlug, fmTitle) {
  // 1. Variant override → exact name match
  const vName = variantMap.get(fmSlug);
  if (vName) {
    const r = records.find((x) => x.name === vName);
    if (r) return { rec: r, how: "variant" };
  }
  // 2. SLUG_MAP → family champion
  const sf = slugMap.get(fmSlug);
  if (sf) {
    const r = familyChampion.get(sf);
    if (r) return { rec: r, how: "slug-family" };
  }
  // 3. Fuzzy: title exact-match (normalized) against AA name (with and
  //    without trailing parens stripped).
  const titleCore = stripParens(String(fmTitle ?? "").split(/\s+[—–-]\s+/)[0] || fmTitle);
  const normTitle = norm(titleCore);
  if (normTitle && byNameStripped.has(normTitle)) {
    return { rec: byNameStripped.get(normTitle), how: "title-match" };
  }
  if (normTitle && byName.has(normTitle)) {
    return { rec: byName.get(normTitle), how: "title-exact" };
  }
  // 4. Slug match against AA family slug
  const normSlug = norm(fmSlug);
  if (normSlug && bySlug.has(normSlug)) {
    return { rec: bySlug.get(normSlug), how: "slug-match" };
  }
  return null;
}

// ---------- Walk MDX ----------
const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
let touched = 0, unmatched = 0, noPrice = 0, noChange = 0;

for (const f of files) {
  const path = join(NODES_DIR, f);
  const raw = await readFile(path, "utf-8");
  const { data: fm, content: body } = matter(raw);
  if (!fm.slug) continue;
  if (!fm.model_spec) continue;
  // Skip pure-paper nodes — they don't have an AA equivalent
  if (fm.model_spec.release_type === "paper") continue;

  const match = findAaRecord(fm.slug, fm.title);
  if (!match) { unmatched++; if (VERBOSE) console.error(`?  ${fm.slug}`); continue; }

  const rec = match.rec;
  const aaModelUrl = rec.model_url
    ? `https://artificialanalysis.ai${rec.model_url}`
    : "https://artificialanalysis.ai/leaderboards/models";

  // Compute new Speed / Price rows
  const perfRows = Array.isArray(rec.performanceByPromptLength) ? rec.performanceByPromptLength : [];
  const speeds = perfRows.map((r) => r?.median_output_speed).filter((v) => typeof v === "number" && v > 0);
  const speedAA = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
  const inAA = rec.price_1m_input_tokens;
  const outAA = rec.price_1m_output_tokens;

  const speedRank = speedRankByRecordId.get(rec.id);
  const newSpeed = (typeof speedAA === "number" && speedAA > 0)
    ? {
        name: "Speed · Output tok/s",
        score: String(Math.round(speedAA)),
        ...(speedRank ? { vs_baseline: `Rank #${speedRank} of ${speedTotal}` } : {}),
        source_url: aaModelUrl,
      }
    : null;
  const newPrice = (typeof inAA === "number" && typeof outAA === "number" && (inAA > 0 || outAA > 0))
    ? { name: "Price ($/M tokens)", score: `$${inAA.toFixed(2)} in / $${outAA.toFixed(2)} out`, source_url: aaModelUrl }
    : null;

  // Strip existing Speed / Price rows we manage, append fresh ones if available
  const existing = Array.isArray(fm.model_spec.benchmarks) ? fm.model_spec.benchmarks : [];
  const SCRIPT_MANAGED_RE = /^(speed · output tok\/s|price \(\$\/m tokens\))/i;
  const filtered = existing.filter((b) => !SCRIPT_MANAGED_RE.test(String(b.name ?? "")));
  const merged = [...filtered, ...(newSpeed ? [newSpeed] : []), ...(newPrice ? [newPrice] : [])];

  // Skip the write if benchmarks array is unchanged (no edit needed)
  const same = JSON.stringify(existing) === JSON.stringify(merged);
  if (same) { noChange++; continue; }

  if (!newPrice) noPrice++;
  console.log(`  ${match.how.padEnd(13)} ${fm.slug.padEnd(40)} → ${rec.name}` +
    (newPrice ? `  · ${newPrice.score}` : "  · no price") +
    (newSpeed ? `  · ${newSpeed.score} tok/s` : ""));

  if (!DRY) {
    const newFm = { ...fm, model_spec: { ...fm.model_spec, benchmarks: merged } };
    await writeFile(path, matter.stringify(body, newFm));
  }
  touched++;
}

console.log(`\n  ${touched} touched · ${noChange} no change · ${unmatched} unmatched · ${noPrice} matched but no AA pricing`);
if (DRY) console.log("DRY RUN — drop --dry-run to write.");
