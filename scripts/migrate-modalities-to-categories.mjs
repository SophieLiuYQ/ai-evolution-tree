#!/usr/bin/env node
/**
 * migrate-modalities-to-categories.mjs
 *
 * Keeps node `category[]` (node types) aligned with `model_spec.modalities`.
 * Also backfills `model_spec.modalities` when missing (best-effort, from categories).
 *
 * Rules:
 * - modalities -> categories:
 *   - audio -> "audio"
 *   - video -> "video"
 *   - image/vision -> "cv"
 *   - text -> "nlp" (if no other modality tags exist)
 *   - >=2 modalities -> add "multimodal"
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

function normMod(m) {
  const s = String(m ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "vision") return "image";
  if (s === "img") return "image";
  if (s === "text" || s === "nlp") return "text";
  if (s === "image" || s === "audio" || s === "video") return s;
  // Pass through unknown modality tokens (kept in model_spec only).
  return s;
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const a of arr) {
    if (!seen.has(a)) {
      out.push(a);
      seen.add(a);
    }
  }
  return out;
}

function inferModalitiesFromCategories(cats) {
  const set = new Set((cats ?? []).map((c) => String(c).toLowerCase()));
  const mods = [];
  if (set.has("audio")) mods.push("audio");
  if (set.has("video")) mods.push("video");
  if (set.has("cv") || set.has("vision") || set.has("image")) mods.push("image");
  if (!mods.length && (set.has("nlp") || set.has("text"))) mods.push("text");
  if (!mods.length) mods.push("text");
  return mods;
}

function categoriesFromModalities(mods) {
  const out = new Set();
  const mset = new Set(mods);
  if (mset.has("audio")) out.add("audio");
  if (mset.has("video")) out.add("video");
  if (mset.has("image")) out.add("cv");
  if (mset.size >= 2) out.add("multimodal");
  if (mset.size === 1 && mset.has("text")) out.add("nlp");
  return out;
}

async function main() {
  const files = (await readdir(NODES_DIR)).filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  let touched = 0;
  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const { data: fm, content } = matter(raw);
    if (!fm?.slug) continue;

    const cats = Array.isArray(fm.category) ? fm.category.map(String) : [];
    const ms = fm.model_spec ?? null;
    const hadModelSpec = !!ms;
    const modsRaw = Array.isArray(ms?.modalities) ? ms.modalities : null;
    const mods = uniq((modsRaw ?? inferModalitiesFromCategories(cats)).map(normMod).filter(Boolean));
    const wantedCatsFromMods = categoriesFromModalities(mods);

    // Merge: keep existing categories, but ensure modality-derived tags exist.
    const newCats = uniq([
      ...cats,
      ...Array.from(wantedCatsFromMods.values()),
    ]);

    // Backfill model_spec.modalities if missing/empty
    let msNext = ms;
    if (hadModelSpec) {
      if (!modsRaw || !modsRaw.length) {
        msNext = { ...ms, modalities: mods };
      }
    }

    const changedCats = newCats.join("|") !== cats.join("|");
    const changedMods =
      hadModelSpec &&
      msNext &&
      JSON.stringify(msNext.modalities ?? []) !== JSON.stringify(ms?.modalities ?? []);

    if (!changedCats && !changedMods) continue;

    const nextFm = {
      ...fm,
      category: newCats,
      model_spec: msNext ?? fm.model_spec,
    };
    touched++;
    if (!ARG.dryRun) {
      await writeFile(p, matter.stringify(content, stripUndefinedDeep(nextFm)));
    }
  }

  console.log(`touched files: ${touched}`);
  if (ARG.dryRun) console.log(`(DRY RUN — no files written.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

