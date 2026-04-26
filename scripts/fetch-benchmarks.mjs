#!/usr/bin/env node
/**
 * fetch-benchmarks.mjs — Auto-generate benchmark scores from 5 leaderboards.
 *
 * For each model defined in src/content/nodes/*.mdx, query each of the 5
 * approved leaderboard sources, normalize the responses, and merge into the
 * node's `model_spec.benchmarks` frontmatter array.
 *
 * Sources (per project policy — same five as src/lib/benchmark-sources.ts):
 *   1. artificialanalysis.ai  — frontier reasoning + commercial APIs
 *   2. huggingface.co         — Open LLM Leaderboard (real public API)
 *   3. llm-stats.com          — cross-model spec + price comparison
 *   4. arena.ai (LMArena)     — human-preference Elo (Chatbot Arena)
 *   5. openrouter.ai          — traffic-weighted live rankings (real public API)
 *
 * Adapter contract — every source implements:
 *   {
 *     id: string,                                    // matches LBProvider
 *     label: string,
 *     async fetchAll(modelNames: string[]) → Map<modelName, BenchRow[]>
 *   }
 *
 * BenchRow shape (matches NODE_SCHEMA.md model_spec.benchmarks[i]):
 *   { name: string, score: string, vs_baseline?: string, source_url?: string }
 *
 * Usage:
 *   node scripts/fetch-benchmarks.mjs --dry-run            # log only, no writes
 *   node scripts/fetch-benchmarks.mjs --slug=gpt-5         # one node only
 *   node scripts/fetch-benchmarks.mjs --source=openrouter  # one source only
 *   node scripts/fetch-benchmarks.mjs                      # full sync
 *
 * Merge policy:
 *   • If a benchmark name already exists in MDX with `score` filled, KEEP MDX
 *     (hand-curated wins over scraped) — UNLESS --force flag is passed.
 *   • New benchmark rows from sources are appended.
 *   • Each new row is tagged with `source_url` so the page can link back.
 *
 * Status:
 *   ✅ huggingface — real `datasets-server` JSON API
 *   ✅ openrouter  — real `/api/v1/models` JSON API
 *   ⚠️  artificialanalysis — TODO: HTML/JSON-LD parse (no public API)
 *   ⚠️  llm-stats          — TODO: HTML parse
 *   ⚠️  arena (LMArena)    — TODO: gradio space scrape or community mirror
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const NODES_DIR = join(REPO_ROOT, "src", "content", "nodes");

// ============== CLI args ==============
const argv = process.argv.slice(2);
const ARG = {
  dryRun: argv.includes("--dry-run"),
  force: argv.includes("--force"),
  slug: argv.find((a) => a.startsWith("--slug="))?.split("=")[1],
  source: argv.find((a) => a.startsWith("--source="))?.split("=")[1],
  verbose: argv.includes("--verbose") || argv.includes("-v"),
};

const log = (...a) => console.log(...a);
const vlog = (...a) => ARG.verbose && console.log("  [v]", ...a);

function asWantedList(input) {
  if (Array.isArray(input) && input.length && typeof input[0] === "object") return input;
  return (input ?? []).map((modelName) => ({ modelName }));
}

function getWantedName(wanted) {
  return typeof wanted === "string" ? wanted : wanted?.modelName;
}

// ============== Source adapters ==============

async function loadDotEnvLocal() {
  const paths = [join(REPO_ROOT, ".env.local"), join(REPO_ROOT, ".env")];
  for (const p of paths) {
    try {
      const raw = await readFile(p, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const s = line.trim();
        if (!s || s.startsWith("#")) continue;
        const eq = s.indexOf("=");
        if (eq === -1) continue;
        const k = s.slice(0, eq).trim();
        let v = s.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!k) continue;
        if (process.env[k] == null) process.env[k] = v;
      }
    } catch {
      // ignore
    }
  }
}

/** OpenRouter — real public API for the model catalog & live ranking page. */
const openRouter = {
  id: "openrouter",
  label: "OpenRouter Rankings",
  async fetchAll(modelNames) {
    const wantedList = asWantedList(modelNames);
    const results = new Map();
    try {
      // Catalog endpoint — returns ALL models with id, pricing, context, etc.
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      const models = json.data ?? json.models ?? [];
      vlog(`openrouter: ${models.length} models in catalog`);
      for (const wanted of wantedList) {
        const wantedName = getWantedName(wanted);
        const m = matchModel(models, wantedName, (x) => x.name || x.id || "");
        if (!m) continue;
        const rows = [];
        // Always include traffic ranking pointer (rank not in API; just link)
        rows.push({
          name: "OpenRouter Traffic",
          score: m.context_length ? "see leaderboard" : "available",
          source_url: "https://openrouter.ai/rankings",
        });
        // Price as a benchmark — useful for comparison
        if (m.pricing?.prompt && m.pricing?.completion) {
          const prompt = parseFloat(m.pricing.prompt) * 1_000_000;
          const completion = parseFloat(m.pricing.completion) * 1_000_000;
          // Avoid polluting nodes with "$0.00" placeholder pricing.
          if (!Number.isFinite(prompt) || !Number.isFinite(completion)) continue;
          if (prompt === 0 && completion === 0) continue;
          rows.push({
            name: "Price ($/M tokens)",
            score: `$${prompt.toFixed(2)} in / $${completion.toFixed(2)} out`,
            source_url: `https://openrouter.ai/${m.id}`,
          });
        }
        results.set(wantedName, rows);
      }
    } catch (e) {
      log(`  openrouter: fetch failed — ${e.message}`);
    }
    return results;
  },
};

/** Hugging Face — Open LLM Leaderboard via the datasets-server API. */
const huggingFace = {
  id: "huggingface",
  label: "Hugging Face",
  async fetchAll(modelNames) {
    const wantedList = asWantedList(modelNames);
    const results = new Map();
    try {
      // The Open LLM Leaderboard publishes results to a HF dataset; the
      // datasets-server provides paginated JSON access.
      const url =
        "https://datasets-server.huggingface.co/rows" +
        "?dataset=open-llm-leaderboard%2Fcontents&config=default&split=train&offset=0&length=100";
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      const rows = (json.rows ?? []).map((r) => r.row ?? {});
      vlog(`huggingface: pulled ${rows.length} leaderboard entries (page 1)`);
      // The leaderboard tracks open-weight models; commercial ones won't
      // appear. Match best-effort by model name substring.
      for (const wanted of wantedList) {
        const wantedName = getWantedName(wanted);
        const m = matchModel(rows, wantedName, (x) => x.model || x.fullname || "");
        if (!m) continue;
        const benchRows = [];
        // Headline composite score
        if (m.average_score != null || m.average != null) {
          benchRows.push({
            name: "Open LLM Leaderboard avg",
            score: `${(m.average_score ?? m.average).toFixed(1)}`,
            source_url:
              "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",
          });
        }
        // Sub-benchmarks if present
        for (const [key, label] of [
          ["IFEval", "IFEval"],
          ["BBH", "BBH"],
          ["MATH Lvl 5", "MATH Lvl 5"],
          ["GPQA", "GPQA"],
          ["MUSR", "MUSR"],
          ["MMLU-PRO", "MMLU-Pro"],
        ]) {
          if (m[key] != null) {
            benchRows.push({
              name: label,
              score: `${(+m[key]).toFixed(1)}%`,
              source_url:
                "https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard",
            });
          }
        }
        if (benchRows.length) results.set(wantedName, benchRows);
      }
    } catch (e) {
      log(`  huggingface: fetch failed — ${e.message}`);
    }
    return results;
  },
};

/** Artificial Analysis — frontier eval index. No documented public API yet.
 *  ✅ Uses Artificial Analysis' Free Data API (requires API key).
 *
 *  Setup:
 *    export AA_API_KEY="..."   # from your Artificial Analysis account
 *
 *  API docs:
 *    https://artificialanalysis.ai/api-reference/
 */
const artificialAnalysis = {
  id: "artificialanalysis",
  label: "Artificial Analysis",
  async fetchAll(modelNames) {
    const wantedList = asWantedList(modelNames);
    await loadDotEnvLocal();
    const apiKey =
      process.env.AA_API_KEY ||
      process.env.ARTIFICIAL_ANALYSIS_API_KEY ||
      process.env.ARTIFICIALANALYSIS_API_KEY;
    if (!apiKey) {
      log(`  artificialanalysis: skipped — missing AA_API_KEY`);
      return new Map();
    }

    const results = new Map();
    try {
      const r = await fetch("https://artificialanalysis.ai/api/v2/data/llms/models", {
        headers: { Accept: "application/json", "x-api-key": apiKey },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      const models = json.data ?? [];
      vlog(`artificialanalysis: ${models.length} models from API`);

      const pct = (x) => {
        if (x == null) return null;
        const n = Number(x);
        if (!Number.isFinite(n)) return null;
        if (n <= 1.5) return n * 100; // most evals are 0-1
        return n; // already percent-like
      };

      const fmtRangePct = (min, max) => {
        const hi = max.toFixed(1);
        if (min == null || Math.abs(min - max) < 1e-9) return `${hi}%`;
        return `${hi}% (${min.toFixed(1)}–${hi}%)`;
      };

      const fmtIndex = (x) => {
        const n = Number(x);
        if (!Number.isFinite(n)) return null;
        return n.toFixed(2);
      };

      const toAaSlug = (aaUrl) => {
        if (!aaUrl || typeof aaUrl !== "string") return null;
        const m = aaUrl.match(/\/models\/([^/?#]+)/i);
        return m ? m[1] : null;
      };

      const pickBest = (arr, get) => {
        let best = null;
        let bestVal = -Infinity;
        for (const it of arr) {
          const v = get(it);
          if (v == null) continue;
          if (v > bestVal) {
            bestVal = v;
            best = it;
          }
        }
        return best;
      };

      const buildRanker = (values, higherBetter = true) => {
        const vals = values.filter((v) => Number.isFinite(Number(v))).map((v) => Number(v));
        vals.sort((a, b) => (higherBetter ? b - a : a - b));
        return {
          total: vals.length,
          rankOf(value) {
            const n = Number(value);
            if (!Number.isFinite(n) || !vals.length) return null;
            // rank by insertion position (handles float mismatch)
            const idx = vals.findIndex((x) => (higherBetter ? x < n : x > n));
            const pos = idx === -1 ? vals.length - 1 : idx;
            return { rank: pos + 1, total: vals.length };
          },
        };
      };

      const makeRankers = (scopeModels) => ({
        aaInt: buildRanker(scopeModels.map((m) => m?.evaluations?.artificial_analysis_intelligence_index), true),
        aaCode: buildRanker(scopeModels.map((m) => m?.evaluations?.artificial_analysis_coding_index), true),
        scicode: buildRanker(scopeModels.map((m) => pct(m?.evaluations?.scicode)), true),
        tbHard: buildRanker(scopeModels.map((m) => pct(m?.evaluations?.terminal_bench_hard ?? m?.evaluations?.terminal_bench ?? m?.evaluations?.terminalbench_hard)), true),
        mmlu: buildRanker(scopeModels.map((m) => pct(m?.evaluations?.mmlu_pro)), true),
        gpqa: buildRanker(scopeModels.map((m) => pct(m?.evaluations?.gpqa)), true),
        hle: buildRanker(scopeModels.map((m) => pct(m?.evaluations?.hle)), true),
        speed: buildRanker(scopeModels.map((m) => Number(m?.median_output_tokens_per_second)), true),
        priceIn: buildRanker(scopeModels.map((m) => Number(m?.pricing?.price_1m_input_tokens)), false),
        priceOut: buildRanker(scopeModels.map((m) => Number(m?.pricing?.price_1m_output_tokens)), false),
      });

      const scopeAll = models;
      const scopeNonReasoning = models.filter((m) => /\bnon-?reasoning\b/i.test(m?.name || ""));
      const scopeReasoning = models.filter((m) => /\breasoning\b/i.test(m?.name || "") && !/\bnon-?reasoning\b/i.test(m?.name || ""));

      const rankersByScope = {
        all: makeRankers(scopeAll),
        non_reasoning: makeRankers(scopeNonReasoning),
        reasoning: makeRankers(scopeReasoning),
      };

      const scopeFromName = (name) => {
        if (!name) return { key: "all", label: null };
        if (/\bnon-?reasoning\b/i.test(name)) return { key: "non_reasoning", label: "Non-reasoning" };
        if (/\breasoning\b/i.test(name)) return { key: "reasoning", label: "Reasoning" };
        return { key: "all", label: null };
      };

      const groupMatches = (wanted) => {
        const wantedName = getWantedName(wanted);
        const wantedSlug = wanted?.aaSlug || toAaSlug(wanted?.aaUrl || wanted?.aa_url) || null;

        if (wantedSlug) {
          const exact = models.find((m) => (m.slug || "") === wantedSlug);
          if (exact?.model_family_slug) {
            const fam = models.filter((m) => m.model_family_slug === exact.model_family_slug);
            if (fam.length) return fam;
          }
          const pref = models.filter((m) => (m.slug || "").startsWith(wantedSlug));
          if (pref.length) return pref;
        }

        const target = normalizeModelName(wantedName);
        const prefix = models.filter((m) => normalizeModelName(m.name || m.slug || "").startsWith(target));
        if (prefix.length) return prefix;
        const one = matchModel(models, wantedName, (x) => x.name || x.slug || "");
        return one ? [one] : [];
      };

      for (const wanted of wantedList) {
        const wantedName = getWantedName(wanted);
        const group = groupMatches(wanted);
        if (!group.length) continue;

        const evals = group.map((m) => m.evaluations ?? {});
        const bestAA = pickBest(group, (m) => m.evaluations?.artificial_analysis_intelligence_index ?? null) ?? group[0];
        const scope = scopeFromName(bestAA?.name || "");
        const rankers = rankersByScope[scope.key] ?? rankersByScope.all;
        const sourceUrl = bestAA?.slug
          ? `https://artificialanalysis.ai/models/${bestAA.slug}`
          : "https://artificialanalysis.ai/";

        const rows = [];

        // Composite indices (already 0-100 scale in the API example)
        const aaInt = bestAA?.evaluations?.artificial_analysis_intelligence_index;
        const aaCode = bestAA?.evaluations?.artificial_analysis_coding_index;
        if (aaInt != null) {
          const s = fmtIndex(aaInt);
          const r = rankers.aaInt.rankOf(aaInt);
          if (s) rows.push({ name: "Intelligence · AA Intelligence Index", score: s, source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }
        if (aaCode != null) {
          const s = fmtIndex(aaCode);
          const r = rankers.aaCode.rankOf(aaCode);
          if (s) rows.push({ name: "Coding · AA Coding Index", score: s, source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }

        // Key evals the UI highlights
        const rangeOf = (key, convert = (x) => x) => {
          const vals = evals
            .map((e) => convert(e[key]))
            .filter((v) => v != null && Number.isFinite(Number(v)))
            .map((v) => Number(v));
          if (!vals.length) return null;
          return { min: Math.min(...vals), max: Math.max(...vals) };
        };

        const scicode = rangeOf("scicode", pct);
        if (scicode) {
          const r = rankers.scicode.rankOf(scicode.max);
          rows.push({ name: "Coding · SciCode", score: fmtRangePct(scicode.min, scicode.max), source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }

        // Terminal-Bench naming differs across sources; try common keys
        const tbHard =
          rangeOf("terminal_bench_hard", pct) ??
          rangeOf("terminal_bench", pct) ??
          rangeOf("terminalbench_hard", pct);
        if (tbHard) {
          const r = rankers.tbHard.rankOf(tbHard.max);
          rows.push({ name: "Agentic · Terminal-Bench Hard", score: fmtRangePct(tbHard.min, tbHard.max), source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }

        // A few widely-used comparators (kept small to avoid noise)
        const mmlu = rangeOf("mmlu_pro", pct);
        if (mmlu) {
          const r = rankers.mmlu.rankOf(mmlu.max);
          rows.push({ name: "MMLU-Pro", score: fmtRangePct(mmlu.min, mmlu.max), source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }
        const gpqa = rangeOf("gpqa", pct);
        if (gpqa) {
          const r = rankers.gpqa.rankOf(gpqa.max);
          rows.push({ name: "GPQA", score: fmtRangePct(gpqa.min, gpqa.max), source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }
        const hle = rangeOf("hle", pct);
        if (hle) {
          const r = rankers.hle.rankOf(hle.max);
          rows.push({ name: "HLE", score: fmtRangePct(hle.min, hle.max), source_url: sourceUrl, vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined });
        }

        // Speed + cost (useful for "not arbitrary" comparison)
        if (bestAA?.median_output_tokens_per_second != null) {
          const s = Number(bestAA.median_output_tokens_per_second);
          if (!Number.isFinite(s) || s <= 0) {
            // Skip 0/invalid placeholder speed.
          } else {
          const r = rankers.speed.rankOf(s);
          rows.push({
            name: "Speed · Output tok/s",
            score: `${s.toFixed(0)}`,
            source_url: sourceUrl,
            vs_baseline: r ? `Rank #${r.rank} of ${r.total}${scope.label ? ` · ${scope.label}` : ""}` : undefined,
          });
          }
        }
        if (bestAA?.pricing?.price_1m_input_tokens != null && bestAA?.pricing?.price_1m_output_tokens != null) {
          const pin = Number(bestAA.pricing.price_1m_input_tokens);
          const pout = Number(bestAA.pricing.price_1m_output_tokens);
          if (!Number.isFinite(pin) || !Number.isFinite(pout)) {
            // skip
          } else if (pin === 0 && pout === 0) {
            // skip placeholder
          } else {
          const rin = rankers.priceIn.rankOf(pin);
          const rout = rankers.priceOut.rankOf(pout);
          rows.push({
            name: "Price ($/M tokens)",
            score: `$${pin.toFixed(2)} in / $${pout.toFixed(2)} out`,
            source_url: sourceUrl,
            vs_baseline: rin && rout ? `Rank #${Math.min(rin.rank, rout.rank)} of ${Math.max(rin.total, rout.total)}${scope.label ? ` · ${scope.label}` : ""}` : undefined,
          });
          }
        }

        if (rows.length) results.set(wantedName, rows);
      }
    } catch (e) {
      log(`  artificialanalysis: fetch failed — ${e.message}`);
    }
    return results;
  },
};

/** LLM Stats — cross-model price + spec table. Server-rendered HTML; no API.
 *  Implementation path:
 *    1. fetch https://llm-stats.com/api/models  (undocumented but stable)
 *    2. or scrape the homepage table with cheerio
 *  Each entry exposes price, context window, and a composite score; treat
 *  the score as one benchmark row tagged "LLM Stats Score". */
const llmStats = {
  id: "llm-stats",
  label: "LLM Stats",
  async fetchAll(modelNames) {
    log(`  llm-stats: STUB — would fetch ${modelNames.length} models`);
    log(`    TODO: hit https://llm-stats.com/api/models or scrape the table`);
    return new Map();
  },
};

/** LMArena (formerly Chatbot Arena) — Elo-style human-pref leaderboard.
 *  Hosted on a Gradio space at https://lmarena.ai/leaderboard. The space
 *  exposes a JSON snapshot via huggingface.co/spaces/lmarena-ai/chatbot-arena-leaderboard
 *  /resolve/main/leaderboard_table_*.csv. Implementation path:
 *    1. find latest CSV file by date prefix
 *    2. parse CSV → rows of { model, arena_score, votes }
 *    3. emit one bench row per model ("Arena Elo: 1422") */
const arena = {
  id: "arena",
  label: "LMArena",
  async fetchAll(modelNames) {
    log(`  arena: STUB — would fetch ${modelNames.length} models`);
    log(`    TODO: fetch lmarena-ai/chatbot-arena-leaderboard latest CSV`);
    return new Map();
  },
};

const ALL_SOURCES = [openRouter, huggingFace, artificialAnalysis, llmStats, arena];

// ============== Helpers ==============

/** Loose model-name matcher. Strips org prefixes, version separators, and
 *  punctuation so "GPT-5" matches "openai/gpt-5", "GPT 5 (preview)", etc. */
function normalizeModelName(s) {
  return s
    .toLowerCase()
    .replace(/[\s_\-\.\/]+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/^(openai|anthropic|google|meta|mistral|deepseek|xai|cohere|qwen|alibaba)-/, "");
}

function matchModel(catalog, wantedName, getName) {
  const target = normalizeModelName(wantedName);
  // Exact normalized match first, then prefix, then substring
  let m = catalog.find((x) => normalizeModelName(getName(x)) === target);
  if (m) return m;
  m = catalog.find((x) => normalizeModelName(getName(x)).startsWith(target));
  if (m) return m;
  m = catalog.find((x) => normalizeModelName(getName(x)).includes(target));
  return m;
}

/** Read all node MDX files; return [{ slug, modelName, path, raw, fm, body }]. */
async function readNodes() {
  const files = (await readdir(NODES_DIR))
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));
  const out = [];
  for (const f of files) {
    const p = join(NODES_DIR, f);
    const raw = await readFile(p, "utf-8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.slug) continue;
    if (ARG.slug && fm.slug !== ARG.slug) continue;
    // Pull a clean model name for matching: strip the " — tagline" suffix
    const titleHead = (fm.title || "").split(/\s[—–-]\s/)[0].trim();
    const aaUrl =
      fm?.model_spec?.aa_url ||
      (fm?.model_spec?.benchmarks ?? []).find((b) => /artificialanalysis\.ai\/models\//i.test(b?.source_url || ""))?.source_url ||
      null;
    const aaSlug = typeof aaUrl === "string" ? aaUrl.match(/\/models\/([^/?#]+)/i)?.[1] ?? null : null;
    out.push({ slug: fm.slug, modelName: titleHead, aaUrl, aaSlug, path: p, raw, fm, body });
  }
  return out;
}

/** Idempotent merge — keep hand-curated rows, append new ones. */
function mergeBenchmarks(existing, incoming) {
  const out = [...existing];
  const have = new Set(existing.map((r) => r.name.toLowerCase()));
  let added = 0;
  let updated = 0;
  for (const row of incoming) {
    const key = row.name.toLowerCase();
    if (have.has(key)) {
      // Only overwrite if --force AND the existing row lacks a score
      const idx = out.findIndex((r) => r.name.toLowerCase() === key);
      const existRow = out[idx];
      if (ARG.force || !existRow.score || existRow.score === "—") {
        out[idx] = { ...existRow, ...row };
        updated++;
      }
    } else {
      out.push(row);
      have.add(key);
      added++;
    }
  }
  return { out, added, updated };
}

/** Re-serialize MDX with updated frontmatter, preserving body verbatim. */
function writeMdx(node, newFrontmatter) {
  const out = matter.stringify(node.body, newFrontmatter);
  return writeFile(node.path, out);
}

// ============== Main ==============

async function main() {
  log(`fetch-benchmarks — ${ARG.dryRun ? "DRY RUN" : "LIVE"} mode`);
  if (ARG.slug) log(`  filter: slug=${ARG.slug}`);
  if (ARG.source) log(`  filter: source=${ARG.source}`);

  const nodes = await readNodes();
  log(`found ${nodes.length} node(s) to process`);
  if (!nodes.length) return;

  const sources = ARG.source
    ? ALL_SOURCES.filter((s) => s.id === ARG.source)
    : ALL_SOURCES;
  if (!sources.length) {
    log(`no source matched id=${ARG.source}. Valid: ${ALL_SOURCES.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  const modelNames = nodes.map((n) => ({ modelName: n.modelName, aaUrl: n.aaUrl, aaSlug: n.aaSlug }));

  // Run all sources in parallel — they're independent network calls
  log(`querying ${sources.length} source(s) in parallel...`);
  const sourceResults = await Promise.all(
    sources.map(async (s) => ({ src: s, data: await s.fetchAll(modelNames) })),
  );

  // Aggregate per-node
  let totalAdded = 0;
  let totalUpdated = 0;
  let touchedNodes = 0;

  for (const node of nodes) {
    const incoming = [];
    for (const { data } of sourceResults) {
      const rows = data.get(node.modelName) ?? [];
      for (const r of rows) incoming.push(r);
    }
    if (!incoming.length) continue;

    const existing = node.fm.model_spec?.benchmarks ?? [];
    const { out, added, updated } = mergeBenchmarks(existing, incoming);
    if (!added && !updated) continue;

    log(`  ${node.slug}: +${added} new, ~${updated} updated`);
    totalAdded += added;
    totalUpdated += updated;
    touchedNodes++;

    if (!ARG.dryRun) {
      const newFm = {
        ...node.fm,
        model_spec: { ...(node.fm.model_spec ?? {}), benchmarks: out },
      };
      await writeMdx(node, newFm);
    }
  }

  log(`\nSummary:`);
  log(`  ${touchedNodes} node(s) touched`);
  log(`  ${totalAdded} new benchmark row(s)`);
  log(`  ${totalUpdated} updated benchmark row(s)`);
  if (ARG.dryRun) log(`  (DRY RUN — no files written. Drop --dry-run to commit.)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
