#!/usr/bin/env node
/**
 * preview-scorecards.mjs
 *
 * Lightweight preview of "track-based" ranking scorecards from existing
 * rank-style benchmark rows in MDX frontmatter.
 *
 * It does NOT fetch the web. It only parses:
 *   model_spec.benchmarks[].vs_baseline: "Rank #X of Y · ... · <Source>"
 *
 * Usage:
 *   node scripts/preview-scorecards.mjs --slugs=gpt-5,claude-opus-4-7,gemini-3-pro,deepseek-v3,o3
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

const argv = process.argv.slice(2);
const slugsArg = argv.find((a) => a.startsWith("--slugs="))?.split("=")[1];
const slugs = (slugsArg ? slugsArg.split(",") : ["gpt-5", "claude-opus-4-7", "gemini-3-pro", "deepseek-v3", "o3"])
  .map((s) => s.trim())
  .filter(Boolean);

function parseRank(vsBaseline) {
  if (typeof vsBaseline !== "string") return null;
  const m = vsBaseline.match(/Rank #(\d+)\s+of\s+(\d+)/i);
  if (!m) return null;
  const rank = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(rank) || !Number.isFinite(total) || total <= 0) return null;
  return { rank, total };
}

function fmtTopPct(rank, total) {
  const pct = (rank / total) * 100;
  if (pct < 1) return `Top <1%`;
  if (pct < 10) return `Top ${pct.toFixed(1)}%`;
  return `Top ${Math.round(pct)}%`;
}

function skillFromBenchName(name) {
  if (typeof name !== "string") return null;
  const i = name.indexOf(" · ");
  if (i === -1) return null;
  return name.slice(0, i).trim() || null;
}

function inferTracksFromSkills(skills) {
  const s = new Set(skills);
  const tracks = [];
  if (s.has("Video")) tracks.push("video");
  if (s.has("Generation")) tracks.push("image");
  if (s.has("Vision")) tracks.push("vision");
  if (s.has("Agentic")) tracks.push("agentic");
  if (s.has("Coding")) tracks.push("coding");
  if (s.has("Context")) tracks.push("long-context");
  if (s.has("Intelligence")) tracks.push("reasoning");
  return tracks.length ? tracks : ["general"];
}

async function loadModelsBySlug() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const out = new Map();
  for (const f of files) {
    const raw = await readFile(join(NODES_DIR, f), "utf-8");
    const { data: fm } = matter(raw);
    if (fm?.slug) out.set(String(fm.slug), { fm, file: f });
  }
  return out;
}

function buildScorecard(model) {
  const title = model.fm?.title ?? model.slug;
  const benchmarks = model.fm?.model_spec?.benchmarks ?? [];

  const rows = [];
  for (const b of benchmarks) {
    const rank = parseRank(b.vs_baseline);
    if (!rank) continue;
    const skill = skillFromBenchName(b.name) ?? "Other";
    rows.push({
      skill,
      name: b.name,
      score: b.score,
      vs_baseline: b.vs_baseline,
      rank: rank.rank,
      total: rank.total,
      top_pct: fmtTopPct(rank.rank, rank.total),
    });
  }

  const skills = [...new Set(rows.map((r) => r.skill))];
  const tracks = inferTracksFromSkills(skills);
  return { slug: model.slug, title, tracks, rows };
}

function groupBySkill(rows) {
  const m = new Map();
  for (const r of rows) {
    const arr = m.get(r.skill) ?? [];
    arr.push(r);
    m.set(r.skill, arr);
  }
  return m;
}

function printScorecards(scorecards) {
  const lines = [];
  for (const sc of scorecards) {
    lines.push(`${sc.title} (${sc.slug})`);
    lines.push(`Tracks: ${sc.tracks.join(", ")}`);
    if (sc.rows.length === 0) {
      lines.push(`Rank-based signals: none found (no "Rank #X of Y" rows)`);
      lines.push("");
      continue;
    }
    const bySkill = groupBySkill(sc.rows);
    const skillOrder = ["Agentic", "Coding", "Intelligence", "Vision", "Video", "Generation", "Context", "Preference", "Other"];
    const skills = [...bySkill.keys()].sort((a, b) => skillOrder.indexOf(a) - skillOrder.indexOf(b));
    for (const skill of skills) {
      const entries = bySkill.get(skill) ?? [];
      for (const e of entries) {
        lines.push(`- ${skill}: ${e.name.split(" · ").slice(1).join(" · ")} → ${e.score} (${e.rank}/${e.total}, ${e.top_pct})`);
      }
    }
    lines.push("");
  }

  // Dimension leaders within this selection (simple: best rank/total per skill)
  const allRows = scorecards.flatMap((s) => s.rows.map((r) => ({ ...r, model: s.slug, title: s.title })));
  const bySkill = groupBySkill(allRows);
  const skills = [...bySkill.keys()].sort();
  if (skills.length) {
    lines.push("Leaders within this 5-model set (by best rank ratio):");
    for (const skill of skills) {
      const entries = (bySkill.get(skill) ?? []).slice().sort((a, b) => (a.rank / a.total) - (b.rank / b.total));
      const top = entries.slice(0, 3).map((e) => `${e.title} (${e.rank}/${e.total})`).join(" · ");
      lines.push(`- ${skill}: ${top}`);
    }
  }

  process.stdout.write(lines.join("\n").trimEnd() + "\n");
}

async function main() {
  const bySlug = await loadModelsBySlug();
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length) {
    console.error(`Missing slugs: ${missing.join(", ")}`);
    process.exitCode = 1;
  }

  const models = slugs
    .filter((s) => bySlug.has(s))
    .map((s) => ({ slug: s, ...bySlug.get(s) }));

  const scorecards = models.map(buildScorecard);
  printScorecards(scorecards);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

