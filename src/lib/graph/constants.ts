import type { EdgeStyle, Rel } from "./types";

// ===== Org colors (light theme)
export const orgFill: Record<string, string> = {
  "OpenAI": "#d8f0e8",
  "Midjourney": "#e7e5e4",
  "Anthropic": "#fed7aa",
  "Google": "#dbeafe",
  "Google DeepMind": "#dbeafe",
  "DeepMind": "#dbeafe",
  "Google Brain": "#dbeafe",
  // Consolidated display name used by the Company filter + card
  // data-org attribute (see lib/org-display.ts). Same color as the
  // three underlying labs so cards whose frontmatter still reads
  // "DeepMind" or "Google" visually match the filter row.
  "Google/DeepMind": "#dbeafe",
  "Meta AI": "#dbeafe",
  "Microsoft": "#ccfbf1",
  "Mistral AI": "#fee2e2",
  "Stability AI": "#ffffff",
  "EleutherAI": "#ede9fe",
  "xAI": "#e5e7eb",
  "Alibaba": "#ffe6cc",
  "DeepSeek": "#dbe5ff",
  "Zhipu": "#dbeafe",
  "Baidu": "#dbeafe",
  "Tencent": "#e0f2fe",
  "Moonshot AI": "#e0e7ff",
  "MiniMax": "#ffffff",
  "ByteDance": "#ffedd5",
  "Stepfun": "#e5e7eb",
  "Suno": "#ffffff",
  "Runway": "#ede9fe",
  "Black Forest Labs": "#e4e4e7",
  "Databricks": "#ffedd5",
  "Perplexity": "#cffafe",
  "Kuaishou": "#fef3c7",
  "Nvidia": "#dcfce7",
  "Apple": "#f1f5f9",
  "Lightricks": "#ede9fe",
};

export const orgStroke: Record<string, string> = {
  "OpenAI": "#0D8F73",
  "Midjourney": "#111111",
  "Anthropic": "#c2410c",
  "Google": "#1d4ed8",
  "Google DeepMind": "#1d4ed8",
  "DeepMind": "#1d4ed8",
  "Google Brain": "#1d4ed8",
  "Google/DeepMind": "#1d4ed8",
  "Meta AI": "#0467DF",
  "Microsoft": "#0f766e",
  "Mistral AI": "#b91c1c",
  "Stability AI": "#8E44EC",
  "EleutherAI": "#6d28d9",
  "xAI": "#374151",
  "Alibaba": "#FF6A00",
  "DeepSeek": "#4D6BFE",
  "Zhipu": "#3859FF",
  "Baidu": "#1d4ed8",
  "Tencent": "#0369a1",
  "Moonshot AI": "#4338ca",
  "MiniMax": "#E73562",
  "ByteDance": "#c2410c",
  "Stepfun": "#1F2937",
  "Suno": "#000000",
  "Runway": "#6d28d9",
  "Black Forest Labs": "#3f3f46",
  "Databricks": "#c2410c",
  "Perplexity": "#0e7490",
  "Kuaishou": "#a16207",
  "Nvidia": "#76B900",
  "Apple": "#334155",
  "Lightricks": "#111111",
};

export const fill = (org: string) => orgFill[org] ?? "#f3f4f6";
export const stroke = (org: string) => orgStroke[org] ?? "#6b7280";

// ===== Edge styles =====
// Relationship types are intentionally minimal (builds_on / competes_with /
// open_alt_to). Keep colors high-contrast and stable.
export const edgeStyle: Record<Rel["type"], EdgeStyle> = {
  builds_on: { color: "#2563EB", label: "builds on" },
  competes_with: { color: "#DC2626", label: "alternative" },
  // Graph view merges this into `competes_with`; keep here for completeness.
  open_alt_to: { color: "#DC2626", label: "alternative" },
};

// Edge types completely excluded from the graph: no path, no label, no lineage
// participation, no stagger count. The relationship data is still in the source
// MDX/JSON for reference (and shown on the detail page) — just not visualized
// in the graph layer. Keeps the "every drawn edge has a label" rule enforceable.
export const HIDDEN_EDGE_TYPES = new Set<Rel["type"]>([
  // none
]);

// ===== Layout constants (fixed font sizes — never zoomed) =====
export const NODE_W = 220;
export const NODE_H = 64;

// Horizontal layout (LR)
export const H_COL_GAP = 50; // gap between year columns (room for edge curves)
export const H_COL_W = NODE_W + H_COL_GAP;
export const H_NODE_V_GAP = 44;
export const H_TOP_PAD = 72;
export const H_BOT_PAD = 32;
export const H_SIDE_PAD = 24;

// Vertical layout (TB)
export const V_ROW_GAP = 40; // gap between year rows
export const V_NODE_H_GAP = 44;
export const V_TOP_PAD = 32;
export const V_BOT_PAD = 32;
export const V_LEFT_PAD = 92;
export const V_RIGHT_PAD = 40;
export const V_ROW_PAD_TOP = 28;
export const V_ROW_PAD_BOTTOM = 28;
export const V_MAX_INNER_WIDTH = 1400;

// Label dimensions (collision-avoidance uses these)
export const LABEL_W = 78;
export const LABEL_H = 18;
