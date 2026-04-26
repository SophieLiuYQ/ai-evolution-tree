// Single source of truth for benchmark → leaderboard provider routing.
// Used by:
//   • src/components/ModelSpec.astro          — detail-page benchmark rows
//   • src/pages/node/[slug].astro             — hero-section perf cards
//   • scripts/fetch-benchmarks.mjs            — auto-fetch script
//
// Five approved authorities (per project policy — every benchmark score
// on this site MUST link back to one of these):
//   1. artificialanalysis.ai — frontier reasoning + commercial APIs
//   2. huggingface.co        — open-weights LLM leaderboard
//   3. llm-stats.com         — cross-model spec + price comparison
//   4. arena.ai (LMArena)    — human-preference Elo (Chatbot Arena)
//   5. openrouter.ai         — traffic-weighted live rankings
//
// To add a new benchmark name → provider mapping, edit BENCHMARK_PROVIDER
// below. Use prefix-match-friendly names ("AIME" matches "AIME 2024",
// "AIME 2025", etc.) when possible.

export type LBProvider =
  | "artificialanalysis"
  | "huggingface"
  | "llm-stats"
  | "arena"
  | "openrouter";

export const LB_HOME: Record<LBProvider, { label: string; url: string }> = {
  artificialanalysis: {
    label: "Artificial Analysis",
    url: "https://artificialanalysis.ai/",
  },
  huggingface: {
    label: "Hugging Face",
    url: "https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard",
  },
  "llm-stats": {
    label: "LLM Stats",
    url: "https://llm-stats.com/",
  },
  arena: {
    label: "LMArena",
    url: "https://arena.ai/about",
  },
  openrouter: {
    label: "OpenRouter Rankings",
    url: "https://openrouter.ai/rankings",
  },
};

export const BENCHMARK_PROVIDER: Record<string, LBProvider> = {
  // Frontier reasoning + generic LLM (artificialanalysis)
  MMLU: "artificialanalysis",
  "MMLU-Pro": "artificialanalysis",
  GPQA: "artificialanalysis",
  "GPQA Diamond": "artificialanalysis",
  AIME: "artificialanalysis",
  "AIME 2024": "artificialanalysis",
  "AIME 2025": "artificialanalysis",
  "Humanity's Last Exam": "artificialanalysis",
  BrowseComp: "artificialanalysis",
  "Artificial Analysis Intelligence": "artificialanalysis",
  // Coding (artificialanalysis tracks SWE-bench Verified)
  "SWE-bench": "artificialanalysis",
  "SWE-bench Verified": "artificialanalysis",
  HumanEval: "huggingface",
  "Terminal-Bench": "artificialanalysis",
  "LiveCodeBench v5": "artificialanalysis",
  RepoBench: "huggingface",
  Codeforces: "artificialanalysis",
  // Math
  MATH: "huggingface",
  GSM8K: "huggingface",
  // Multimodal (artificialanalysis)
  MathVista: "artificialanalysis",
  MMMU: "artificialanalysis",
  "MMMU-Pro": "artificialanalysis",
  // Image / video (artificialanalysis covers image + video arenas)
  VBench: "artificialanalysis",
  // Cross-comparison — LMArena is the canonical source for human-pref
  // Elo rankings; OpenRouter exposes traffic-weighted live rankings.
  "ChatBot Arena": "arena",
  "ChatBot Arena Elo": "arena",
  LMArena: "arena",
  "Arena Elo": "arena",
  "Arena Hard": "arena",
  "OpenRouter Rankings": "openrouter",
  "OpenRouter Traffic": "openrouter",
  "Traffic share": "openrouter",
  // Cross-model spec (LLM Stats covers price + context comparisons)
  "LLM Stats Score": "llm-stats",
  "Price ($/M tokens)": "llm-stats",
  "ARC-AGI": "artificialanalysis",
  // Hallucination (artificialanalysis tracks FACTS Grounding)
  "FACTS Grounding": "artificialanalysis",
  "Hallucination rate (FACTS Grounding)": "artificialanalysis",
  // Tool use
  "BFL-v3 tool use": "artificialanalysis",
  "BFCL-v3 tool use": "artificialanalysis",
};

// Resolve a citation URL for a benchmark row. Priority:
//   1. explicit source_url on the row (label inferred from URL host)
//   2. exact-match provider in BENCHMARK_PROVIDER
//   3. prefix-match provider (e.g., "AIME 2025" → "AIME")
//   4. default to artificialanalysis.ai homepage
export function benchSource(b: { name: string; source_url?: string }): {
  label: string;
  url: string;
} {
  if (b.source_url) {
    if (/llm-stats\.com/.test(b.source_url)) return { label: "LLM Stats", url: b.source_url };
    if (/huggingface\.co/.test(b.source_url)) return { label: "Hugging Face", url: b.source_url };
    if (/artificialanalysis\.ai/.test(b.source_url))
      return { label: "Artificial Analysis", url: b.source_url };
    if (/arena\.ai|lmarena\.ai/.test(b.source_url))
      return { label: "LMArena", url: b.source_url };
    if (/openrouter\.ai/.test(b.source_url))
      return { label: "OpenRouter Rankings", url: b.source_url };
    return { label: "Source", url: b.source_url };
  }
  let provider: LBProvider | undefined = BENCHMARK_PROVIDER[b.name];
  if (!provider) {
    for (const k of Object.keys(BENCHMARK_PROVIDER)) {
      if (b.name.startsWith(k)) {
        provider = BENCHMARK_PROVIDER[k];
        break;
      }
    }
  }
  return LB_HOME[provider ?? "artificialanalysis"];
}
