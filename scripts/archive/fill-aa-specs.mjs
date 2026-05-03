#!/usr/bin/env node
/**
 * fill-aa-specs.mjs — Pull structured model_spec fields from Artificial
 * Analysis and write them into MDX frontmatter where the existing value
 * is missing or a known placeholder.
 *
 * AA's /models RSC payload exposes rich per-model metadata:
 *   parameters (total B), activeParams (B for MoE), context_window_tokens,
 *   input_modality_*, output_modality_*, is_open_weights, license_name,
 *   release_date, reasoning_model, etc.
 *
 * We map those into our schema:
 *   parameters         ← formatted "<active>B active · <total>B total" for
 *                        MoE, "<n>B" for dense; only writes if existing is
 *                        missing or "undisclosed".
 *   context_window     ← context_window_tokens; writes if missing or zero.
 *   architecture       ← "MoE Transformer" / "Transformer" derived from
 *                        active vs total; only OVERWRITES the literal
 *                        "Placeholder scaffold …" string we auto-stamped
 *                        on series-import nodes.
 *   release_type       ← open_weights / api (defaults to api when AA
 *                        marks the model as commercial-only); only writes
 *                        if missing.
 *   modalities_in      ← derived from input_modality_text/image/speech/video.
 *   modalities_out     ← derived from output_modality_*.
 *
 * Usage:
 *   node scripts/fill-aa-specs.mjs --dry-run          # report only
 *   node scripts/fill-aa-specs.mjs                    # write
 *   node scripts/fill-aa-specs.mjs --slug=r1-1776     # one node
 *   node scripts/fill-aa-specs.mjs --force            # overwrite even
 *                                                       non-placeholder
 *                                                       values
 *   node scripts/fill-aa-specs.mjs --verbose
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");
const AA_URL = "https://artificialanalysis.ai/models";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const FORCE = argv.includes("--force");
const ONE_SLUG = argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");
const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

const PLACEHOLDER_ARCH =
  "Placeholder scaffold — fill with official specs and benchmark snapshots.";
const PLACEHOLDER_PARAMS = "undisclosed";

// ============== Scrape AA ==============
async function fetchAA() {
  log(`fetching ${AA_URL}…`);
  const r = await fetch(AA_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-tree-fill-aa/0.1)" },
  });
  if (!r.ok) throw new Error(`AA returned HTTP ${r.status}`);
  const html = await r.text();
  log(`  got ${html.length} bytes`);
  return html;
}

function unescapeRSC(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g)]
    .map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"));
  return chunks.join("\n");
}

function parseRecords(blob) {
  const re = /\{"additional_text":/g;
  const out = [];
  let m;
  while ((m = re.exec(blob)) !== null) {
    let depth = 0,
      i = m.index,
      inStr = false,
      esc = false;
    const start = i;
    for (; i < blob.length; i++) {
      const c = blob[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    try {
      const obj = JSON.parse(blob.slice(start, i));
      if (obj.model_slug || obj.slug || obj.model_family_slug) out.push(obj);
    } catch {}
  }
  return out;
}

// Build a slug-keyed lookup. Multiple records may share a family_slug;
// pick the variant with highest intelligence_index as the family champion.
function buildLookup(records) {
  const bySlug = new Map();
  const byFamily = new Map();
  for (const r of records) {
    const slug = r.model_slug || r.slug;
    if (slug && !bySlug.has(slug)) bySlug.set(slug, r);
    const fam = r.model_family_slug;
    if (fam) {
      const cur = byFamily.get(fam);
      const ii = r.intelligence_index ?? -Infinity;
      if (!cur || (cur.intelligence_index ?? -Infinity) < ii) {
        byFamily.set(fam, r);
      }
    }
  }
  return { bySlug, byFamily };
}

function urlSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || null;
  } catch {
    return null;
  }
}

// ============== Mappers ==============
function fmtParameters(rec) {
  // AA stores params in BILLIONS (numeric). For MoE, activeParams is the
  // dense-equivalent inference cost; parameters is total.
  const total = numOrNull(rec.parameters);
  const active = numOrNull(rec.activeParams) ?? numOrNull(rec.inference_parameters_active_billions);
  if (total == null && active == null) return null;
  if (active != null && total != null && Math.abs(active - total) > 0.5) {
    // MoE — show both. e.g. "37B active · 671B total".
    return `${formatB(active)} active · ${formatB(total)} total`;
  }
  const v = active ?? total;
  return `${formatB(v)}`;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatB(n) {
  if (n >= 1000) return `${Math.round(n / 100) / 10}T`;
  if (n >= 1) return `${Math.round(n * 10) / 10}B`.replace(".0B", "B");
  return `${Math.round(n * 1000)}M`;
}

function deriveArchitecture(rec) {
  // Keep this short — the spec-row-value CSS truncates anything past
  // ~3 words. Detail goes after the em-dash and shows on hover only.
  const total = numOrNull(rec.parameters);
  const active = numOrNull(rec.activeParams) ?? numOrNull(rec.inference_parameters_active_billions);
  const isMoE = total != null && active != null && Math.abs(active - total) > 0.5;
  const reasoning = !!rec.reasoning_model;
  const head = isMoE ? "MoE Transformer" : "Dense Transformer";
  const detail = [];
  if (isMoE && total != null && active != null) {
    detail.push(`${formatB(active)} active of ${formatB(total)} total`);
  }
  if (reasoning) detail.push("reasoning mode");
  return detail.length ? `${head} — ${detail.join(", ")}` : head;
}

function deriveModalitiesIn(rec) {
  const m = [];
  if (rec.input_modality_text) m.push("text");
  if (rec.input_modality_image) m.push("image");
  if (rec.input_modality_speech) m.push("audio");
  if (rec.input_modality_video) m.push("video");
  return m.length ? m : null;
}

function deriveModalitiesOut(rec) {
  const m = [];
  if (rec.output_modality_text) m.push("text");
  if (rec.output_modality_image) m.push("image");
  if (rec.output_modality_speech) m.push("audio");
  if (rec.output_modality_video) m.push("video");
  return m.length ? m : null;
}

function deriveReleaseType(rec) {
  if (rec.is_open_weights) return "open_weights";
  // Free / hosted via API
  return "api";
}

// ============== YAML surgical rewrite ==============
// Replace a single `<key>: ...` line under model_spec with a new value.
// If the key doesn't exist, INSERT it under model_spec.
//
// `valueYaml` should be the YAML representation of the new value
// (string, number, or array). Strings get quoted; arrays use block list.
function setModelSpecField(raw, key, valueYaml, indent = "  ") {
  // Match the existing line if present (single-line scalar OR start of
  // block list / folded scalar — the next line indented further).
  const scalarRe = new RegExp(`^(${indent}${key}:)[^\\n]*\\n`, "m");
  const blockRe = new RegExp(
    `^(${indent}${key}:)[^\\n]*\\n(?:${indent}[ \\t]+[^\\n]*\\n)+`,
    "m",
  );
  const newLine = `${indent}${key}: ${valueYaml}\n`;
  if (blockRe.test(raw)) return raw.replace(blockRe, newLine);
  if (scalarRe.test(raw)) return raw.replace(scalarRe, newLine);
  // Insert before `public_view:` (or end of frontmatter).
  const pvRe = /^public_view:/m;
  const m = raw.match(pvRe);
  if (m) {
    const idx = raw.indexOf(m[0]);
    return raw.slice(0, idx) + newLine + raw.slice(idx);
  }
  return raw;
}

function setModelSpecArray(raw, key, items, indent = "  ") {
  // Replace either an inline array (`key: [a, b]`) or a block list
  // (`key:\n  - a\n  - b\n`) with a fresh block list.
  const itemsYaml = items.map((it) => `${indent}  - ${it}`).join("\n");
  const blockRe = new RegExp(
    `^(${indent}${key}:)[^\\n]*\\n(?:${indent}[ \\t]+- [^\\n]*\\n)+`,
    "m",
  );
  const inlineRe = new RegExp(`^(${indent}${key}:)[^\\n]*\\n`, "m");
  const newBlock = `${indent}${key}:\n${itemsYaml}\n`;
  if (blockRe.test(raw)) return raw.replace(blockRe, newBlock);
  if (inlineRe.test(raw)) return raw.replace(inlineRe, newBlock);
  // Insert before public_view
  const pvRe = /^public_view:/m;
  const m = raw.match(pvRe);
  if (m) {
    const idx = raw.indexOf(m[0]);
    return raw.slice(0, idx) + newBlock + raw.slice(idx);
  }
  return raw;
}

// Quote a YAML scalar string. Use single quotes; escape internal single
// quotes by doubling. Plain strings without special chars stay bare.
function yamlQuoteString(s) {
  if (s == null) return "''";
  const safe = !/[:#&*!|>'"%@`\n\\\[\]\{\},]/.test(s) && !/^\s|\s$/.test(s);
  if (safe) return s;
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ============== Main ==============
async function main() {
  log(`fill-aa-specs — ${DRY ? "DRY RUN" : "LIVE"}${FORCE ? " · FORCE" : ""}`);
  const html = await fetchAA();
  const blob = unescapeRSC(html);
  const records = parseRecords(blob);
  log(`parsed ${records.length} AA records`);
  const { bySlug, byFamily } = buildLookup(records);
  log(`indexed ${bySlug.size} slugs, ${byFamily.size} families`);

  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );

  const reports = [];
  let touched = 0;
  let scanned = 0;
  let noAa = 0;

  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm } = matter(raw);
    if (!fm?.slug) continue;
    if (ONE_SLUG && fm.slug !== ONE_SLUG) continue;
    scanned++;

    const aaUrl = fm.model_spec?.aa_url;
    if (!aaUrl) {
      noAa++;
      continue;
    }
    const slug = urlSlug(aaUrl);
    const rec = (slug && bySlug.get(slug)) || (slug && byFamily.get(slug));
    if (!rec) {
      vlog(`? ${fm.slug}: no AA record for ${slug}`);
      continue;
    }

    const spec = fm.model_spec ?? {};
    let next = raw;
    const changes = [];

    // parameters
    const paramsAa = fmtParameters(rec);
    if (paramsAa) {
      const cur = spec.parameters;
      const placeholderParams =
        !cur || cur === PLACEHOLDER_PARAMS || cur === "Undisclosed";
      if (FORCE || placeholderParams) {
        if (cur !== paramsAa) {
          next = setModelSpecField(next, "parameters", yamlQuoteString(paramsAa));
          changes.push(`parameters: ${cur ?? "(none)"} → ${paramsAa}`);
        }
      }
    }

    // architecture
    const archAa = deriveArchitecture(rec);
    if (archAa) {
      const cur = spec.architecture;
      const placeholderArch = !cur || cur === PLACEHOLDER_ARCH;
      // Recognize the old auto-stamped strings from a prior run so we
      // upgrade their format without trashing human-curated descriptions.
      const autoStamped =
        cur === "Mixture-of-Experts Transformer" ||
        cur === "Mixture-of-Experts Transformer with reasoning mode" ||
        cur === "Transformer (dense)" ||
        cur === "Transformer (dense) with reasoning mode";
      if (FORCE || placeholderArch || autoStamped) {
        if (cur !== archAa) {
          next = setModelSpecField(next, "architecture", yamlQuoteString(archAa));
          changes.push(`architecture: ${cur ?? "(none)"} → ${archAa}`);
        }
      }
    }

    // context_window
    const ctxAa = numOrNull(rec.context_window_tokens);
    if (ctxAa) {
      const cur = spec.context_window;
      if (FORCE || !cur) {
        if (cur !== ctxAa) {
          next = setModelSpecField(next, "context_window", String(Math.round(ctxAa)));
          changes.push(`context_window: ${cur ?? "(none)"} → ${ctxAa}`);
        }
      }
    }

    // release_type
    const rtAa = deriveReleaseType(rec);
    if (rtAa) {
      const cur = spec.release_type;
      if (FORCE || !cur) {
        if (cur !== rtAa) {
          next = setModelSpecField(next, "release_type", rtAa);
          changes.push(`release_type: ${cur ?? "(none)"} → ${rtAa}`);
        }
      }
    }

    // modalities_in / modalities_out
    const inAa = deriveModalitiesIn(rec);
    if (inAa) {
      const cur = spec.modalities_in;
      if (FORCE || !cur || cur.length === 0) {
        const same = Array.isArray(cur) && cur.join(",") === inAa.join(",");
        if (!same) {
          next = setModelSpecArray(next, "modalities_in", inAa);
          changes.push(`modalities_in: ${cur ?? "(none)"} → [${inAa.join(", ")}]`);
        }
      }
    }
    const outAa = deriveModalitiesOut(rec);
    if (outAa) {
      const cur = spec.modalities_out;
      if (FORCE || !cur || cur.length === 0) {
        const same = Array.isArray(cur) && cur.join(",") === outAa.join(",");
        if (!same) {
          next = setModelSpecArray(next, "modalities_out", outAa);
          changes.push(`modalities_out: ${cur ?? "(none)"} → [${outAa.join(", ")}]`);
        }
      }
    }

    if (changes.length) {
      reports.push({ slug: fm.slug, aaSlug: slug, changes });
      if (!DRY) await writeFile(path, next);
      touched++;
    }
  }

  log("\n=== Report ===");
  for (const r of reports) {
    log(`${r.slug.padEnd(40)} (AA: ${r.aaSlug})`);
    for (const c of r.changes) log(`  ${c}`);
  }
  log("\n=== Summary ===");
  log(`scanned    : ${scanned}`);
  log(`no aa_url  : ${noAa}`);
  log(`touched    : ${touched}`);
  if (DRY) log("\n(DRY RUN — no files written.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
