#!/usr/bin/env node
/**
 * enrich-model-metadata.mjs
 *
 * Populates model metadata fields across nodes using:
 * - Existing citations (for per-model official links)
 * - Org link fallbacks (for open-weights GitHub org)
 * - Artificial Analysis /models scrape (for AA page, context window, modalities, params)
 *
 * Conservative rules:
 * - Only write AA-linked fields when we can confidently map a node slug to
 *   an AA `model_family_slug` (exact match, or existing aa_url path).
 * - Only write homepage/github when missing (never overwrite).
 *
 * Usage:
 *   node scripts/enrich-model-metadata.mjs --dry-run
 *   node scripts/enrich-model-metadata.mjs
 *   node scripts/enrich-model-metadata.mjs --slug=gpt-5
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ONE_SLUG = argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");
const FULL = argv.includes("--full"); // allow filling context/modalities/params
const WRITE_SOURCES = argv.includes("--sources"); // add model_spec.sources[] entries
const AUTO_VERIFY = argv.includes("--auto-verify"); // set model_spec.last_verified_at when we touched spec
const MIN_DATE_RAW = argv.find((a) => a.startsWith("--min-date="))?.split("=")[1];
const MIN_DATE = MIN_DATE_RAW ? new Date(MIN_DATE_RAW) : new Date("2023-01-01");
const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

const AA_BASE = "https://artificialanalysis.ai/models";
const TODAY = new Date().toISOString().slice(0, 10);

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

function unescapeRSC(html) {
  const chunks = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g),
  ].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"),
  );
  return chunks.join("\n");
}

function parseRecords(blob) {
  const re = /\{"additional_text":/g;
  const out = [];
  let m;
  while ((m = re.exec(blob)) !== null) {
    let depth = 0;
    let i = m.index;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < blob.length; i++) {
      const c = blob[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    try {
      const obj = JSON.parse(blob.slice(start, i));
      if (obj.model_family_slug) out.push(obj);
    } catch {
      // ignore
    }
  }
  return out;
}

function aggregateByFamily(records) {
  const byFamily = new Map();
  for (const r of records) {
    const fam = r.model_family_slug;
    const ii = r.intelligence_index ?? -Infinity;
    const cur = byFamily.get(fam);
    if (!cur || (cur.intelligence_index ?? -Infinity) < ii) byFamily.set(fam, r);
  }
  return byFamily;
}

async function fetchAAFamilies() {
  log(`fetching ${AA_BASE}…`);
  const r = await fetch(AA_BASE, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ai-tree-enrich/0.1)",
      Accept: "text/html",
    },
  });
  if (!r.ok) throw new Error(`AA returned HTTP ${r.status}`);
  const html = await r.text();
  log(`  got ${html.length} bytes`);
  const blob = unescapeRSC(html);
  const records = parseRecords(blob);
  log(`  parsed ${records.length} rich records`);
  const byFamily = aggregateByFamily(records);
  log(`  aggregated into ${byFamily.size} families`);
  return byFamily;
}

function parseAAFamilyFromUrl(u) {
  try {
    const url = new URL(String(u));
    if (!url.hostname.includes("artificialanalysis.ai")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const i = parts.indexOf("models");
    if (i === -1) return null;
    const slug = parts[i + 1];
    return slug || null;
  } catch {
    return null;
  }
}

function aaUrlFromBenchmarks(benchmarks) {
  if (!Array.isArray(benchmarks)) return null;
  for (const b of benchmarks) {
    const u = b?.source_url;
    const fam = parseAAFamilyFromUrl(u);
    if (fam) return `${AA_BASE}/${fam}`;
  }
  return null;
}

function pickOfficialFromCitations(citations) {
  if (!Array.isArray(citations)) return null;
  // Prefer official release/blog URLs; avoid arXiv, HF, AA itself.
  const bad = (u) =>
    /arxiv\.org|huggingface\.co|artificialanalysis\.ai|llm-stats\.com/i.test(u);
  const preferred = new Set(["release", "blog", "talk"]);
  for (const c of citations) {
    const u = c?.url;
    if (!u || typeof u !== "string") continue;
    if (bad(u)) continue;
    if (preferred.has(c?.type)) return u;
  }
  for (const c of citations) {
    const u = c?.url;
    if (!u || typeof u !== "string") continue;
    if (bad(u)) continue;
    return u;
  }
  return null;
}

function pickHuggingFaceFromCitations(citations) {
  if (!Array.isArray(citations)) return null;
  for (const c of citations) {
    const u = c?.url;
    if (!u || typeof u !== "string") continue;
    if (/huggingface\.co/i.test(u)) return u;
  }
  return null;
}

function normalizeMods(v) {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((x) => String(x).toLowerCase().trim())
    .filter(Boolean)
    .map((x) => (x === "speech" ? "audio" : x));
  return out.length ? out : null;
}

function aaModsIO(rec) {
  const add = (arr, on, v) => {
    if (on) arr.push(v);
  };
  const modsIn = [];
  const modsOut = [];

  add(modsIn, !!rec.input_modality_text, "text");
  add(modsIn, !!rec.input_modality_image, "image");
  add(modsIn, !!rec.input_modality_video, "video");
  add(modsIn, !!rec.input_modality_speech, "audio");

  add(modsOut, !!rec.output_modality_text, "text");
  add(modsOut, !!rec.output_modality_image, "image");
  add(modsOut, !!rec.output_modality_video, "video");
  add(modsOut, !!rec.output_modality_speech, "audio");

  return {
    in: modsIn.length ? modsIn : null,
    out: modsOut.length ? modsOut : null,
  };
}

function fmtParamsFromAA(rec) {
  // AA provides a string `parameters` and a numeric active-param field
  // in billions (inference_parameters_active_billions).
  const p = typeof rec.parameters === "string" ? rec.parameters.trim() : "";
  const activeB = rec.inference_parameters_active_billions;
  if (p) {
    if (typeof activeB === "number" && !Number.isNaN(activeB) && activeB > 0) {
      const ab =
        activeB >= 1000
          ? `${(activeB / 1000).toFixed(2).replace(/\.00$/, "")}T`
          : `${activeB.toFixed(1).replace(/\.0$/, "")}B`;
      // If the string already mentions active/total, keep it verbatim.
      if (!/active|total|moe|experts/i.test(p)) return `${p} total / ${ab} active`;
    }
    return p;
  }
  if (typeof activeB === "number" && !Number.isNaN(activeB) && activeB > 0) {
    return `${activeB.toFixed(1).replace(/\.0$/, "")}B active`;
  }
  return null;
}

const normKey = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/['"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "");

function stripToKnownFamily(aaByFamily, slug) {
  if (!slug) return null;
  let s = String(slug);
  // If exact match exists, keep it.
  if (aaByFamily.has(s)) return s;
  // Otherwise, progressively strip suffix segments:
  //   gpt-5-4-pro-xhigh -> gpt-5-4-pro -> gpt-5-4
  while (s.includes("-")) {
    s = s.slice(0, s.lastIndexOf("-"));
    if (aaByFamily.has(s)) return s;
  }
  return null;
}

function isSeriesNode(fm, spec) {
  const t = String(fm?.title ?? "");
  if (/—\s*series\b/i.test(t)) return true;
  const arch = String(spec?.architecture ?? "");
  if (/series\s+node|collapsed\s+variants/i.test(arch)) return true;
  return false;
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.filter((s) => s && typeof s === "object" && typeof s.url === "string");
}

function ensureSource(spec, entry) {
  if (!spec.sources) spec.sources = [];
  const existing = normalizeSources(spec.sources);
  const url = String(entry.url).trim();
  if (!url) return false;
  if (existing.some((s) => String(s.url).trim() === url)) return false;
  spec.sources.push(entry);
  return true;
}

function pickBestRecordForSeries(aaByFamily, baseKey) {
  if (!baseKey) return null;
  let best = null;
  for (const rec of aaByFamily.values()) {
    const nameKey = normKey(rec?.name ?? "");
    const famKey = normKey(rec?.model_family_slug ?? "");
    if (!nameKey && !famKey) continue;
    // Prefix match on normalized name or family slug.
    if (
      (nameKey && nameKey.startsWith(baseKey)) ||
      (famKey && famKey.startsWith(baseKey))
    ) {
      const score = typeof rec.intelligence_index === "number"
        ? rec.intelligence_index
        : (typeof rec.estimated_intelligence_index === "number" ? rec.estimated_intelligence_index : -Infinity);
      if (!best || score > best.score) best = { rec, score };
    }
  }
  return best?.rec ?? null;
}

async function main() {
  const files = (await readdir(NODES_DIR))
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .sort();

  const aaByFamily = await fetchAAFamilies();
  const aaByNameKey = new Map();
  for (const [fam, rec] of aaByFamily.entries()) {
    const name = String(rec?.name ?? fam);
    const keys = new Set([
      normKey(fam),
      normKey(name),
      normKey(name.replace(/\([^)]*\)/g, "")),
    ]);
    for (const k of keys) {
      if (!k) continue;
      // Keep first to avoid silent ambiguous overwrites; later collisions
      // will fall back to slug-family stripping.
      if (!aaByNameKey.has(k)) aaByNameKey.set(k, rec);
    }
  }

  let touched = 0;
  let aaLinked = 0;
  let githubFilled = 0;
  let homepageFilled = 0;
  let sourcesAdded = 0;
  let verifiedStamped = 0;

  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const { data: fm, content } = matter(raw);

    if (ONE_SLUG && fm.slug !== ONE_SLUG) continue;
    if (!ONE_SLUG && fm?.date) {
      const d = new Date(fm.date);
      if (Number.isFinite(d.valueOf()) && d < MIN_DATE) continue;
    }

    const prevSpec = fm.model_spec ? structuredClone(fm.model_spec) : null;
    const spec = prevSpec ? structuredClone(prevSpec) : {};

    // If benchmarks cite an AA source_url, treat it as the most reliable AA
    // family link for this node (often already correct even when aa_url is stale).
    const aaFromBench = aaUrlFromBenchmarks(spec.benchmarks);
    const aaBenchFam = aaFromBench ? parseAAFamilyFromUrl(aaFromBench) : null;
    // Note: AA pages exist for both "model_family_slug" and per-model slugs.
    // Our AA scrape only aggregates model_family_slug, so aaBenchFam may not
    // exist in aaByFamily even though the URL is valid. Treat the benchmark URL
    // itself as canonical for linking.
    const aaBenchOk = !!aaBenchFam;

    // === Official / GitHub links (offline) ===
    if (!spec.homepage) {
      const u = pickOfficialFromCitations(fm.citations);
      if (u) {
        spec.homepage = u;
        homepageFilled++;
      }
    }
    if (!spec.hf_url) {
      const hf = pickHuggingFaceFromCitations(fm.citations);
      if (hf) spec.hf_url = hf;
    }
    const isOpen = spec.release_type === "open_weights" || (Array.isArray(spec.availability) && spec.availability.includes("open_weights"));
    if (isOpen && !spec.github) {
      // If any citation is GitHub, use it; else org GitHub as a fallback.
      const gh = Array.isArray(fm.citations)
        ? fm.citations.find((c) => typeof c?.url === "string" && /github\.com/i.test(c.url))?.url
        : null;
      spec.github = gh ?? spec.github;
      if (spec.github) githubFilled++;
    }

    // === AA-backed fields (online) ===
    const famFromUrlRaw = spec.aa_url ? parseAAFamilyFromUrl(spec.aa_url) : null;
    const famFromUrl = famFromUrlRaw && aaByFamily.has(famFromUrlRaw) ? famFromUrlRaw : null;
    const directFam = stripToKnownFamily(aaByFamily, fm.slug);
    const rawTitle = String(fm.title ?? "");
    const titleKey = normKey(
      rawTitle
        .replace(/—\s*series\b/gi, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\bpreview\b/gi, "")
        .split("—")[0],
    );
    const nameRec = titleKey ? aaByNameKey.get(titleKey) : null;

    const series = isSeriesNode(fm, spec);
    const seriesBaseKey = series ? normKey(rawTitle.replace(/—\s*series\b/gi, "").split("—")[0]) : null;
    const seriesRec = seriesBaseKey ? pickBestRecordForSeries(aaByFamily, seriesBaseKey) : null;

    const fam =
      // 1) If benchmark already points at a valid AA family, prefer it.
      (aaBenchOk ? aaBenchFam : null) ??
      // 2) If series node has a strong prefix match, use the best record.
      (seriesRec?.model_family_slug ? String(seriesRec.model_family_slug) : null) ??
      // 3) Existing aa_url if it resolves to a known family.
      famFromUrl ??
      // 4) Direct slug match or stripped suffix match.
      directFam ??
      // 5) Fuzzy title match.
      (nameRec?.model_family_slug ? String(nameRec.model_family_slug) : null);

    // Even if we can't map the AA URL to a scraped family record (AA also has
    // per-model pages), keep the exact AA page referenced by benchmarks.
    if (aaFromBench && (!spec.aa_url || spec.aa_url !== aaFromBench)) {
      spec.aa_url = aaFromBench;
    }

    const rec = fam ? (aaByFamily.get(fam) ?? nameRec) : (seriesRec ?? nameRec);
    if (rec) {
      const famSlug = String(rec.model_family_slug ?? fam ?? "").trim();
      if (famSlug) {
        // Prefer the exact per-model AA URL if it appeared in benchmark sources.
        // Otherwise, fall back to the family slug from our AA scrape.
        spec.aa_url = aaFromBench ?? `${AA_BASE}/${famSlug}`;
      }
      if (FULL) {
        const ctx = rec.context_window_tokens;
        if ((series || !spec.context_window) && typeof ctx === "number" && ctx > 0) {
          spec.context_window = ctx;
        }

        const { in: inMods, out: outMods } = aaModsIO(rec);
        if ((series || !spec.modalities_in) && inMods) spec.modalities_in = inMods;
        if ((series || !spec.modalities_out) && outMods) spec.modalities_out = outMods;
        if ((series || !spec.modalities) && (inMods || outMods)) {
          const merged = Array.from(new Set([...(inMods ?? []), ...(outMods ?? [])]));
          if (merged.length) spec.modalities = merged;
        }

        if (series || !spec.parameters) {
          const params = fmtParamsFromAA(rec);
          if (params) spec.parameters = params;
        }
      }

      // If AA provides an open-weights source URL, use it for HF/GitHub.
      const w = rec.model_weights_source_url;
      if (typeof w === "string" && w.trim()) {
        if (!spec.hf_url && /huggingface\.co/i.test(w)) spec.hf_url = w.trim();
        if (!spec.github && /github\.com/i.test(w)) spec.github = w.trim();
      }

      aaLinked++;
    }

    // === Provenance (offline, deterministic) ===
    let sourcesChanged = false;
    if (WRITE_SOURCES) {
      if (typeof spec.homepage === "string") {
        sourcesChanged =
          ensureSource(spec, {
            name: "Official",
            type: "official",
            url: spec.homepage,
            last_verified_at: TODAY,
            confidence: "high",
          }) || sourcesChanged;
      }
      if (typeof spec.github === "string") {
        const isOpen =
          spec.release_type === "open_weights" ||
          (Array.isArray(spec.availability) && spec.availability.includes("open_weights"));
        sourcesChanged =
          ensureSource(spec, {
            name: "GitHub",
            type: isOpen ? "official" : "community",
            url: spec.github,
            last_verified_at: TODAY,
            confidence: isOpen ? "high" : "medium",
          }) || sourcesChanged;
      }
      if (typeof spec.aa_url === "string") {
        sourcesChanged =
          ensureSource(spec, {
            name: "Artificial Analysis",
            type: "independent",
            url: spec.aa_url,
            last_verified_at: TODAY,
            confidence: "medium",
          }) || sourcesChanged;
      }
      if (typeof spec.hf_url === "string") {
        sourcesChanged =
          ensureSource(spec, {
            name: "Hugging Face",
            type: "community",
            url: spec.hf_url,
            last_verified_at: TODAY,
            confidence: "medium",
          }) || sourcesChanged;
      }
      if (sourcesChanged) sourcesAdded++;
    }

    if (AUTO_VERIFY) {
      if (!spec.last_verified_at && sourcesChanged) {
        spec.last_verified_at = TODAY;
        verifiedStamped++;
      }
    }

    // Write back if anything changed.
    const hadSpec = !!prevSpec;
    const nextSpec = stripUndefinedDeep(spec);
    const changed = JSON.stringify(prevSpec ?? {}) !== JSON.stringify(nextSpec);
    if (changed || (!hadSpec && Object.keys(nextSpec).length)) {
      fm.model_spec = nextSpec;
      touched++;
      vlog(`updated ${fm.slug}`);
      if (!DRY) {
        const out = matter.stringify(content, stripUndefinedDeep(fm));
        await writeFile(p, out);
      }
    }
  }

  log("");
  log("enrich-model-metadata summary:");
  log(`  ${touched} ${DRY ? "would update" : "updated"} node(s)`);
  log(`  homepage filled: ${homepageFilled}`);
  log(`  github filled:   ${githubFilled}`);
  log(`  AA linked:       ${aaLinked}`);
  log(`  sources added:   ${sourcesAdded}`);
  log(`  verified set:    ${verifiedStamped}`);
  if (DRY) log("  DRY RUN — drop --dry-run to commit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
