import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const ERAS = [
  "foundations",
  "classical-ml",
  "deep-learning-revival",
  "architectures",
  "transformer",
  "scale-era",
  "alignment",
  "multimodal",
  "reasoning",
  "agents",
  "frontier",
] as const;

const STATUSES = [
  "foundational",
  "active",
  "superseded",
  "archived",
] as const;

const CITATION_TYPES = [
  "paper",
  "book",
  "release",
  "blog",
  "talk",
  "dataset",
] as const;

const RELATIONSHIP_TYPES = [
  "builds_on",
  "competes_with",
  "open_alt_to",
] as const;

const ORGS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Google DeepMind",
  "DeepMind",
  "Google Brain",
  "Meta AI",
  "Microsoft",
  "Mistral AI",
  "Stability AI",
  "EleutherAI",
  "Cohere",
  "xAI",
  "Alibaba",
  "DeepSeek",
  "Tsinghua / Zhipu",
  "01.AI",
  "Baidu",
  "Tencent",
  "Moonshot AI",
  "MiniMax",
  "ByteDance",
  "Stepfun",
  "Suno",
  "Runway",
  "Black Forest Labs",
  "Databricks",
  "Perplexity",
  "Kuaishou",
  "Hugging Face",
  "BigScience",
  "Allen AI",
  "Salesforce",
  "Nvidia",
  "Apple",
  "IBM",
  "Huawei",
  "Xiaomi",
  "Ant Group",
  "Shanghai AI Lab",
  "BAAI",
  "AI21 Labs",
  "Reka AI",
  "Adobe",
  "Amazon",
  "Arc Institute",
  "Boston Dynamics",
  "Cartesia",
  "Cognition",
  "ElevenLabs",
  "Figure AI",
  "Ideogram",
  "Lightricks",
  "Liquid AI",
  "Luma AI",
  "Midjourney",
  "MIT",
  "Physical Intelligence",
  "Pika Labs",
  "Sesame",
  "Snowflake",
  "Synthesia",
  "Tesla",
  "Together AI",
  "Ultralytics",
  "Unitree",
  "Voyage AI",
  "Wayve",
  "Writer",
  "Hedra",
  "Hume AI",
  "Nari Labs",
  "Recraft",
  "Academic / Independent",
  "US Office of Naval Research",
  "UC San Diego / CMU",
  "University of Toronto",
  "Université de Montréal",
  "Cornell Aeronautical Laboratory",
] as const;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

const citation = z.object({
  type: z.enum(CITATION_TYPES),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, {
    message: "citation.key must be lowercase BibTeX-style (a-z0-9_)",
  }),
  title: z.string().min(1),
  authors: z.array(z.string()).optional(),
  year: z.number().int().min(1900).max(2100),
  venue: z.string().optional(),
  arxiv: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().url().optional(),
});

const application = z.object({
  product: z.string().min(1),
  company: z.string().min(1),
  year_deployed: z.number().int().min(1900).max(2100),
});

const publicView = z.object({
  plain_english: z
    .string()
    .min(1)
    .refine((s) => wordCount(s) <= 100, {
      message: "public_view.plain_english should be ≤ 100 words",
    }),
  analogy: z
    .string()
    .min(1)
    .refine((s) => wordCount(s) <= 80, {
      message: "public_view.analogy should be ≤ 80 words",
    }),
  applications: z.array(application).min(1).max(8),
  investment_angle: z
    .string()
    .min(1)
    .refine((s) => wordCount(s) <= 150, {
      message: "public_view.investment_angle should be ≤ 150 words",
    }),
  market_size_usd: z.number().positive().int().optional(),
  why_it_matters: z
    .string()
    .min(1)
    .refine((s) => wordCount(s) <= 100, {
      message: "public_view.why_it_matters should be ≤ 100 words",
    }),
});

// Chinese translations of the public_view prose fields. All optional
// so a node can translate just what's ready and fall back to English
// for the rest. Word-count caps removed — Chinese is denser than
// English and a hand-crafted translation shouldn't be force-fit to
// the English limit. Tone goal: idiomatic 中文, sourced from the
// lab's official Chinese site when possible (Qwen / DeepSeek /
// Alibaba / Tencent docs have native zh content); Chinese tech
// media (机器之心, 量子位, InfoQ) for Western models.
const publicViewZh = z
  .object({
    plain_english: z.string().optional(),
    analogy: z.string().optional(),
    investment_angle: z.string().optional(),
    why_it_matters: z.string().optional(),
  })
  .optional();

const relationship = z.object({
  to: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: z.enum(RELATIONSHIP_TYPES),
  note: z.string().max(180).optional(),
});

const benchmark = z.object({
  name: z.string(),
  score: z.string(),
  vs_baseline: z.string().optional(),
  // Citation source for the score — required to be one of the three
  // approved leaderboards: llm-stats.com, huggingface.co,
  // artificialanalysis.ai. Optional in schema (back-compat with existing
  // nodes); ModelSpec.astro falls back to a per-benchmark default URL
  // pointing at one of the three sources when omitted.
  source_url: z.string().url().optional(),
});

const modelVariant = z.object({
  // Stable id used by the UI variant switcher.
  // Examples: "gpt-5.2-thinking", "gpt-5.5-pro", "claude-opus-4-7".
  id: z.string().min(1),
  // Human-facing label shown in the picker.
  label: z.string().min(1),
  // Optional metadata (kept minimal — variants evolve quickly).
  status: z.enum(["preview", "active", "legacy", "retired"]).optional(),
  released_at: z.coerce.date().optional(),
  retired_at: z.coerce.date().optional(),
  // Canonical API model id if applicable (e.g. "gpt-5.2").
  api_model: z.string().optional(),
  // Optional per-variant benchmark set. If omitted, pages fall back to
  // the parent model_spec.benchmarks.
  benchmarks: z.array(benchmark).optional(),
});

const modelSpec = z.object({
  parameters: z.string().optional(),
  architecture: z.string().optional(),
  // Optional "series" grouping for /tree/ family lanes, e.g.
  // "OpenAI GPT", "OpenAI o-series", "Anthropic Claude".
  // If omitted, the tree view falls back to a heuristic by slug/org.
  family: z.string().min(1).optional(),
  context_window: z.number().int().positive().optional(),
  training_tokens: z.string().optional(),
  training_compute: z.string().optional(),
  release_type: z
    .enum(["paper", "api", "open_weights", "demo", "product"])
    .optional(),
  // Multi-channel availability — a flagship model is rarely just one of
  // {API, app, open weights}. GPT-5 = api + product (ChatGPT). DeepSeek V3
  // = open_weights + api + product (chat.deepseek.com). Llama 4 = open
  // weights + product (Meta AI app). Llama 3 = open weights only.
  // Populated from scripts/migrate-availability.mjs (1:1 from release_type
  // by default; flagship models add channels manually).
  availability: z
    .array(z.enum(["api", "product", "open_weights", "research", "demo", "enterprise"]))
    .optional(),
  modalities: z.array(z.string()).optional(),
  // Optional split for models where input/output differ (e.g. TTS, STT,
  // text-to-image). If omitted, the UI treats `modalities` as both in+out.
  modalities_in: z.array(z.string()).optional(),
  modalities_out: z.array(z.string()).optional(),
  benchmarks: z.array(benchmark).optional(),
  // Official model / family page on the lab's own site (e.g.
  // https://www.anthropic.com/news/claude-3-family). Optional —
  // ModelSpec.astro falls back to an org→homepage lookup when omitted.
  homepage: z.string().url().optional(),
  // Per-model GitHub repo (e.g. https://github.com/meta-llama/llama3).
  // Optional — the node header falls back to an org→github lookup when
  // the model is open-weights and no explicit URL is given.
  github: z.string().url().optional(),
  // Artificial Analysis model page (if it exists), used to link out to
  // the AA benchmarks + pricing + latency dashboard.
  aa_url: z.string().url().optional(),
  // Hugging Face model/org page (if it exists), used to link out to
  // open weights cards, model cards, or collections.
  hf_url: z.string().url().optional(),
  // Variant surfaces inside a single model family (e.g. GPT‑5.2 Instant /
  // Thinking / Pro; or "Thinking/Max/High" product tiers). Pages use this
  // to let users switch which surface they're looking at without adding
  // separate graph nodes.
  variants: z.array(modelVariant).optional(),
});

const nodes = defineCollection({
  loader: glob({
    pattern: ["**/*.mdx", "!**/_*.mdx"],
    base: "./src/content/nodes",
  }),
  schema: z
    .object({
      slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
      title: z.string().min(1),
      date: z.coerce.date(),
      era: z.enum(ERAS),
      category: z.array(z.string()).min(1),
      relationships: z.array(relationship).default([]),
      authors: z.array(z.string()).min(1),
      org: z.enum(ORGS),
      breakthrough_score: z.number().int().min(1).max(10),
      status: z.enum(STATUSES),
      // Optional: keep a node page, but hide it from the /tree/ graph.
      // Used when collapsing fine-grained model SKUs into one series node.
      graph_hidden: z.boolean().optional(),
      // Optional: show only one representative node per org-year in the
      // main /tree/ and /timeline/ views. If ANY node sets graph_featured,
      // those views will render only featured nodes (and skip graph_hidden).
      graph_featured: z.boolean().optional(),
      model_spec: modelSpec.optional(),
      public_view: publicView,
      // Optional Chinese frontmatter (idiomatic translations — not
      // machine-stiff; sourced from official Chinese docs or Chinese
      // tech press for quality). Per-field optional so partial
      // translations are legal.
      title_zh: z.string().optional(),
      public_view_zh: publicViewZh,
      citations: z.array(citation).min(1),
    })
    .strict(),
});

const companyCatalogItem = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  kind: z.enum(["llm", "reasoning", "multimodal", "vision", "image", "video", "audio", "embedding", "reranker", "tool"]).optional(),
  released_at: z.coerce.date().optional(),
  retired_at: z.coerce.date().optional(),
  api_model: z.string().optional(),
  // Optional cross-link into an existing node slug in the tree.
  node_slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  source_url: z.string().url().optional(),
});

const companies = defineCollection({
  loader: glob({
    pattern: ["**/*.mdx", "!**/_*.mdx"],
    base: "./src/content/companies",
  }),
  schema: z
    .object({
      slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
      name: z.string().min(1),
      orgs: z.array(z.enum(ORGS)).min(1),
      homepage: z.string().url().optional(),
      summary: z.string().min(1),
      summary_zh: z.string().optional(),
      catalog: z.array(companyCatalogItem).optional(),
      sources: z.array(z.string().url()).optional(),
    })
    .strict(),
});

export const collections = { nodes, companies };
