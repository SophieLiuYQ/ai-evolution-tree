#!/usr/bin/env node
/**
 * generate-nodes-from-companies.mjs
 *
 * Reads src/content/companies/*.mdx `catalog[]` and scaffolds missing
 * src/content/nodes/*.mdx files (schema-valid) for each catalog item that
 * has a `node_slug` but doesn't yet exist in the tree.
 *
 * This enables "A mode": every official model generation gets its own node.
 *
 * Usage:
 *   node scripts/generate-nodes-from-companies.mjs
 *   node scripts/generate-nodes-from-companies.mjs --company=openai
 *   node scripts/generate-nodes-from-companies.mjs --dry-run
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const COMPANIES_DIR = join(REPO_ROOT, "src", "content", "companies");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const ARG = {
  dryRun: argv.includes("--dry-run"),
  company: argv.find((a) => a.startsWith("--company="))?.split("=")[1],
};

const log = (...a) => console.log(...a);

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

const kebab = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/['"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const inferEra = (year) => {
  if (year >= 2025) return "frontier";
  if (year >= 2023) return "reasoning";
  if (year >= 2020) return "scale-era";
  return "transformer";
};

const inferCategory = (kind) => {
  const base = ["nlp"];
  if (!kind) return base;
  if (kind === "reasoning") return ["nlp", "reasoning"];
  if (kind === "multimodal") return ["nlp", "multimodal"];
  if (kind === "vision" || kind === "image") return ["cv", "generative"];
  if (kind === "video") return ["generative"];
  if (kind === "audio") return ["audio", "generative"];
  if (kind === "embedding" || kind === "reranker") return ["nlp"];
  if (kind === "tool") return ["agents"];
  return base;
};

const inferModalities = (kind) => {
  if (!kind) return ["text"];
  if (kind === "multimodal") return ["text", "vision"];
  if (kind === "vision" || kind === "image") return ["vision"];
  if (kind === "video") return ["video"];
  if (kind === "audio") return ["audio"];
  return ["text"];
};

const shortTitleFromId = (id) => {
  // Keep the original casing where it matters (GPT, Claude, Gemini).
  const s = String(id || "").trim();
  if (!s) return "Untitled model";
  if (/^gpt[-\s]?/i.test(s)) return s.toUpperCase().replace(/_/g, "-");
  return s.replace(/_/g, "-");
};

async function listNodeSlugs() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const slugs = new Set();
  for (const f of files) {
    const raw = await readFile(join(NODES_DIR, f), "utf-8");
    const { data } = matter(raw);
    if (data?.slug) slugs.add(String(data.slug));
  }
  return slugs;
}

function seriesFromId(companyName, id) {
  const s = String(id || "");
  // Basic heuristics: prefix before first digit cluster.
  const head = s.split(/[0-9]/)[0].replace(/[-_.]+$/, "");
  const h = kebab(head);
  if (!h) return `${companyName} Models`;
  if (h === "gpt") return `${companyName} GPT`;
  if (h === "claude") return `${companyName} Claude`;
  if (h === "gemini") return `${companyName} Gemini`;
  if (h === "llama") return `${companyName} Llama`;
  return `${companyName} ${head.trim()}`.trim();
}

function defaultRelationships(nodeSlug, knownSlugs) {
  // Minimal relationships by version bump: gpt-5-4 -> gpt-5-5, etc.
  const m = nodeSlug.match(/^(.*?)-(\d+)(?:-(\d+))?(?:-(\d+))?$/);
  if (!m) return [];
  const [, prefix, a, b, c] = m;
  // Prefer to bump the last numeric part.
  const nums = [a, b, c].filter(Boolean).map((x) => Number(x));
  if (!nums.length) return [];
  const prev = [...nums];
  prev[prev.length - 1] = prev[prev.length - 1] - 1;
  if (prev[prev.length - 1] < 0) return [];
  const prevSlug =
    prev.length === 1
      ? `${prefix}-${prev[0]}`
      : prev.length === 2
        ? `${prefix}-${prev[0]}-${prev[1]}`
        : `${prefix}-${prev[0]}-${prev[1]}-${prev[2]}`;
  if (!knownSlugs?.has(prevSlug)) return [];
  return [
    {
      to: prevSlug,
      type: "scales",
      note: "Next generation in the series",
    },
  ];
}

function mkPublicView(companyName, title) {
  const name = String(title || "this model");
  return {
    plain_english: `${name} is an official model release from ${companyName}. This node is a canonical record so the tree can track series evolution and benchmarks over time.`,
    analogy: `Treat it like a versioned “engine upgrade” in the same product line.`,
    applications: [
      { product: `${name} (API / product surface)`, company: companyName, year_deployed: new Date().getFullYear() },
      { product: `Developer tooling built on ${name}`, company: companyName, year_deployed: new Date().getFullYear() },
    ],
    investment_angle: `Once models evolve as fast as software versions, the winners are the platforms that can ship upgrades safely, measure regressions, and route workloads to the best operating point.`,
    why_it_matters: `Turning releases into nodes makes model evolution legible: you can compare generations, link lineage, and track benchmarks as they change.`,
  };
}

async function main() {
  const companyFiles = (await readdir(COMPANIES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const nodeSlugs = await listNodeSlugs();

  let created = 0;
  let skipped = 0;

  await mkdir(NODES_DIR, { recursive: true });

  for (const f of companyFiles) {
    const companySlug = f.replace(/\.mdx$/, "");
    if (ARG.company && ARG.company !== companySlug) continue;

    const raw = await readFile(join(COMPANIES_DIR, f), "utf-8");
    const { data } = matter(raw);
    const companyName = data?.name || companySlug;
    const orgs = data?.orgs || [];
    const org = orgs[0] || "Academic / Independent";
    const catalog = data?.catalog || [];

    if (!Array.isArray(catalog) || catalog.length === 0) {
      skipped++;
      continue;
    }

    for (const item of catalog) {
      const nodeSlug = item?.node_slug || kebab(item?.id);
      if (!nodeSlug) continue;
      if (nodeSlugs.has(nodeSlug)) continue;

      const releasedAt = item?.released_at ? new Date(item.released_at) : null;
      const year = releasedAt ? releasedAt.getUTCFullYear() : new Date().getUTCFullYear();
      const month = releasedAt ? String(releasedAt.getUTCMonth() + 1).padStart(2, "0") : "01";
      const day = releasedAt ? String(releasedAt.getUTCDate()).padStart(2, "0") : "01";
      const dateIso = releasedAt ? releasedAt.toISOString() : new Date(Date.UTC(year, 0, 1)).toISOString();

      const title = item?.label ? String(item.label) : shortTitleFromId(item?.id);
      const era = inferEra(year);
      const category = inferCategory(item?.kind);
      const family = seriesFromId(companyName, item?.id);
      const relationships = defaultRelationships(nodeSlug, nodeSlugs);
      const modalities = inferModalities(item?.kind);
      const homepage = data?.homepage;

      const fm = {
        slug: nodeSlug,
        title,
        date: dateIso,
        era,
        category,
        relationships,
        authors: [`${companyName} Team`],
        org,
        breakthrough_score: 6,
        status: "active",
        model_spec: {
          architecture: "Placeholder scaffold — fill with official specs and benchmark snapshots.",
          family,
          release_type: "api",
          modalities,
          homepage,
          ...(item?.api_model ? { api_model: item.api_model } : {}),
          benchmarks: [],
        },
        public_view: mkPublicView(companyName, title),
        citations: [
          {
            type: "release",
            key: `${kebab(companySlug)}_${kebab(item?.id || nodeSlug)}`.slice(0, 40),
            title,
            year,
            url: item?.source_url || homepage,
          },
        ],
      };

      // Ensure citation key fits the schema regex and starts with [a-z]
      if (!/^[a-z][a-z0-9_]*$/.test(fm.citations[0].key)) {
        fm.citations[0].key = `c_${kebab(companySlug)}_${kebab(nodeSlug)}`.replace(/-/g, "_").slice(0, 40);
      }

      // Ensure frontmatter required fields exist (url is optional in schema,
      // but we strongly prefer it).
      if (!fm.citations[0].url) delete fm.citations[0].url;

      const body = `## Notes\n\nTODO: Replace this placeholder with real specs, relationships, and benchmark-backed comparisons.\n`;
      const mdx = matter.stringify(body, stripUndefinedDeep(fm));

      const fileName = `${year}-${month}-${nodeSlug}.mdx`;
      const outPath = join(NODES_DIR, fileName);

      log(`+ scaffold node: ${companySlug} → ${fileName}`);
      created++;
      nodeSlugs.add(nodeSlug);

      if (!ARG.dryRun) {
        await writeFile(outPath, mdx);
      }
    }
  }

  log(`\nSummary:`);
  log(`  created ${created} node(s)`);
  log(`  skipped ${skipped} company file(s) (no catalog or filtered)`);
  if (ARG.dryRun) log(`  (DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
