#!/usr/bin/env node
/**
 * fix-aa-urls.mjs — Validate and repair `aa_url` (Artificial Analysis link)
 * across every node MDX. Many URLs were authored by hand and 404 because
 * AA's slug doesn't match our slug (e.g. "qwen-3-max-thinking" vs
 * "qwen3-max-thinking-preview"; "r1-1776" valid, "claude-opus-4-7" not).
 *
 * Strategy:
 *   1. Fetch /models, parse the embedded RSC payload (same trick as
 *      fetch-aa-benchmarks.mjs) → canonical slug catalog.
 *   2. For each MDX node with an existing aa_url:
 *      - If the slug at the end of the URL is in AA's catalog → keep.
 *      - Otherwise: fuzzy-match against AA catalog by node title +
 *        model_spec.family + slug. Pick the best score above a
 *        confidence threshold.
 *      - If no good match: drop the field (better than a 404).
 *   3. For nodes WITHOUT aa_url, optionally suggest one via fuzzy match
 *      (--add-missing).
 *
 * Usage:
 *   node scripts/fix-aa-urls.mjs --dry-run            # report only
 *   node scripts/fix-aa-urls.mjs                      # rewrite MDX
 *   node scripts/fix-aa-urls.mjs --add-missing        # also fill blanks
 *   node scripts/fix-aa-urls.mjs --slug=gpt-5         # one node
 *   node scripts/fix-aa-urls.mjs --verbose
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
const ADD_MISSING = argv.includes("--add-missing");
const ONE_SLUG = argv.find((a) => a.startsWith("--slug="))?.split("=")[1];
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");
// HEAD-validate every existing aa_url. 404s → force-replace via fuzzy
// match regardless of similarity score. Slow (one HTTP per node, ~10
// minutes for 450 URLs) but catches the "high-similarity bare-family
// slug that 404s" case (e.g. /models/o4 — looks plausible for o4-mini
// but actually 404).
const VALIDATE_HTTP = argv.includes("--validate-http");

const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

// ============== Scrape AA ==============
async function fetchAA() {
  log(`fetching ${AA_URL}…`);
  const r = await fetch(AA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ai-tree-fetch/0.1)",
      Accept: "text/html",
    },
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
      if (obj.model_family_slug || obj.model_slug || obj.slug) out.push(obj);
    } catch {
      // skip
    }
  }
  return out;
}

// Build the canonical catalog of valid AA slugs.
//
// AA's URL structure (verified via _check-aa-url.mjs): the canonical
// `/models/<slug>` segment matches `model_slug` field on the records.
// `model_family_slug` is also a valid URL — both forms 200 — and the
// family page lists all variants. We accept both.
function buildCatalog(records) {
  const slugs = new Map(); // slug → { name, family, score }
  for (const r of records) {
    const fam = r.model_family_slug;
    const slug = r.model_slug || r.slug;
    const name = r.model_name || r.name || slug;
    if (slug) {
      slugs.set(slug, {
        slug,
        name,
        family: fam,
        intel: r.intelligence_index ?? -1,
      });
    }
    if (fam && !slugs.has(fam)) {
      slugs.set(fam, { slug: fam, name: fam, family: fam, intel: -1 });
    }
  }
  return slugs;
}

// ============== Fuzzy match ==============
// Normalize: lowercase, strip non-alnum, common variant words.
const VARIANT_WORDS = new Set([
  "preview", "instruct", "reasoning", "thinking", "chat", "base", "coder",
  "vision", "vl", "mini", "nano", "flash", "pro", "max", "plus", "turbo",
  "high", "medium", "low", "xhigh", "ultra", "lite", "haiku", "sonnet",
  "opus", "instant", "reasoner", "moe", "dense",
]);

function tokenize(s) {
  if (!s) return [];
  // Replace non-alnum with space, then split at letter↔digit boundaries
  // so "qwen3" tokenizes as ["qwen", "3"] (matches "qwen-3" and "qwen 3").
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

// Jaccard over tokens, with two bonuses:
//   • numeric-set overlap (shared version numbers are strong signal)
//   • prefix match (how many tokens match in ORDER from the start) —
//     critical for distinguishing "gpt-5-3" from "gpt-3-5", which
//     have identical token sets but very different model lineage.
function similarity(a, b) {
  const tArr = tokenize(a);
  const tBrr = tokenize(b);
  const ta = new Set(tArr);
  const tb = new Set(tBrr);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  let j = inter / union;
  // Numeric-set overlap bonus.
  const numA = new Set([...ta].filter((t) => /^\d+$/.test(t)));
  const numB = new Set([...tb].filter((t) => /^\d+$/.test(t)));
  if (numA.size && numB.size) {
    let nInter = 0;
    for (const n of numA) if (numB.has(n)) nInter++;
    const nUnion = numA.size + numB.size - nInter;
    j += 0.15 * (nInter / nUnion);
  }
  // Prefix-match bonus.
  let pref = 0;
  const minLen = Math.min(tArr.length, tBrr.length);
  for (let i = 0; i < minLen; i++) {
    if (tArr[i] === tBrr[i]) pref++;
    else break;
  }
  if (minLen) j += 0.2 * (pref / minLen);
  return j;
}

// Pick best AA catalog entry for a given node. Score = max similarity
// over (title, slug, family). Returns {entry, score} or null.
function bestMatch(catalog, node) {
  const queries = [node.title, node.slug, node.family].filter(Boolean);
  let best = { entry: null, score: 0 };
  for (const [aaSlug, entry] of catalog.entries()) {
    let s = 0;
    for (const q of queries) {
      s = Math.max(s, similarity(q, entry.name));
      s = Math.max(s, similarity(q, entry.slug));
      if (entry.family) s = Math.max(s, similarity(q, entry.family));
    }
    if (s > best.score) best = { entry, score: s };
  }
  return best.score > 0 ? best : null;
}

// ============== YAML preserving rewrite ==============
// gray-matter stringify reorders keys → ugly diffs. Instead, surgically
// replace the aa_url line in-place. If the line is missing, we don't add
// (we only repair existing broken ones unless --add-missing).
function rewriteAaUrl(raw, newUrl, op /* "replace" | "add" | "remove" */) {
  const aaRe = /^(\s*aa_url:\s*).*\n?/m;
  const m = raw.match(aaRe);
  if (op === "remove") {
    if (m) return raw.replace(aaRe, "");
    return raw;
  }
  if (op === "replace" && m) {
    return raw.replace(aaRe, `${m[1]}'${newUrl}'\n`);
  }
  if (op === "add") {
    // Insert under model_spec — anchor on github / hf_url / homepage line.
    // Place right after first of: hf_url / github / homepage, otherwise
    // right before `public_view:`.
    const anchorRe = /^(\s*)(hf_url|github|homepage):.*\n/m;
    const am = raw.match(anchorRe);
    if (am) {
      const idx = raw.indexOf(am[0]);
      const indent = am[1];
      return raw.slice(0, idx) + `${indent}aa_url: '${newUrl}'\n` + raw.slice(idx);
    }
    // Fallback: leave alone.
    return raw;
  }
  return raw;
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

// ============== HEAD validation (slow path) ==============
// Concurrency-limited HEAD checks against AA. AA returns 200 for valid
// model pages, 404 for missing. Family-page slugs (e.g. /models/claude)
// are sometimes valid family aggregates and sometimes 404 — only HEAD
// can tell.
const HEAD_CACHE = new Map(); // url → status
async function headStatus(url) {
  if (HEAD_CACHE.has(url)) return HEAD_CACHE.get(url);
  try {
    // Use GET (HEAD often gets 405 from Next.js) but with a short timeout
    // and don't read the body.
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-tree-fix-aa-urls/0.1)" },
      signal: ac.signal,
    });
    clearTimeout(t);
    HEAD_CACHE.set(url, r.status);
    return r.status;
  } catch {
    HEAD_CACHE.set(url, 0);
    return 0;
  }
}
async function validateConcurrent(urls, concurrency = 16) {
  let i = 0;
  const results = new Array(urls.length);
  await Promise.all(
    new Array(concurrency).fill(0).map(async () => {
      while (i < urls.length) {
        const idx = i++;
        results[idx] = await headStatus(urls[idx]);
        if (idx % 50 === 0) vlog(`  validated ${idx}/${urls.length}`);
      }
    }),
  );
  return results;
}

// ============== Main ==============
async function main() {
  log(`fix-aa-urls — ${DRY ? "DRY RUN" : "LIVE"}${ADD_MISSING ? " · ADD-MISSING" : ""}${VALIDATE_HTTP ? " · HEAD-VALIDATE" : ""}`);
  const html = await fetchAA();
  const blob = unescapeRSC(html);
  const records = parseRecords(blob);
  log(`parsed ${records.length} rich records`);
  const catalog = buildCatalog(records);
  log(`built catalog of ${catalog.size} valid AA slugs`);
  if (VERBOSE) {
    const sample = [...catalog.values()].slice(0, 5);
    for (const s of sample) vlog("sample:", s.slug, "→", s.name);
  }

  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );

  // Optional pre-pass: HEAD-validate every existing aa_url so the
  // decision logic below can force-replace 404s.
  const httpStatusByUrl = new Map();
  if (VALIDATE_HTTP) {
    log("HEAD-validating existing aa_urls…");
    const allUrls = new Set();
    for (const f of files) {
      const raw = await readFile(join(NODES_DIR, f), "utf-8");
      const { data: fm } = matter(raw);
      const u = fm?.model_spec?.aa_url;
      if (u) allUrls.add(u);
    }
    const urls = [...allUrls];
    const statuses = await validateConcurrent(urls, 12);
    urls.forEach((u, i) => httpStatusByUrl.set(u, statuses[i]));
    const ok = statuses.filter((s) => s >= 200 && s < 400).length;
    const bad = statuses.length - ok;
    log(`  ${ok}/${statuses.length} returned 2xx/3xx, ${bad} broken`);
  }

  let totalNodes = 0;
  let valid = 0;
  let fixed = 0;
  let removed = 0;
  let added = 0;
  let unmatched = 0;
  const reports = [];

  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm } = matter(raw);
    if (!fm?.slug) continue;
    if (ONE_SLUG && fm.slug !== ONE_SLUG) continue;

    totalNodes++;
    const node = {
      slug: fm.slug,
      title: fm.title,
      family: fm.model_spec?.family,
    };
    const existing = fm.model_spec?.aa_url;

    if (existing) {
      const slug = urlSlug(existing);
      const inCatalog = slug && catalog.has(slug);
      // Score the existing URL's slug DIRECTLY against this node's
      // identity (title, slug, family). AA exposes many family pages
      // like /models/gemini-2-5-pro that aren't in our scraped catalog
      // but ARE valid 200 pages — we don't want to clobber them.
      const existingSlugScore = slug
        ? Math.max(
            similarity(node.title, slug),
            similarity(node.slug, slug),
            node.family ? similarity(node.family, slug) : 0,
          )
        : 0;
      // If catalog entry exists, also score against catalog metadata
      // (entry's display name and family). Take the max of both.
      const existingEntry = inCatalog ? catalog.get(slug) : null;
      let existingScore = existingSlugScore;
      if (existingEntry) {
        existingScore = Math.max(
          existingScore,
          similarity(node.title, existingEntry.name),
          existingEntry.family ? similarity(node.slug, existingEntry.family) : 0,
          node.family ? similarity(node.family, existingEntry.family || existingEntry.slug) : 0,
        );
      }
      const match = bestMatch(catalog, node);

      // HEAD-validation override (when --validate-http): if AA returned
      // 4xx/5xx for the existing URL, ignore similarity entirely — the
      // URL is a real 404 and must be replaced or dropped, even if it
      // happens to look superficially like the node identity.
      const httpStatus = httpStatusByUrl.get(existing);
      const httpBroken =
        VALIDATE_HTTP && httpStatus !== undefined && (httpStatus < 200 || httpStatus >= 400);

      // Decide: keep, replace, or drop.
      //   keepStrong: existingScore ≥ 0.55 (URL slug strongly matches node)
      //               AND (no HTTP info OR HTTP returned 2xx/3xx).
      //   replace:   best fuzzy match clearly better — must score ≥ 0.30
      //              AND beat existing by ≥ 0.15. OR HTTP-broken and any
      //              fuzzy match ≥ 0.30 (URL is a confirmed 404, replace
      //              with anything plausible).
      //   keepMediocre: existing isn't great but also not nonsense
      //              (≥ 0.30) — only when not HTTP-broken.
      //   drop:      existing has near-zero similarity (e.g. pi-zero
      //              robotics model whose aa_url got stamped to gpt-5-5),
      //              OR HTTP-broken with no plausible substitute.
      const keepStrong = !httpBroken && existingScore >= 0.55;
      // For HTTP-broken URLs, require a higher floor (0.5) on the
      // replacement match — a 0.3 score replacement (e.g.
      // pixtral-large → mistral-large-3) is more confusing than
      // dropping the link entirely.
      const replace = httpBroken
        ? match && match.score >= 0.5
        : match && match.score >= 0.3 && match.score > existingScore + 0.15;
      const keepMediocre = !httpBroken && existingScore >= 0.3;

      if (keepStrong) {
        valid++;
        vlog(`✓ ${fm.slug}: ${slug} (score=${existingScore.toFixed(2)})`);
        continue;
      }

      if (replace) {
        const newUrl = `https://artificialanalysis.ai/models/${match.entry.slug}`;
        if (newUrl === existing) {
          valid++;
          continue;
        }
        reports.push({
          op: "replace",
          slug: fm.slug,
          title: fm.title,
          before: existing,
          after: newUrl,
          aaName: match.entry.name,
          score: match.score.toFixed(2),
          existingScore: existingScore.toFixed(2),
          inCatalog,
        });
        if (!DRY) {
          await writeFile(path, rewriteAaUrl(raw, newUrl, "replace"));
        }
        fixed++;
        continue;
      }

      if (keepMediocre) {
        valid++;
        vlog(`~ ${fm.slug}: ${slug} (score=${existingScore.toFixed(2)}, mediocre)`);
        continue;
      }

      reports.push({
        op: "remove",
        slug: fm.slug,
        title: fm.title,
        before: existing,
        score: match ? match.score.toFixed(2) : "0",
        existingScore: existingScore.toFixed(2),
        bestGuess: match?.entry.slug ?? "(none)",
        inCatalog,
      });
      if (!DRY) {
        await writeFile(path, rewriteAaUrl(raw, "", "remove"));
      }
      removed++;
      unmatched++;
    } else if (ADD_MISSING) {
      const match = bestMatch(catalog, node);
      if (match && match.score >= 0.65) {
        const newUrl = `https://artificialanalysis.ai/models/${match.entry.slug}`;
        reports.push({
          op: "add",
          slug: fm.slug,
          title: fm.title,
          after: newUrl,
          aaName: match.entry.name,
          score: match.score.toFixed(2),
        });
        if (!DRY) {
          await writeFile(path, rewriteAaUrl(raw, newUrl, "add"));
        }
        added++;
      }
    }
  }

  // Sort reports for legibility
  reports.sort((a, b) => (a.op || "").localeCompare(b.op) || a.slug.localeCompare(b.slug));
  log("\n=== Report ===");
  for (const r of reports) {
    if (r.op === "replace") {
      log(`FIX  ${r.slug.padEnd(36)} ${r.before} → ${r.after}  [${r.aaName}, score=${r.score}]`);
    } else if (r.op === "remove") {
      log(`DROP ${r.slug.padEnd(36)} ${r.before}  (best guess: ${r.bestGuess}, score=${r.score})`);
    } else if (r.op === "add") {
      log(`ADD  ${r.slug.padEnd(36)} → ${r.after}  [${r.aaName}, score=${r.score}]`);
    }
  }
  log("\n=== Summary ===");
  log(`scanned    : ${totalNodes}`);
  log(`already valid: ${valid}`);
  log(`fixed      : ${fixed}`);
  log(`removed    : ${removed}`);
  if (ADD_MISSING) log(`added      : ${added}`);
  log(`unmatched  : ${unmatched}`);
  if (DRY) log("\n(DRY RUN — no files written.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
