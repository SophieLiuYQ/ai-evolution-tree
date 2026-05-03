#!/usr/bin/env node
// Relationship taxonomy v3 — competes_with + same_capability with:
//  • media_subdomain (image_gen / video_gen / music / tts / embedding)
//    so an image gen doesn't read as a competitor to a TTS
//  • param_class (small / medium / frontier) from parameters + price
//    so Phi-4 (14B) doesn't compete with DeepSeek R1 (671B MoE)
//  • family-skip so GPT-5 doesn't "compete with" GPT-5.1
//
// Many-to-many: caps each source at top-K so a model can have 3–6
// competitors and 5–10 same-capability peers.

import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const NODES_DIR = path.resolve("./src/content/nodes");
const TOP_COMPETES_PER_SRC = 6;
const TOP_SAME_PER_SRC = 10;

const files = (await fs.readdir(NODES_DIR))
  .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"));

// ---------- Helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (b) => {
  if (!b) return null;
  const m = String(b.score).match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};
const pct = (b) => {
  if (!b) return null;
  const m = String(b.score).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
};
// Pull "$0.13 in / $0.50 out" → 0.50, falling back to "in" if no out
const priceOut = (b) => {
  if (!b) return null;
  const s = String(b.score);
  const out = s.match(/\$([\d.]+)\s*out/);
  if (out) return parseFloat(out[1]);
  const inP = s.match(/\$([\d.]+)/);
  return inP ? parseFloat(inP[1]) : null;
};
const paramsB = (str) => {
  if (!str) return null;
  const s = String(str).toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*([bm])/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return m[2] === "m" ? v / 1000 : v;
};

// ---------- Load & feature-extract ----------
const models = [];
for (const f of files) {
  const c = await fs.readFile(path.join(NODES_DIR, f), "utf8");
  const fm = c.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  let data;
  try { data = yaml.load(fm[1]); } catch { continue; }
  if (!data?.model_spec) continue;
  if (data.model_spec.release_type === "paper") continue;
  if (data.graph_hidden) continue;

  const benches = data.model_spec.benchmarks ?? [];
  const find = (re) => benches.find((b) => re.test(b.name));
  const aaInt = num(find(/^Intelligence\s*·\s*AA/i));
  const sci = pct(find(/^Coding\s*·\s*SciCode/i));
  const aaC = num(find(/^Coding\s*·\s*AA/i));
  const terH = pct(find(/^Agentic\s*·\s*Terminal-Bench Hard/i));
  const price = priceOut(find(/^Price/i));
  const cats = data.category ?? [];
  const arch = String(data.model_spec.architecture ?? "").toLowerCase();
  const title = String(data.title ?? "").toLowerCase();
  const outMods = new Set(
    (data.model_spec.modalities_out ?? data.model_spec.modalities ?? [])
      .map((m) => String(m).toLowerCase()),
  );

  const caps = {
    reasoning: aaInt !== null ? clamp(aaInt / 70, 0, 1) : 0,
    coding: sci !== null ? clamp(sci / 100, 0, 1) :
             aaC !== null ? clamp(aaC / 70, 0, 1) : 0,
    multimodal: cats.includes("multimodal") ? 0.9 :
                (outMods.has("image") || outMods.has("video") || outMods.has("audio") ? 0.6 : 0),
    agentic: terH !== null ? clamp(terH / 100, 0, 1) :
             cats.includes("agents") ? 0.5 : 0,
    vision: outMods.has("image") ? 0.9 :
            cats.includes("cv") ? 0.6 : 0,
    audio: outMods.has("audio") ? 0.9 :
           cats.includes("audio") ? 0.6 : 0,
  };

  // ---- media_subdomain ----
  let mediaSub = null;
  const isVideo = outMods.has("video") || /video|sora|veo|hailuo|hunyuan video|runway|ltx-?2|wan\s*2/.test(title) ||
                  /video|diffusion.*video/.test(arch);
  const isMusic = /music|suno|lyria/.test(title) || /music/.test(arch);
  const isTTS = /\btts\b|speech|voxtral|elevenlabs|cartesia|parakeet|sonic/.test(title) ||
                /\btts\b|text-to-speech|speech/.test(arch);
  const isEmbed = cats.includes("infrastructure") && /encoder|embedding/.test(arch);
  const isImage = (outMods.has("image") && !isVideo) ||
                  /midjourney|flux|nano-banana|seedream|gpt image/.test(title) ||
                  /image (?:gen|generation|decoder)|rectified-flow|aesthetic/.test(arch);
  if (isVideo) mediaSub = "video_gen";
  else if (isMusic) mediaSub = "music";
  else if (isTTS) mediaSub = "tts";
  else if (isEmbed) mediaSub = "embedding";
  else if (isImage) mediaSub = "image_gen";

  // ---- param_class ----
  const pB = paramsB(data.model_spec.parameters);
  let paramClass = null;
  if (pB !== null || price !== null) {
    if ((pB !== null && pB >= 100) || (price !== null && price >= 5)) paramClass = "frontier";
    else if ((pB !== null && pB >= 30) || (price !== null && price >= 1)) paramClass = "medium";
    else paramClass = "small";
  }

  // ---- Primary domain ----
  let primaryDomain = "reasoning";
  if (mediaSub === "tts" || mediaSub === "music") primaryDomain = "audio";
  else if (mediaSub === "video_gen") primaryDomain = "video";
  else if (mediaSub === "image_gen") primaryDomain = "image";
  else if (mediaSub === "embedding") primaryDomain = "embedding";
  else if (cats.some((c) => /robotics|world_model/.test(c)) ||
           arch.includes("vla")) primaryDomain = "robotics";
  else if (cats.includes("science")) primaryDomain = "science";
  else if (caps.coding > caps.reasoning && caps.coding > 0.5) primaryDomain = "coding";
  else if (cats.includes("multimodal") && caps.multimodal > 0.7) primaryDomain = "multimodal";
  else primaryDomain = "reasoning";

  const dominant = Object.entries(caps)
    .filter(([, v]) => v >= 0.5)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k);

  const usedScores = Object.values(caps).filter((v) => v > 0);
  const avg = usedScores.length ? usedScores.reduce((a, b) => a + b, 0) / usedScores.length : 0;
  const tier = avg >= 0.75 ? "S" : avg >= 0.55 ? "A" : avg >= 0.35 ? "B" : "C";

  const family = data.model_spec.family ?? null;

  const variantIds = new Set(
    (data.model_spec.variants ?? []).map((v) => v.id).filter(Boolean),
  );

  const buildsOn = new Set(
    (data.relationships ?? [])
      .filter((r) => r.type === "builds_on")
      .map((r) => r.to)
      .filter(Boolean),
  );

  const ts = String(data.title).match(/^(.+?)\s+[—–-]\s+/);
  const shortTitle = ts ? ts[1] : data.title;

  models.push({
    slug: data.slug,
    title: shortTitle,
    org: data.org,
    date: data.date,
    primaryDomain,
    mediaSub,
    paramClass,
    caps,
    dominant,
    tier,
    avg,
    family,
    variantIds,
    buildsOn,
    aaInt,        // raw 0–100 AA Intelligence — used as a magnitude band
    priceOut: price, // $/M output tokens — used as a market-segment band
  });
}
console.error(`Loaded ${models.length} non-paper models`);

// ---------- Family graph ----------
const slugToModel = new Map(models.map((m) => [m.slug, m]));
function familySet(m) {
  const out = new Set([m.slug]);
  for (const id of m.variantIds) out.add(id);
  // Walk builds_on ancestors (same org)
  const queue = [...m.buildsOn];
  while (queue.length) {
    const id = queue.shift();
    if (out.has(id)) continue;
    const parent = slugToModel.get(id);
    if (parent && parent.org === m.org) {
      out.add(id);
      for (const p of parent.buildsOn) queue.push(p);
    }
  }
  // Descendants — anyone in same org whose builds_on points back at m
  for (const other of models) {
    if (other.org !== m.org) continue;
    if (other.buildsOn.has(m.slug)) out.add(other.slug);
  }
  // Same family name
  if (m.family) {
    for (const other of models) {
      if (other.family === m.family) out.add(other.slug);
    }
  }
  return out;
}
const familyOf = new Map();
for (const m of models) familyOf.set(m.slug, familySet(m));

// ---------- Pairwise scoring ----------
const cosine = (a, b) => {
  const keys = Object.keys(a);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    dot += a[k] * b[k];
    na += a[k] ** 2;
    nb += b[k] ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};
const tierIdx = { S: 0, A: 1, B: 2, C: 3 };
const monthsBetween = (d1, d2) => {
  const ms = Math.abs(new Date(d1).getTime() - new Date(d2).getTime());
  return ms / (1000 * 60 * 60 * 24 * 30.44);
};

const FOCUS = [
  "claude-opus-4-5", "claude-sonnet-4-5", "claude-opus-4-7",
  "gpt-5", "gpt-5-1", "gpt-5-2", "gpt-5-3", "gpt-5-4", "gpt-5-5",
  "gemini-3-pro", "gemini-2-5-pro",
  "deepseek-r1", "deepseek-v3", "deepseek-v4-pro",
  "kimi-k2", "qwen-3", "llama-4", "grok-4", "mistral-large-3",
  "lyria-3", "suno-v3", "sora-2", "veo-3", "flux-2", "midjourney-v7",
  "claude-haiku-4-5", "phi-4",
];

const competesWith = [];
const sameCapability = [];

const PCLASS = ["small", "medium", "frontier"];

// Run on every model — output goes to JSON; reports below filter to FOCUS.
for (const a of models) {
  const aFamily = familyOf.get(a.slug);

  for (const b of models) {
    if (a.slug === b.slug) continue;
    if (aFamily.has(b.slug)) continue;        // skip same-family

    const overlap = cosine(a.caps, b.caps);
    const tierGap = Math.abs((tierIdx[a.tier] ?? 99) - (tierIdx[b.tier] ?? 99));
    const releaseGap = monthsBetween(a.date, b.date);
    const sharedDom = a.dominant.filter((t) => b.dominant.includes(t));

    // Media subdomain must match symmetrically: either both null
    // (general LLMs comparing each other) or both the exact same
    // value. One-sided null = different category, no match.
    const mediaMatch =
      a.mediaSub == null && b.mediaSub == null ? true :
      a.mediaSub != null && b.mediaSub != null && a.mediaSub === b.mediaSub;

    // Param class: skip pairs more than one tier apart
    const paramOK =
      a.paramClass == null || b.paramClass == null ? true :
      Math.abs(PCLASS.indexOf(a.paramClass) - PCLASS.indexOf(b.paramClass)) <= 1;

    // AA Intelligence band — when both have an AA Intel score, require
    // them to be within 10 points. Catches cases like GLM-4.5 (40.6)
    // vs Claude Opus 4.6 (53.0) where cosine reads similar but the
    // absolute capability gap is large.
    const aaOK =
      a.aaInt == null || b.aaInt == null ? true :
      Math.abs(a.aaInt - b.aaInt) <= 10;

    // Price-segment band — when both have a $/M out price, require
    // ratio ≤ 3×. A model priced 8× higher is a different market tier
    // (different buyer, different SLA), regardless of cosine shape.
    const priceOK =
      a.priceOut == null || b.priceOut == null || a.priceOut === 0 || b.priceOut === 0 ? true :
      Math.max(a.priceOut, b.priceOut) / Math.min(a.priceOut, b.priceOut) <= 3.0;

    if (
      a.primaryDomain === b.primaryDomain &&
      mediaMatch &&
      paramOK &&
      aaOK &&
      priceOK &&
      overlap >= 0.7 &&
      tierGap <= 1 &&
      releaseGap <= 18
    ) {
      const confidence = clamp(
        (overlap - 0.7) / 0.3 * 0.4 +
        (1 - tierGap / 1) * 0.3 +
        (1 - Math.min(releaseGap / 18, 1)) * 0.3,
        0,
        1,
      );
      competesWith.push({
        source: a.slug, target: b.slug,
        sourceTitle: a.title, targetTitle: b.title,
        sourceOrg: a.org, targetOrg: b.org,
        domain: a.primaryDomain, mediaSub: a.mediaSub,
        overlap, tierGap, releaseGapMo: releaseGap,
        confidence,
      });
    }

    // same_capability: share ≥1 dominant tag, ≥0.6 overlap, ≤24mo apart,
    // and primary_domain must be "compatible" — same exact domain, OR
    // both in the general-purpose pool {reasoning, multimodal, coding}.
    // Science / robotics / image / video / audio / embedding models stay
    // siloed so RFdiffusion doesn't show up as a Llama 4 peer.
    const GENERAL = new Set(["reasoning", "multimodal", "coding"]);
    const domainCompat =
      a.primaryDomain === b.primaryDomain ||
      (GENERAL.has(a.primaryDomain) && GENERAL.has(b.primaryDomain));
    // Looser AA + price bands for same_capability (vs competes_with):
    // 15-point AA delta, 5× price ratio. Still excludes pairs where
    // one model is a clear performance/market tier above the other.
    const aaOKLoose =
      a.aaInt == null || b.aaInt == null ? true :
      Math.abs(a.aaInt - b.aaInt) <= 15;
    const priceOKLoose =
      a.priceOut == null || b.priceOut == null || a.priceOut === 0 || b.priceOut === 0 ? true :
      Math.max(a.priceOut, b.priceOut) / Math.min(a.priceOut, b.priceOut) <= 5.0;
    if (
      mediaMatch && paramOK && domainCompat &&
      aaOKLoose && priceOKLoose &&
      sharedDom.length >= 1 && overlap >= 0.6 &&
      releaseGap <= 24
    ) {
      const confidence = clamp(
        overlap * 0.5 + (sharedDom.length / 4) * 0.5,
        0, 1,
      );
      sameCapability.push({
        source: a.slug, target: b.slug,
        sourceTitle: a.title, targetTitle: b.title,
        sourceOrg: a.org, targetOrg: b.org,
        shared: sharedDom, overlap, confidence,
      });
    }
  }
}

competesWith.sort((a, b) => b.confidence - a.confidence);
sameCapability.sort((a, b) => b.confidence - a.confidence);

const cappedCompetes = [];
const cappedSame = [];
const counters1 = new Map();
const counters2 = new Map();
for (const r of competesWith) {
  const n = counters1.get(r.source) ?? 0;
  if (n < TOP_COMPETES_PER_SRC) { cappedCompetes.push(r); counters1.set(r.source, n + 1); }
}
for (const r of sameCapability) {
  const n = counters2.get(r.source) ?? 0;
  if (n < TOP_SAME_PER_SRC) { cappedSame.push(r); counters2.set(r.source, n + 1); }
}

// ---------- Reports ----------
const fmt2 = (n) => Number(n).toFixed(2);
const fmt0 = (n) => Math.round(Number(n));

console.log("\n==== A. Per-model features (FOCUS subset) ====\n");
console.log(
  "| slug | org | tier | domain | media_sub | param_class | reasoning | coding | mm | agentic | vision | audio | dominant |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const m of models.filter((m) => FOCUS.includes(m.slug))) {
  console.log(
    `| ${m.slug} | ${m.org} | ${m.tier} | ${m.primaryDomain} | ${m.mediaSub ?? "—"} | ${m.paramClass ?? "—"} | ${fmt2(m.caps.reasoning)} | ${fmt2(m.caps.coding)} | ${fmt2(m.caps.multimodal)} | ${fmt2(m.caps.agentic)} | ${fmt2(m.caps.vision)} | ${fmt2(m.caps.audio)} | ${m.dominant.join(", ")} |`,
  );
}

console.log("\n\n==== B. competes_with — per source (top 6) ====\n");
for (const slug of FOCUS) {
  const rows = cappedCompetes.filter((r) => r.source === slug);
  if (!rows.length) continue;
  const m = slugToModel.get(slug);
  if (!m) continue;
  console.log(`### ${m.title} (${slug}) — ${m.primaryDomain}${m.mediaSub ? "/" + m.mediaSub : ""}, tier ${m.tier}, ${m.paramClass ?? "?"}`);
  for (const r of rows) {
    console.log(
      `  • ${r.targetTitle} [${r.targetOrg}] — overlap ${fmt2(r.overlap)}, conf ${fmt2(r.confidence)}, gap ${fmt0(r.releaseGapMo)}mo`,
    );
  }
}

console.log("\n\n==== C. same_capability — per source (top 10) ====\n");
for (const slug of FOCUS) {
  const rows = cappedSame.filter((r) => r.source === slug);
  if (!rows.length) continue;
  const m = slugToModel.get(slug);
  if (!m) continue;
  console.log(`### ${m.title} (${slug})`);
  for (const r of rows) {
    console.log(
      `  • ${r.targetTitle} [${r.targetOrg}] — shared {${r.shared.join(", ") || "—"}}, overlap ${fmt2(r.overlap)}, conf ${fmt2(r.confidence)}`,
    );
  }
}

console.log("\n\n==== D. Pair counts per source (FOCUS) ====\n");
console.log("| source | competes_with | same_capability |");
console.log("|---|---|---|");
for (const slug of FOCUS) {
  const c = (counters1.get(slug) ?? 0);
  const s = (counters2.get(slug) ?? 0);
  if (c === 0 && s === 0) continue;
  console.log(`| ${slug} | ${c} | ${s} |`);
}

// ---------- Write JSON ----------
// Detail page reads this; graph code never touches it.
const out = {};
for (const r of cappedCompetes) {
  if (!out[r.source]) out[r.source] = { competes_with: [], same_capability: [] };
  out[r.source].competes_with.push({
    slug: r.target,
    title: r.targetTitle,
    org: r.targetOrg,
    domain: r.domain,
    overlap: Number(r.overlap.toFixed(3)),
    confidence: Number(r.confidence.toFixed(3)),
    release_gap_mo: Math.round(r.releaseGapMo),
  });
}
for (const r of cappedSame) {
  if (!out[r.source]) out[r.source] = { competes_with: [], same_capability: [] };
  out[r.source].same_capability.push({
    slug: r.target,
    title: r.targetTitle,
    org: r.targetOrg,
    shared: r.shared,
    overlap: Number(r.overlap.toFixed(3)),
    confidence: Number(r.confidence.toFixed(3)),
  });
}
const meta = {
  generated_at: new Date().toISOString(),
  source_models: models.length,
  sources_with_pairs: Object.keys(out).length,
  competes_per_source_cap: TOP_COMPETES_PER_SRC,
  same_per_source_cap: TOP_SAME_PER_SRC,
};
const outPath = path.resolve("./data/model-relationships.json");
await fs.writeFile(outPath, JSON.stringify({ _meta: meta, models: out }, null, 2));
console.error(`\nWrote ${outPath} (${meta.sources_with_pairs} sources, generated ${meta.generated_at})`);
