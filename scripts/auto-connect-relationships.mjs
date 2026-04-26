#!/usr/bin/env node
/**
 * auto-connect-relationships.mjs
 *
 * Builds a conservative relationship network using ONLY:
 * - builds_on
 * - competes_with
 * - open_alt_to
 *
 * Goals:
 * - Preserve curated edges; never delete or rewrite existing ones.
 * - Keep graph readable: cap auto-added edges per node.
 *
 * Strategy:
 * 1) builds_on: ensure same-series evolution has a builds_on edge
 *    (delegated to scripts/auto-connect-series.mjs; run it separately).
 * 2) competes_with: for each visible model node, add up to N competitors
 *    within the same year, based on capability/modality overlap.
 * 3) open_alt_to: for open-weight nodes, add one edge to a closed peer
 *    in the same year with similar capability/modality.
 *
 * Usage:
 *   node scripts/auto-connect-relationships.mjs --dry-run
 *   node scripts/auto-connect-relationships.mjs
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

const MAX_COMPETES_PER_NODE = 1;
// "Timeframe" overlap: same calendar year only (handled by byYear buckets).

// Price-tier buckets, derived from the "Price ($/M tokens)" benchmark row.
// Uses the average of (in,out) when both are available.
// These are intentionally coarse — the goal is "same tier", not precision.
const PRICE_TIERS = [
  { id: "free", max: 0 }, // $0
  { id: "cheap", max: 1 }, // ≤ $1/M
  { id: "mid", max: 5 }, // ≤ $5/M
  { id: "premium", max: Infinity }, // > $5/M
];

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

function aaIntelligenceIndex(fm) {
  const benches = fm?.model_spec?.benchmarks ?? [];
  const row = benches.find((b) =>
    String(b.name).toLowerCase().includes("aa intelligence index"),
  );
  if (!row) return null;
  const nums = String(row.score ?? "").match(/-?\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const parsed = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (!parsed.length) return null;
  return Math.max(...parsed);
}

function parsePriceAvgUsdPerM(fm) {
  const benches = fm?.model_spec?.benchmarks ?? [];
  const row = benches.find((b) =>
    String(b.name ?? "").toLowerCase().includes("price"),
  );
  if (!row) return null;
  const s = String(row.score ?? "");
  // Examples: "$5.00 in / $15.00 out", "$0.00", "0" etc.
  const nums = Array.from(s.matchAll(/\$?\s*([0-9]+(?:\.[0-9]+)?)/g))
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  // If score includes both in/out, average them; else use the single number.
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  return nums[0];
}

function priceTierId(fm) {
  const avg = parsePriceAvgUsdPerM(fm);
  if (avg == null) return null;
  for (const t of PRICE_TIERS) {
    if (avg <= t.max) return t.id;
  }
  return null;
}

function setOverlap(a, b) {
  let c = 0;
  for (const x of a) if (b.has(x)) c++;
  return c;
}

function tagSets(fm) {
  const cats = new Set((fm.category ?? []).map((c) => String(c).toLowerCase()));
  const modalities = new Set(
    ["nlp", "cv", "video", "audio", "multimodal"].filter((t) => cats.has(t)),
  );
  const caps = new Set(
    ["agents", "reasoning", "code", "world_model"].filter((t) => cats.has(t)),
  );
  const isPaper = cats.has("paper");
  return { modalities, caps, isPaper };
}

function edgeKey(type, a, b) {
  // undirected for competes/open_alt, directed for builds_on (caller decides)
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${type}@@${x}@@${y}`;
}

function hasRel(fm, to, type) {
  const rels = Array.isArray(fm.relationships) ? fm.relationships : [];
  return rels.some((r) => r?.to === to && r?.type === type);
}

function anyEdgeBetween(edgeSet, type, a, b) {
  return edgeSet.has(edgeKey(type, a, b));
}

function releaseBucket(fm) {
  const rt = fm?.model_spec?.release_type;
  if (rt === "open_weights") return "open";
  if (rt === "api" || rt === "product") return "closed";
  return "other";
}

function daysBetween(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter(
    (f) => f.endsWith(".mdx") && !f.startsWith("_"),
  );
  const nodes = [];
  const bySlug = new Map();
  let sawFeatured = false;
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;
    if (fm.graph_hidden) continue; // skip hidden variants
    if (!fm.model_spec) continue; // only connect models
    if (fm.graph_featured) sawFeatured = true;
    const dt = dateValue(fm.date);
    if (!dt) continue;
    const year = dt.getUTCFullYear();
    const tags = tagSets(fm);
    const aa = aaIntelligenceIndex(fm);
    const bucket = releaseBucket(fm);
    const tier = priceTierId(fm);
    const rels = Array.isArray(fm.relationships) ? fm.relationships : [];
    nodes.push({ f, path, fm, content, dt, year, tags, aa, bucket, tier, rels });
    bySlug.set(String(fm.slug), nodes[nodes.length - 1]);
  }

  // If the site is in featured-only mode, only auto-connect edges among
  // featured nodes. Otherwise, we would add too many links that never
  // appear on the main graph.
  const active = sawFeatured
    ? nodes.filter((n) => !!n.fm.graph_featured)
    : nodes;

  // Before auto-adding, prune prior auto-generated alternatives so the
  // output reflects the current heuristic (curated edges are preserved).
  for (const n of nodes) {
    const rels = Array.isArray(n.fm.relationships) ? n.fm.relationships : [];
    const keep = rels.filter((r) => {
      if (!r?.type) return true;
      if (r.type !== "competes_with" && r.type !== "open_alt_to") return true;
      const note = String(r.note ?? "");
      // Only delete our own previous auto-links.
      return !note.startsWith("Auto:");
    });
    if (keep.length !== rels.length) {
      n.fm.relationships = keep;
      n.rels = keep;
      if (!ARG.dryRun) {
        await writeFile(n.path, matter.stringify(n.content, stripUndefinedDeep(n.fm)));
      }
    }
  }

  // Build quick lookup of existing undirected edges.
  const edgeSet = new Set();
  for (const n of nodes) {
    for (const r of n.rels) {
      if (!r?.to || !r?.type) continue;
      if (r.type === "competes_with" || r.type === "open_alt_to") {
        edgeSet.add(edgeKey(r.type, String(n.fm.slug), String(r.to)));
      }
    }
  }

  // Year buckets
  const byYear = new Map();
  for (const n of active) {
    (byYear.get(n.year) ?? byYear.set(n.year, []).get(n.year)).push(n);
  }

  let touched = 0;
  let added = 0;

  // ===== competes_with =====
  for (const [year, list] of byYear.entries()) {
    // Compare each node only within same year.
    for (const n of list) {
      // Don't add competition edges for pure "paper" nodes.
      if (n.tags.isPaper) continue;
      // Require a known price tier — avoids "everything points at GPT-5.5"
      // when one side has missing pricing.
      if (!n.tier) continue;

      // Count existing competes edges from this node.
      const curCompetes = (n.fm.relationships ?? []).filter(
        (r) => r?.type === "competes_with",
      ).length;
      if (curCompetes >= MAX_COMPETES_PER_NODE) continue;

      const candidates = [];
      for (const m of list) {
        if (m === n) continue;
        if (m.fm.org === n.fm.org) continue; // same org isn't competition here
        if (m.tags.isPaper) continue;
        if (!m.tier) continue;
        if (m.tier !== n.tier) continue; // price-tier overlap
        const modOverlap = setOverlap(n.tags.modalities, m.tags.modalities);
        if (modOverlap === 0) continue;
        const capOverlap = setOverlap(n.tags.caps, m.tags.caps);
        if (capOverlap === 0) continue; // capability overlap REQUIRED
        const score = modOverlap * 3 + capOverlap;
        if (score <= 0) continue;
        // Skip if already competes or open_alt exists between them.
        const a = String(n.fm.slug);
        const b = String(m.fm.slug);
        if (anyEdgeBetween(edgeSet, "competes_with", a, b)) continue;
        if (anyEdgeBetween(edgeSet, "open_alt_to", a, b)) continue;
        candidates.push({ m, score });
      }
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const bAA = b.m.aa ?? -Infinity;
        const aAA = a.m.aa ?? -Infinity;
        if (bAA !== aAA) return bAA - aAA;
        return b.m.dt.getTime() - a.m.dt.getTime();
      });

      const want = Math.max(0, MAX_COMPETES_PER_NODE - curCompetes);
      const picks = candidates.slice(0, want);
      if (!picks.length) continue;

      const rels = Array.isArray(n.fm.relationships) ? [...n.fm.relationships] : [];
      for (const { m } of picks) {
        const to = String(m.fm.slug);
        rels.push({
          to,
          type: "competes_with",
          note: "Auto: overlap on capability + modality + timeframe + price tier",
        });
        edgeSet.add(edgeKey("competes_with", String(n.fm.slug), to));
        added++;
      }

      const nextFm = { ...n.fm, relationships: rels };
      touched++;
      if (!ARG.dryRun) {
        await writeFile(n.path, matter.stringify(n.content, stripUndefinedDeep(nextFm)));
      }
    }
  }

  // ===== open_alt_to =====
  for (const [year, list] of byYear.entries()) {
    const open = list.filter((n) => n.bucket === "open");
    const closed = list.filter((n) => n.bucket === "closed");
    if (!open.length || !closed.length) continue;

    for (const n of open) {
      // At most 1 open_alt_to per node.
      const cur = (n.fm.relationships ?? []).some((r) => r?.type === "open_alt_to");
      if (cur) continue;
      if (n.tags.isPaper) continue;
      if (!n.tier) continue;

      const candidates = [];
      for (const m of closed) {
        if (m.fm.org === n.fm.org) continue;
        if (!m.tier) continue;
        if (m.tier !== n.tier) continue;
        const modOverlap = setOverlap(n.tags.modalities, m.tags.modalities);
        if (modOverlap === 0) continue;
        const capOverlap = setOverlap(n.tags.caps, m.tags.caps);
        if (capOverlap === 0) continue;
        const score = modOverlap * 3 + capOverlap;
        if (score <= 0) continue;
        const a = String(n.fm.slug);
        const b = String(m.fm.slug);
        if (anyEdgeBetween(edgeSet, "open_alt_to", a, b)) continue;
        if (anyEdgeBetween(edgeSet, "competes_with", a, b)) continue;
        candidates.push({ m, score });
      }
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const bAA = b.m.aa ?? -Infinity;
        const aAA = a.m.aa ?? -Infinity;
        if (bAA !== aAA) return bAA - aAA;
        return b.m.dt.getTime() - a.m.dt.getTime();
      });

      const best = candidates[0]?.m;
      if (!best) continue;

      const rels = Array.isArray(n.fm.relationships) ? [...n.fm.relationships] : [];
      rels.push({
        to: String(best.fm.slug),
        type: "open_alt_to",
        note: "Auto: overlap on capability + modality + timeframe + price tier",
      });
      edgeSet.add(edgeKey("open_alt_to", String(n.fm.slug), String(best.fm.slug)));
      added++;
      touched++;
      const nextFm = { ...n.fm, relationships: rels };
      if (!ARG.dryRun) {
        await writeFile(n.path, matter.stringify(n.content, stripUndefinedDeep(nextFm)));
      }
    }
  }

  console.log(`touched files: ${touched}`);
  console.log(`edges added: ${added}`);
  if (ARG.dryRun) console.log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
