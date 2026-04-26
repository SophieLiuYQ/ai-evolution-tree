#!/usr/bin/env node
/**
 * collapse-series-nodes.mjs
 *
 * Collapses SKU-level model variants into one "series" node:
 * - Creates/updates a parent node (series slug) with `model_spec.variants[]`
 * - Marks the child nodes as `graph_hidden: true` so the /tree/ stays readable
 *
 * This is specifically designed for the AA-imported nodes that ballooned
 * the graph (hundreds of vendor SKUs, tiers, and minor variants).
 *
 * Usage:
 *   node scripts/collapse-series-nodes.mjs --dry-run
 *   node scripts/collapse-series-nodes.mjs --min=5
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const ARG = {
  dryRun: argv.includes("--dry-run"),
  min: Number(argv.find((a) => a.startsWith("--min="))?.split("=")[1] ?? "4"),
};

const log = (...a) => console.log(...a);

const stripUndefinedDeep = (v) => {
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
};

function isAAScaffold(frontmatter) {
  const arch = String(frontmatter?.model_spec?.architecture ?? "");
  if (arch.includes("Placeholder scaffold")) return true;
  const url = String(frontmatter?.citations?.[0]?.url ?? "");
  if (url.includes("artificialanalysis.ai/models/")) return true;
  return false;
}

function parseScoreNum(score) {
  const m = String(score ?? "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function seriesSlugFor(slug, knownSlugs) {
  const parts = String(slug).split("-").filter(Boolean);
  if (parts.length <= 1) return slug;

  // ===== Nvidia Nemotron special cases =====
  // Keep to minor version for Nemotron core series.
  if (String(slug).startsWith("nvidia-nemotron-")) {
    const m = String(slug).match(/^nvidia-nemotron-(\d+)/);
    if (m) return `nvidia-nemotron-${m[1]}`;
  }
  // Collapse Nemotron Nano sizes into one series.
  if (String(slug).startsWith("nvidia-nemotron-nano-")) return "nvidia-nemotron-nano";
  // Collapse Llama Nemotron branding to avoid confusing Meta's Llama.
  if (String(slug).includes("-nemotron-")) {
    // Keep prefix + up to major.minor + "nemotron"
    const idx = parts.indexOf("nemotron");
    if (idx > 0) {
      const head = parts.slice(0, idx + 1);
      // If there are numeric parts before nemotron, keep up to 2 of them.
      // Example: llama-3-1-nemotron-* -> llama-3-1-nemotron
      const out = head.join("-");
      return out;
    }
  }

  // ===== AI21 Jamba special cases =====
  // Collapse Jamba 1.x into a single Jamba-1 series node.
  if (String(slug).startsWith("jamba-1-")) return "jamba-1";
  if (String(slug).startsWith("jamba-reasoning-")) return "jamba-reasoning";

  // ===== DeepSeek special cases =====
  // Keep to minor version: deepseek-v3-2-0925 -> deepseek-v3-2, deepseek-v4-pro-high -> deepseek-v4
  if (String(slug).startsWith("deepseek-v")) {
    const m = String(slug).match(/^deepseek-(v\d+)(?:-(\d+))?/);
    if (m) {
      // Treat 4-digit suffixes as snapshot tags (e.g. 0324, 0925), not minor versions.
      if (m[2] && String(m[2]).length <= 2) return `deepseek-${m[1]}-${m[2]}`;
      return `deepseek-${m[1]}`;
    }
  }
  // Collapse chat/reasoner aliases into v4 series (they’re API surfaces, not true generations).
  if (String(slug) === "deepseek-chat" || String(slug) === "deepseek-reasoner") return "deepseek-v4";
  // Collapse distill SKUs into two series nodes.
  if (String(slug).startsWith("deepseek-r1-distill-llama-")) return "deepseek-r1-distill-llama";
  if (String(slug).startsWith("deepseek-r1-distill-qwen-")) return "deepseek-r1-distill-qwen";
  // Collapse r1 versioned snapshots (e.g. r1-0120) into deepseek-r1.
  if (String(slug).startsWith("deepseek-r1-") && !String(slug).includes("distill")) return "deepseek-r1";

  // ===== Xiaomi MiMo special cases =====
  // Keep to minor version: mimo-v2-5-pro -> mimo-v2-5; everything else in v2 -> mimo-v2.
  if (String(slug).startsWith("mimo-v2-5-")) return "mimo-v2-5";
  if (String(slug).startsWith("mimo-v2-")) return "mimo-v2";

  // ===== MiniMax special cases =====
  if (String(slug).startsWith("minimax-m1-")) return "minimax-m1";
  if (String(slug).startsWith("minimax-m2-")) return "minimax-m2";

  // ===== Liquid AI LFM special cases =====
  if (String(slug).startsWith("lfm2-5-")) return "lfm2-5";
  if (String(slug).startsWith("lfm2-")) return "lfm2";

  // ===== Qwen special cases =====
  // AA inventory includes tons of Qwen size/config SKUs. We collapse them by
  // major (Qwen 3) and a small set of true minor "series" (3.5, 3.6, 2.5, 1.5).
  if (String(slug).startsWith("qwen1-5-") || String(slug) === "qwen1-5") return "qwen-1-5";
  if (String(slug).startsWith("qwen2-5-") || String(slug) === "qwen2-5") return "qwen-2-5";
  if (String(slug) === "qwen-turbo") return "qwen-2-5";
  if (String(slug).startsWith("qwen3-5-") || String(slug) === "qwen3-5") return "qwen-3-5";
  if (String(slug).startsWith("qwen3-6-") || String(slug) === "qwen3-6") return "qwen-3-6";
  // Collapse legacy chat SKUs into the nearest major series buckets.
  if (String(slug).startsWith("qwen-chat-")) return "qwen-2";
  if (String(slug).startsWith("qwen2-")) return "qwen-2";
  if (String(slug).startsWith("qwen3-")) return "qwen-3";
  if (String(slug).startsWith("qwen1-")) return "qwen-1";

  // If first token looks like o1 / t1 / r1 etc and next is non-numeric,
  // treat token1 as the series root (o1-preview -> o1).
  const first = parts[0];
  const second = parts[1];
  if (/^[a-z]+\d+$/.test(first) && !/^\d+$/.test(second)) {
    if (knownSlugs.has(first)) return first;
    // keep as-is (e.g. "o1" isn't always split-friendly)
    return first;
  }

  // Special split for qwen3 -> qwen-3, llama3 -> llama-3
  const splitKnown = (p) => {
    const m = p.match(/^(qwen|llama)(\d+)$/);
    if (!m) return null;
    return { prefix: m[1], num: m[2] };
  };
  const sk = splitKnown(first);
  if (sk) {
    const nums = [sk.num];
    if (/^\d+$/.test(second)) nums.push(second);
    const out = [sk.prefix, ...nums].join("-");
    if (knownSlugs.has(out)) return out;
    // Prefer out even if not present yet.
    return out;
  }

  // General: prefix tokens until we hit first numeric-ish token, then include
  // up to one more numeric token (major.minor).
  const prefix = [];
  const nums = [];
  for (const p of parts) {
    if (nums.length === 0) {
      if (/^\d+$/.test(p)) {
        nums.push(p);
        continue;
      }
      if (/^\d+[a-z]+$/.test(p)) {
        nums.push(p); // e.g. 4o
        continue;
      }
      prefix.push(p);
      continue;
    }
    // nums already started
    if (nums.length < 2 && /^\d+$/.test(p)) {
      // Treat long numeric suffixes as snapshot tags (e.g. 2024, 0324), not minor versions.
      if (String(p).length <= 2) nums.push(p);
      continue;
    }
    break;
  }
  if (!nums.length) return slug;
  const out = [...prefix, ...nums].join("-");
  if (knownSlugs.has(out)) return out;
  return out;
}

async function readAllNodes() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const nodes = [];
  for (const f of files) {
    const path = join(NODES_DIR, f);
    const raw = await readFile(path, "utf-8");
    const { data, content } = matter(raw);
    nodes.push({ file: f, path, raw, fm: data, body: content });
  }
  return nodes;
}

function findFileForSlug(nodes, slug) {
  return nodes.find((n) => n.fm?.slug === slug) ?? null;
}

function fmtTitleFromSeriesSlug(s) {
  const parts = String(s).split("-").filter(Boolean);
  if (!parts.length) return s;
  const head = parts[0].toLowerCase();
  const HEAD_MAP = {
    gpt: "GPT",
    qwen: "Qwen",
    gemini: "Gemini",
    gemma: "Gemma",
    claude: "Claude",
    grok: "Grok",
    jamba: "Jamba",
    nemotron: "Nemotron",
    nova: "Nova",
    llama: "Llama",
    deepseek: "DeepSeek",
    mistral: "Mistral",
  };
  const brand = HEAD_MAP[head] ?? (head[0].toUpperCase() + head.slice(1));

  // Prefer "Brand 3.5" formatting when the next tokens are numbers.
  const rest = parts.slice(1);
  const numericPrefix = [];
  while (rest.length && /^\d+$/.test(rest[0]) && numericPrefix.length < 2) {
    numericPrefix.push(rest.shift());
  }
  const num = numericPrefix.length ? numericPrefix.join(".") : null;

  // Special: ...-nemotron becomes "Llama 3.1 Nemotron"
  if (parts.includes("nemotron")) {
    const idx = parts.indexOf("nemotron");
    const pre = parts.slice(0, idx);
    const post = parts.slice(idx + 1);
    const preTitle = fmtTitleFromSeriesSlug(pre.join("-"));
    const tail = post.length ? ` ${post.join(" ").toUpperCase()}` : "";
    return `${preTitle} Nemotron${tail}`.trim();
  }

  if (rest.length === 0) return num ? `${brand} ${num}` : brand;
  // If remaining tokens are descriptive, keep them as words.
  return `${num ? `${brand} ${num}` : brand} ${rest.join(" ")}`.replace(/\s+/g, " ").trim();
}

async function main() {
  const nodes = await readAllNodes();
  const slugSet = new Set(nodes.map((n) => String(n.fm?.slug)).filter(Boolean));

  const candidates = nodes.filter((n) => !n.fm?.graph_hidden && isAAScaffold(n.fm));
  const groups = new Map();
  for (const n of candidates) {
    const series = seriesSlugFor(n.fm.slug, slugSet);
    (groups.get(series) ?? groups.set(series, []).get(series)).push(n);
  }

  const actionable = [...groups.entries()].filter(([series, list]) => {
    if (list.length >= ARG.min) return true;
    // Also fold single snapshot SKUs into an existing parent series node.
    const parent = findFileForSlug(nodes, series);
    if (!!parent && !parent.fm?.graph_hidden && list.some((n) => n.fm.slug !== series)) return true;
    // Allow a small whitelist of “minor-version series nodes” even when
    // only one SKU exists (avoids leaving size-specific nodes visible).
    if (series === "qwen-1-5" && list.length >= 1) return true;
    return false;
  });
  actionable.sort((a, b) => b[1].length - a[1].length);

  log(`candidates: ${candidates.length}`);
  log(`series groups >= ${ARG.min}: ${actionable.length}`);

  let parentsTouched = 0;
  let childrenHidden = 0;
  let parentsCreated = 0;

  for (const [series, list] of actionable) {
    // Prefer an existing curated node as parent if present and not hidden.
    let parent = findFileForSlug(nodes, series);
    if (parent?.fm?.graph_hidden) parent = null;

    const org = list[0].fm.org;
    const family =
      list[0].fm.model_spec?.family ??
      `${org} ${series.split("-")[0]}`.trim();

    // Aggregate benchmarks: min-max across children for each benchmark name
    const benchAgg = new Map(); // name -> {min,max,example}
    for (const ch of list) {
      const benches = ch.fm.model_spec?.benchmarks ?? [];
      for (const b of benches) {
        const val = parseScoreNum(b.score);
        if (val == null) continue;
        const key = String(b.name);
        const prev = benchAgg.get(key);
        if (!prev) benchAgg.set(key, { min: val, max: val, example: b });
        else {
          prev.min = Math.min(prev.min, val);
          prev.max = Math.max(prev.max, val);
        }
      }
    }
    const parentBenchmarks = [...benchAgg.entries()]
      .map(([name, v]) => {
        const ex = v.example;
        const isPct = String(ex.score).includes("%");
        const score = isPct
          ? `${v.max.toFixed(1)}% (${v.min.toFixed(1)}–${v.max.toFixed(1)}%)`
          : v.max.toFixed(2);
        return {
          name,
          score,
          source_url: ex.source_url ?? (String(list[0].fm.citations?.[0]?.url ?? "") || undefined),
        };
      })
      .sort((a, b) => (parseScoreNum(b.score) ?? 0) - (parseScoreNum(a.score) ?? 0))
      .slice(0, 12);

    const variants = list
      .slice()
      .sort((a, b) => String(a.fm.title).localeCompare(String(b.fm.title)))
      .slice(0, 200)
      .map((ch) => ({
        id: String(ch.fm.slug),
        label: String(ch.fm.title).split(/\s[—–-]\s/)[0],
        status: "active",
      }));

    if (!parent) {
      // Create a new parent node file with placeholder content.
      const title = `${fmtTitleFromSeriesSlug(series)} — Series`;
      const dates = list
        .map((n) => n.fm?.date)
        .map((d) => (d instanceof Date ? d : d ? new Date(String(d)) : null))
        .filter((d) => d && !Number.isNaN(d.getTime()));
      const earliest = dates.length
        ? new Date(Math.min(...dates.map((d) => d.getTime())))
        : new Date();
      const dateIso = earliest.toISOString();
      const fm = {
        slug: series,
        title,
        date: dateIso,
        era: "frontier",
        category: ["nlp"],
        relationships: [],
        authors: [String(list[0].fm.authors?.[0] ?? `${org} Team`)],
        org,
        breakthrough_score: 6,
        status: "active",
        model_spec: {
          architecture: "Series node (collapsed variants).",
          family,
          release_type: list[0].fm.model_spec?.release_type ?? "api",
          modalities: list[0].fm.model_spec?.modalities ?? ["text"],
          benchmarks: parentBenchmarks,
          variants,
        },
        public_view: list[0].fm.public_view,
        citations: list[0].fm.citations,
      };
      const body = `## Notes\n\nThis is a collapsed series node. See the variant picker for SKU-level variants.\n`;
      const mdx = matter.stringify(body, stripUndefinedDeep(fm));
      const y = String(earliest.getUTCFullYear());
      const m = String(earliest.getUTCMonth() + 1).padStart(2, "0");
      const fileName = `${y}-${m}-${series}.mdx`;
      const outPath = join(NODES_DIR, fileName);

      log(`+ create series node: ${series} (${list.length} variants)`);
      parentsCreated++;
      parentsTouched++;
      nodes.push({ file: fileName, path: outPath, raw: mdx, fm, body });
      slugSet.add(series);
      if (!ARG.dryRun) await writeFile(outPath, mdx, "utf-8");
    } else {
      // Update parent node with variants + aggregated benchmarks
      const nextFm = { ...parent.fm };
      nextFm.model_spec = { ...(nextFm.model_spec ?? {}) };
      nextFm.model_spec.family = nextFm.model_spec.family ?? family;
      nextFm.model_spec.variants = variants;
      if (!Array.isArray(nextFm.model_spec.benchmarks) || nextFm.model_spec.benchmarks.length === 0) {
        nextFm.model_spec.benchmarks = parentBenchmarks;
      }
      const mdx = matter.stringify(parent.body ?? "", stripUndefinedDeep(nextFm));
      log(`~ update series node: ${series} (+${variants.length} variants)`);
      parentsTouched++;
      if (!ARG.dryRun) await writeFile(parent.path, mdx, "utf-8");
    }

    // Hide children
    for (const ch of list) {
      if (ch.fm.slug === series) continue;
      if (ch.fm.graph_hidden) continue;
      ch.fm.graph_hidden = true;
      const mdx = matter.stringify(ch.body ?? "", stripUndefinedDeep(ch.fm));
      childrenHidden++;
      if (!ARG.dryRun) await writeFile(ch.path, mdx, "utf-8");
    }
  }

  log("\nSummary:");
  log(`  parents created: ${parentsCreated}`);
  log(`  parents touched: ${parentsTouched}`);
  log(`  children hidden: ${childrenHidden}`);
  if (ARG.dryRun) log("  (DRY RUN — no files written.)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
