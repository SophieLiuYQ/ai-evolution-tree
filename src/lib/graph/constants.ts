import type { EdgeStyle, Rel } from "./types";

// ===== Org colors (light theme)
export const orgFill: Record<string, string> = {
  "OpenAI": "#d1fae5",
  "Anthropic": "#fed7aa",
  "Google": "#dbeafe",
  "Google DeepMind": "#dbeafe",
  "DeepMind": "#dbeafe",
  "Google Brain": "#dbeafe",
  "Meta AI": "#cffafe",
  "Microsoft": "#ccfbf1",
  "Mistral AI": "#fee2e2",
  "Stability AI": "#e7e5e4",
  "EleutherAI": "#ede9fe",
  "xAI": "#e5e7eb",
  "Alibaba": "#fef3c7",
  "DeepSeek": "#fae8ff",
  "Tsinghua / Zhipu": "#ffe4e6",
  "01.AI": "#ffe4e6",
  "Baidu": "#dbeafe",
  "Tencent": "#e0f2fe",
  "Moonshot AI": "#e0e7ff",
  "MiniMax": "#ede9fe",
  "ByteDance": "#ffedd5",
  "Stepfun": "#d1fae5",
  "Suno": "#fce7f3",
  "Runway": "#ede9fe",
  "Black Forest Labs": "#e4e4e7",
  "Databricks": "#ffedd5",
  "Perplexity": "#cffafe",
  "Kuaishou": "#fef3c7",
  "Nvidia": "#dcfce7",
  "Apple": "#f1f5f9",
};

export const orgStroke: Record<string, string> = {
  "OpenAI": "#047857",
  "Anthropic": "#c2410c",
  "Google": "#1d4ed8",
  "Google DeepMind": "#1d4ed8",
  "DeepMind": "#1d4ed8",
  "Google Brain": "#1d4ed8",
  "Meta AI": "#0e7490",
  "Microsoft": "#0f766e",
  "Mistral AI": "#b91c1c",
  "Stability AI": "#57534e",
  "EleutherAI": "#6d28d9",
  "xAI": "#374151",
  "Alibaba": "#a16207",
  "DeepSeek": "#a21caf",
  "Tsinghua / Zhipu": "#be123c",
  "01.AI": "#be123c",
  "Baidu": "#1d4ed8",
  "Tencent": "#0369a1",
  "Moonshot AI": "#4338ca",
  "MiniMax": "#6d28d9",
  "ByteDance": "#c2410c",
  "Stepfun": "#047857",
  "Suno": "#be185d",
  "Runway": "#6d28d9",
  "Black Forest Labs": "#3f3f46",
  "Databricks": "#c2410c",
  "Perplexity": "#0e7490",
  "Kuaishou": "#a16207",
  "Nvidia": "#15803d",
  "Apple": "#334155",
};

export const fill = (org: string) => orgFill[org] ?? "#f3f4f6";
export const stroke = (org: string) => orgStroke[org] ?? "#6b7280";

// ===== Edge styles =====
// Visible types: primary triangle (blue/orange/green) for the 3 most frequent
// types — each at ~120° hue apart for max distinguishability.
export const edgeStyle: Record<Rel["type"], EdgeStyle> = {
  builds_on: { color: "#2563EB", label: "builds on" },
  scales: { color: "#EA580C", label: "scales" },
  competes_with: { color: "#16A34A", label: "competes" },
  surpasses: { color: "#C026D3", label: "surpasses" },
  fine_tunes: { color: "#EAB308", label: "fine-tunes" },
  distills: { color: "#78350F", label: "distills" },
  // Hidden types — present in source data but never rendered.
  applies: { color: "#0891B2", dash: "4,3", label: "applies" },
  replaces: { color: "#64748B", dash: "4,3", label: "replaces" },
  open_alt_to: { color: "#DB2777", dash: "6,3", label: "open alt" },
};

// Edge types completely excluded from the graph: no path, no label, no lineage
// participation, no stagger count. The relationship data is still in the source
// MDX/JSON for reference (and shown on the detail page) — just not visualized
// in the graph layer. Keeps the "every drawn edge has a label" rule enforceable.
export const HIDDEN_EDGE_TYPES = new Set<Rel["type"]>([
  "applies",
  "replaces",
  "open_alt_to",
]);

// ===== Layout constants (fixed font sizes — never zoomed) =====
export const NODE_W = 220;
export const NODE_H = 64;

// Horizontal layout (LR)
export const H_COL_GAP = 100;
export const H_COL_W = NODE_W + H_COL_GAP;
export const H_NODE_V_GAP = 44;
export const H_TOP_PAD = 72;
export const H_BOT_PAD = 32;
export const H_SIDE_PAD = 24;

// Vertical layout (TB)
export const V_ROW_GAP = 80;
export const V_NODE_H_GAP = 44;
export const V_TOP_PAD = 32;
export const V_BOT_PAD = 32;
export const V_LEFT_PAD = 120;
export const V_RIGHT_PAD = 40;
export const V_ROW_PAD_TOP = 28;
export const V_ROW_PAD_BOTTOM = 28;
export const V_MAX_INNER_WIDTH = 1400;

// Label dimensions (collision-avoidance uses these)
export const LABEL_W = 78;
export const LABEL_H = 18;
