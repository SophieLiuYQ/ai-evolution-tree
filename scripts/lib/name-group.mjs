const STOPWORDS = new Set([
  "model",
  "family",
  "series",
  "llm",
  "tiered",
  "frontier",
  "agentic",
  "hybrid",
  "reasoning",
  "thinking",
  "non",
  "adaptive",
  "effort",
  "low",
  "medium",
  "high",
  "preview",
  "production",
  "workhorse",
  "update",
  "surpasses",
  "prior",
  "flagships",
  "fast",
  "mid",
  "midtier",
  "tier",
  "capable",
  // Generic SKU / tier suffixes (should not create separate nodes)
  "pro",
  "plus",
  "flash",
  "lite",
  "mini",
  "nano",
  "micro",
  "small",
  "large",
  "ultra",
  "base",
  "instruct",
  "instruction",
  "turbo",
  "premier",
  "oct",
  "jun",
  "june",
  "sep",
  "sept",
  "nov",
  "dec",
]);

function normalizeToken(t) {
  if (!t) return null;
  // Collapse "qwen3.6" -> "qwen", "claude3.7" -> "claude", etc.
  const m = t.match(/^([a-z]{3,})(\d+(?:\.\d+)*)$/);
  if (m) return m[1];
  return t;
}

export function nameGroupKeyFromTitle(title) {
  let s = String(title ?? "");
  s = s.replace(/\([^)]*\)/g, " "); // drop parentheticals
  s = s.replace(/[’'"]/g, " ");
  s = s.replace(/[–—]/g, " ");
  s = s.toLowerCase();
  // Keep alnum + dot; everything else becomes space.
  s = s.replace(/[^a-z0-9.]+/g, " ");
  const toks = s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(normalizeToken)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));

  const kept = [];
  for (const t of toks) {
    if (/^\d+(\.\d+)*$/.test(t)) continue;
    if (/^v\d+(\.\d+)*$/.test(t)) continue;
    if (/^\d{2,4}$/.test(t)) continue;
    if (/^\d+(b|bn|m|k|t)$/.test(t)) continue;
    kept.push(t);
    if (kept.length >= 4) break;
  }
  if (!kept.length) return "unknown";
  const distillIdx = kept.indexOf("distill");
  if (distillIdx !== -1) return kept.slice(0, distillIdx + 1).join(" ");
  return kept.join(" ");
}

