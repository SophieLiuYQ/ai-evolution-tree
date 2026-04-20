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
  "scales",
  "distills",
  "fine_tunes",
  "surpasses",
  "competes_with",
  "applies",
  "replaces",
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

const relationship = z.object({
  to: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: z.enum(RELATIONSHIP_TYPES),
  note: z.string().max(180).optional(),
});

const benchmark = z.object({
  name: z.string(),
  score: z.string(),
  vs_baseline: z.string().optional(),
});

const modelSpec = z.object({
  parameters: z.string().optional(),
  architecture: z.string().optional(),
  context_window: z.number().int().positive().optional(),
  training_tokens: z.string().optional(),
  training_compute: z.string().optional(),
  release_type: z
    .enum(["paper", "api", "open_weights", "demo", "product"])
    .optional(),
  modalities: z.array(z.string()).optional(),
  benchmarks: z.array(benchmark).optional(),
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
      model_spec: modelSpec.optional(),
      public_view: publicView,
      citations: z.array(citation).min(1),
    })
    .strict(),
});

export const collections = { nodes };
