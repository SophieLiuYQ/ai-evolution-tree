#!/usr/bin/env node
/**
 * validate-homepages.mjs — HEAD-validate every official-site URL the
 * model detail page might link out to, and clean up broken ones.
 *
 * Sources of "official URL":
 *   1. `model_spec.homepage` in each MDX (model-specific page, e.g.
 *      https://www.anthropic.com/news/claude-4-5).
 *   2. `ORG_HOMEPAGE[org]` in src/lib/org-links.ts (org-wide fallback,
 *      e.g. https://www.anthropic.com/).
 *
 * Behaviour:
 *   - Concurrent GETs (12-wide pool, follow redirects, 10s timeout).
 *   - 200/301/302/3xx → keep.
 *   - 4xx/5xx/network error → flag broken.
 *   - In LIVE mode:
 *       • Strip broken model-specific `homepage:` lines from the MDX.
 *       • Print broken ORG_HOMEPAGE entries to stderr — does NOT
 *         auto-edit org-links.ts because that file controls fallbacks
 *         for many orgs. Operator decides which ones to drop.
 *
 * Chinese-org sanity: we don't try to use Accept-Language / proxy
 * tricks; if the homepage is geo-blocked from the script's vantage
 * point but reachable from the user's browser, we'll wrongly mark it
 * broken. Mitigation: print HTTP code + final URL so the operator
 * can spot-check before applying.
 *
 * Usage:
 *   node scripts/validate-homepages.mjs --dry-run
 *   node scripts/validate-homepages.mjs                 # rewrite MDX
 *   node scripts/validate-homepages.mjs --org=Tencent   # one org only
 *   node scripts/validate-homepages.mjs --verbose
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
const VERBOSE = argv.includes("--verbose") || argv.includes("-v");
const ORG_FILTER = argv.find((a) => a.startsWith("--org="))?.split("=")[1];
const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log(" ", ...a);

// ============== HEAD pool ==============
const STATUS_CACHE = new Map();
async function probeUrl(url) {
  if (STATUS_CACHE.has(url)) return STATUS_CACHE.get(url);
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    // Use GET (some servers reject HEAD with 405) and follow redirects.
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ai-tree-validate-homepages/0.1)",
        "Accept": "text/html,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.5",
      },
      signal: ac.signal,
    });
    clearTimeout(t);
    const result = { status: r.status, finalUrl: r.url };
    STATUS_CACHE.set(url, result);
    return result;
  } catch (e) {
    const result = { status: 0, finalUrl: url, error: String(e?.message ?? e) };
    STATUS_CACHE.set(url, result);
    return result;
  }
}
async function probeMany(urls, concurrency = 12) {
  let i = 0;
  const out = new Array(urls.length);
  await Promise.all(
    new Array(concurrency).fill(0).map(async () => {
      while (i < urls.length) {
        const idx = i++;
        out[idx] = await probeUrl(urls[idx]);
        if (idx % 20 === 0) vlog(`  probed ${idx}/${urls.length}`);
      }
    }),
  );
  return out;
}

function isOk(status) {
  return status >= 200 && status < 400;
}

// Surgical YAML rewrite: strip the `homepage:` line under model_spec.
function removeHomepageLine(raw) {
  return raw.replace(/^(\s*)homepage:[^\n]*\n/m, "");
}

// ============== Parse ORG_HOMEPAGE from src/lib/org-links.ts ==============
async function loadOrgHomepages() {
  const path = join(REPO_ROOT, "src", "lib", "org-links.ts");
  const src = await readFile(path, "utf-8");
  // Match the ORG_HOMEPAGE block — lines like:  "OpenAI": "https://...",
  const m = src.match(/export const ORG_HOMEPAGE[^{]*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error("could not find ORG_HOMEPAGE block");
  const lines = m[1].split("\n");
  const map = new Map();
  for (const ln of lines) {
    const mm = ln.match(/"([^"]+)"\s*:\s*"([^"]+)"/);
    if (mm) map.set(mm[1], mm[2]);
  }
  return map;
}

// ============== Main ==============
async function main() {
  log(`validate-homepages — ${DRY ? "DRY RUN" : "LIVE"}${ORG_FILTER ? ` · org=${ORG_FILTER}` : ""}`);
  const orgHomes = await loadOrgHomepages();
  log(`loaded ${orgHomes.size} ORG_HOMEPAGE entries`);

  // 1. Collect node-side homepages.
  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );
  const nodeHomes = []; // { file, slug, org, url }
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm } = matter(raw);
    if (!fm?.slug) continue;
    if (ORG_FILTER && fm.org !== ORG_FILTER) continue;
    const url = fm?.model_spec?.homepage;
    if (url) nodeHomes.push({ file: path, slug: fm.slug, org: fm.org, url });
  }
  log(`found ${nodeHomes.length} node-specific homepages`);

  // 2. Collect ORG_HOMEPAGE values to probe.
  const orgEntries = [...orgHomes.entries()]
    .filter(([org]) => !ORG_FILTER || org === ORG_FILTER)
    .map(([org, url]) => ({ org, url }));
  log(`found ${orgEntries.length} ORG_HOMEPAGE entries to probe`);

  // 3. Concurrent probe.
  const allUrls = [
    ...nodeHomes.map((n) => n.url),
    ...orgEntries.map((o) => o.url),
  ];
  const dedup = [...new Set(allUrls)];
  log(`probing ${dedup.length} unique URLs…`);
  const statuses = await probeMany(dedup, 12);
  const byUrl = new Map();
  dedup.forEach((u, i) => byUrl.set(u, statuses[i]));

  // 4. Report broken ORG_HOMEPAGE entries (do not auto-edit).
  log("\n=== ORG_HOMEPAGE check ===");
  const brokenOrgs = [];
  for (const { org, url } of orgEntries) {
    const r = byUrl.get(url);
    if (!isOk(r.status)) {
      brokenOrgs.push({ org, url, status: r.status, finalUrl: r.finalUrl });
      log(`  ✗ ${org.padEnd(28)} HTTP ${r.status}  ${url}`);
    } else if (VERBOSE) {
      log(`  ✓ ${org.padEnd(28)} HTTP ${r.status}  ${url}`);
    }
  }
  if (brokenOrgs.length === 0) log("  all ORG_HOMEPAGE entries reachable");

  // 5. Per-node: rewrite MDX to drop broken model-specific homepages.
  log("\n=== Node-specific homepage check ===");
  let touched = 0;
  let okCount = 0;
  const brokenNodes = [];
  for (const n of nodeHomes) {
    const r = byUrl.get(n.url);
    if (isOk(r.status)) {
      okCount++;
      vlog(`  ✓ ${n.slug.padEnd(36)} ${n.url}`);
      continue;
    }
    brokenNodes.push({ ...n, status: r.status });
    log(`  ✗ ${n.slug.padEnd(36)} HTTP ${r.status}  ${n.url}`);
    if (!DRY) {
      const raw = await readFile(n.file, "utf-8");
      const next = removeHomepageLine(raw);
      if (next !== raw) {
        await writeFile(n.file, next);
        touched++;
      }
    }
  }

  log("\n=== Summary ===");
  log(`node homepages valid : ${okCount}`);
  log(`node homepages broken: ${brokenNodes.length}${DRY ? " (dry-run, no files written)" : ` (rewrote ${touched} files)`}`);
  log(`ORG_HOMEPAGE broken  : ${brokenOrgs.length} (review src/lib/org-links.ts)`);
  if (brokenOrgs.length) {
    log("\nSuggested removals from src/lib/org-links.ts:");
    for (const b of brokenOrgs) log(`  - "${b.org}": HTTP ${b.status}`);
  }
  if (DRY) log("\n(DRY RUN — no files written.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
