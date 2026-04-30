// Org → logo metadata for the model page hero + sidebar.
//
// We render small inline SVGs styled to match each lab's public brand
// (color background + stylized monogram or icon). These are NOT pixel
// reproductions of trademarked logos — they're recognizable substitutes
// that fit the editorial layout. Orgs without an entry fall back to the
// 2-letter monogram in [slug].astro.

export type OrgLogo = {
  // Tile background colour (matches the example screenshots: warm tinted
  // squares like Anthropic's peach, OpenAI's sand, Google's white).
  bg: string;
  // Foreground (text/path stroke) colour — picked for AA contrast on `bg`.
  fg: string;
  // SVG inner content — placed inside a 24×24 viewBox so the parent
  // controls actual pixel size. Keep paths simple; one or two strokes max.
  svg: string;
};

// Generic helper for building a glyph card. Pass tightly-fitted SVG path
// data; it's centered in a 24×24 box with `fg` as both stroke + fill.
const glyph = (bg: string, fg: string, svg: string): OrgLogo => ({ bg, fg, svg });

// Anthropic — peach tile + dark "A" (matches the example screenshot).
const ANTHROPIC = glyph(
  "#F0D6B5",
  "#1B1A19",
  `<path d="M9.4 4.5l-4.4 11.8h2.7l.95-2.6h4.7l.95 2.6h2.7L12.6 4.5H9.4zm.6 2.45l1.7 4.7H8.3l1.7-4.7zM16.5 4.5h2.5v11.8h-2.5z" fill="currentColor"/>`,
);

// OpenAI — soft sand; the OpenAI logo file ships with its own teal fill,
// so the tile just provides the surrounding card shape.
const OPENAI = glyph(
  "#F0F4F2",
  "#74AA9C",
  `<path d="M12 2.6c2.04 0 3.85.95 5 2.43a6.18 6.18 0 014.6 2.66 6.21 6.21 0 01.57 6.18 6.21 6.21 0 01-.66 6.34A6.21 6.21 0 0116 22.6a6.21 6.21 0 01-4-1.43 6.21 6.21 0 01-5-1A6.21 6.21 0 012.4 16a6.21 6.21 0 01.66-6.34A6.18 6.18 0 013.6 5.4 6.21 6.21 0 018 2.6zm0 2.4a3.81 3.81 0 00-3.6 2.42L8.4 7.4l3.6 2.07 3.6-2.07-.04-.06A3.8 3.8 0 0012 5zm-5.32 4.04a3.81 3.81 0 000 3.92l.04.04 3.6-2.07v-4.16l-.04.02a3.81 3.81 0 00-3.6 2.25zm10.64 0a3.81 3.81 0 00-3.6-2.25l-.04-.02v4.16l3.6 2.07.04-.04a3.81 3.81 0 000-3.92zM8.4 16.6l3.6-2.07 3.6 2.07-.04.06A3.81 3.81 0 0112 19a3.81 3.81 0 01-3.56-2.34l-.04-.06z" fill="currentColor" opacity=".85"/>`,
);

// Google / DeepMind — white tile, four-color "G".
const GOOGLE = glyph(
  "#FFFFFF",
  "#1F1F1F",
  `<g><path d="M21.6 12.23c0-.66-.06-1.3-.17-1.9H12v3.6h5.38a4.6 4.6 0 01-2 3.02v2.5h3.23c1.88-1.74 2.99-4.3 2.99-7.22z" fill="#4285F4"/><path d="M12 22c2.7 0 4.97-.9 6.62-2.45l-3.23-2.5a6.04 6.04 0 01-9.04-3.18H2.99v2.58A10 10 0 0012 22z" fill="#34A853"/><path d="M6.35 13.87a6.02 6.02 0 010-3.74V7.55H2.99a10 10 0 000 8.9l3.36-2.58z" fill="#FBBC05"/><path d="M12 6.36c1.47 0 2.79.5 3.83 1.5l2.86-2.86A10 10 0 002.99 7.55l3.36 2.58A6 6 0 0112 6.36z" fill="#EA4335"/></g>`,
);

// Meta — pale blue tile, brand blue.
const META = glyph(
  "#E6F0FA",
  "#0467DF",
  `<path d="M3.5 12.4c1.5-3.6 3.4-5.5 5.6-5.5 1.7 0 3 1 4.5 3.4l1.4 2.3c1.3 2.1 2.1 2.8 3 2.8 1 0 1.6-.9 1.6-2.6 0-2-.8-3.4-2.2-3.4-.7 0-1.4.4-2.2 1.2l-1-2.3c1-1 2.1-1.6 3.5-1.6 2.7 0 4.1 2.5 4.1 5.6 0 3.4-1.6 5.6-4 5.6-1.6 0-2.7-.8-4.1-3l-1.7-2.7c-1.2-2-1.9-2.6-2.7-2.6-1.1 0-2.1 1.4-3 4.2L3.5 12.4z" fill="currentColor"/>`,
);

// Microsoft — four-color squares.
const MICROSOFT = glyph(
  "#FFFFFF",
  "#1F1F1F",
  `<g><rect x="3" y="3" width="8.5" height="8.5" fill="#F25022"/><rect x="12.5" y="3" width="8.5" height="8.5" fill="#7FBA00"/><rect x="3" y="12.5" width="8.5" height="8.5" fill="#00A4EF"/><rect x="12.5" y="12.5" width="8.5" height="8.5" fill="#FFB900"/></g>`,
);

// Mistral AI — warm sand tile, dark logo (the SimpleIcons mistral mark
// is a single-colour flag pattern; tile keeps brand warmth).
const MISTRAL = glyph(
  "#FFE7CC",
  "#FA500F",
  `<g><rect x="3" y="4" width="3.5" height="3.5" fill="#FFD800"/><rect x="6.5" y="4" width="3.5" height="3.5" fill="#FFD800"/><rect x="3" y="7.5" width="3.5" height="3.5" fill="#FF8205"/><rect x="6.5" y="7.5" width="3.5" height="3.5" fill="#FF8205"/><rect x="3" y="11" width="3.5" height="3.5" fill="#FA500F"/><rect x="6.5" y="11" width="3.5" height="3.5" fill="#FA500F"/><rect x="3" y="14.5" width="3.5" height="3.5" fill="#E10500"/><rect x="6.5" y="14.5" width="3.5" height="3.5" fill="#E10500"/><rect x="3" y="18" width="3.5" height="2" fill="#9D0700"/><rect x="6.5" y="18" width="3.5" height="2" fill="#9D0700"/><rect x="11" y="11" width="3.5" height="3.5" fill="#FA500F"/><rect x="14.5" y="11" width="3.5" height="3.5" fill="#FA500F"/><rect x="11" y="14.5" width="3.5" height="3.5" fill="#E10500"/><rect x="14.5" y="14.5" width="3.5" height="3.5" fill="#E10500"/><rect x="11" y="18" width="3.5" height="2" fill="#9D0700"/><rect x="14.5" y="18" width="3.5" height="2" fill="#9D0700"/></g>`,
);

// xAI — neutral light tile, dark X.
const XAI = glyph(
  "#F4F4F5",
  "#0A0A0A",
  `<path d="M5 4l6 8-6 8h3.5l4.25-5.6L17 20h2.5l-6.25-8.4L19.4 4H16l-4 5.4L8 4z" fill="currentColor"/>`,
);

// DeepSeek — soft blue tile, dark logo (preserves brand hue without
// killing contrast against the monochrome SimpleIcons whale).
const DEEPSEEK = glyph(
  "#E6EDFF",
  "#1E3FFF",
  `<path d="M19.5 9.5c0-2.6-2-4.7-4.5-4.7-1.4 0-2.6.6-3.4 1.6L9.6 5.5c-.6-.4-1.4 0-1.4.7v2.3c-2 .9-3.4 2.9-3.4 5.3 0 2.6 1.6 4.7 3.7 5.4.4.1.7-.2.7-.6v-1c0-.4.4-.7.8-.5 1 .4 2.1.7 3.3.7 3.5 0 6.4-2.4 6.4-5.4l-.2-2.9zm-3.6 1.3a1 1 0 110-2 1 1 0 010 2z" fill="currentColor"/>`,
);

// Alibaba / Qwen — soft purple tile, brand purple logo.
const ALIBABA = glyph(
  "#EBEAFD",
  "#615CED",
  `<path d="M12 4l5 4.5v7L12 20l-5-4.5v-7L12 4zm0 2.5L9 8.8v6.4l3 2.3 3-2.3V8.8L12 6.5z" fill="currentColor"/><path d="M9.5 11.5h5v1h-5z" fill="currentColor"/>`,
);

// Nvidia — pale green tile, dark logo.
const NVIDIA = glyph(
  "#E6F4D0",
  "#76B900",
  `<path d="M12 6c-3.5 0-6 2.7-6 6s2.5 6 6 6 6-2.7 6-6-2.5-6-6-6zm0 2.2c2 0 3.7 1.7 3.7 3.8s-1.7 3.8-3.7 3.8-3.7-1.7-3.7-3.8 1.7-3.8 3.7-3.8z" fill="currentColor"/><path d="M2 11h4v2H2zm16 0h4v2h-4z" fill="currentColor"/>`,
);

// Amazon — neutral light tile, brand orange.
const AMAZON = glyph(
  "#FFF4E0",
  "#FF9900",
  `<path d="M4 14.5C7 17 11 18 15 17.5c3.2-.4 6-1.6 8-3l-.6-.5c-2 1-4.5 1.7-7 2-3.5.3-7-.5-9.8-2zM6 11.5h2.4V9.4c0-1.4.6-2.2 1.7-2.2 1 0 1.6.7 1.6 2.1v2.2H14V9.4c0-1.6.7-2.2 1.7-2.2 1.1 0 1.6.6 1.6 2.1v2.2h2.4V9c0-2.6-1.4-3.8-3.4-3.8-1.4 0-2.4.6-3 1.6-.6-1-1.5-1.6-2.8-1.6-1.5 0-2.5.7-3 1.6V5.4H6v6.1z" fill="currentColor"/>`,
);

// Cohere — coral/red gradient bars.
const COHERE = glyph(
  "#39594D",
  "#D18EE2",
  `<path d="M4 14c0-2.2 1.8-4 4-4h8a2 2 0 010 4H8a4 4 0 100 8 2 2 0 010-4 4 4 0 010-4z" fill="currentColor"/><circle cx="8" cy="6" r="2.5" fill="#FF7759"/>`,
);

// IBM — soft blue tile, brand blue.
const IBM = glyph(
  "#E6F0FA",
  "#1F70C1",
  `<g fill="currentColor"><rect x="3" y="6" width="18" height="1.6"/><rect x="3" y="9" width="18" height="1.6"/><rect x="3" y="12" width="18" height="1.6"/><rect x="3" y="15" width="18" height="1.6"/><rect x="3" y="18" width="18" height="1.6"/></g>`,
);

// Apple — light gray tile, dark logo.
const APPLE = glyph(
  "#F5F5F7",
  "#0A0A0A",
  `<path d="M16.4 12.3c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.4 1.2-.1 1.6-.8 3.1-.8s1.8.8 3.1.7c1.3 0 2.1-1.2 2.9-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.7-3.8zM14.1 5.4c.7-.8 1.1-1.9 1-3-.9.1-2 .7-2.7 1.5-.6.7-1.1 1.8-1 2.9 1 0 2-.6 2.7-1.4z" fill="currentColor"/>`,
);

// Liquid AI — droplet shape.
const LIQUID = glyph(
  "#000000",
  "#7CC1FF",
  `<path d="M12 3l5 7.5c1.7 2.6.7 6.1-2.2 7.5-2.9 1.4-6.4-.4-7-3.7-.3-1.4.1-2.8.9-4L12 3z" fill="currentColor"/>`,
);

// AI21 Labs — wave bars.
const AI21 = glyph(
  "#0F0F0F",
  "#FB5C57",
  `<g fill="currentColor"><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/></g>`,
);

// Perplexity — purple star.
const PERPLEXITY = glyph(
  "#1F1F1F",
  "#1FB8CD",
  `<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" fill="currentColor"/>`,
);

// MiniMax — magenta square with M.
const MINIMAX = glyph(
  "#F94E8A",
  "#FFFFFF",
  `<path d="M5 6h2.5l2 6.5 2-6.5H14v12h-2v-7.6L10 17h-1l-2-5.6V18H5V6zm12 0h2v12h-2V6z" fill="currentColor"/>`,
);

// Hugging Face — yellow brand tile.
const HUGGINGFACE = glyph(
  "#FFF7CC",
  "#FFD21E",
  `<circle cx="12" cy="12" r="8.5" fill="currentColor" opacity=".18"/><circle cx="9" cy="11" r="1.3" fill="currentColor"/><circle cx="15" cy="11" r="1.3" fill="currentColor"/><path d="M8 14c1 1.5 2.5 2.4 4 2.4s3-.9 4-2.4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
);

// Stability AI — purple/magenta gradient stripe.
const STABILITY = glyph(
  "#A623F1",
  "#FFFFFF",
  `<path d="M4 9c0-2 1.5-4 4-4h6c3 0 5.5 2.5 5.5 5.5S17 16 14 16H7v3H4V9zm3 0v4h7c1.4 0 2.5-1.1 2.5-2.5S15.4 8 14 8H8c-.5 0-1 .4-1 1z" fill="currentColor"/>`,
);

// Black Forest Labs — black tile with pine tree.
const BFL = glyph(
  "#0A0A0A",
  "#FFFFFF",
  `<path d="M12 3l4 4h-2l3.5 4h-2.5l4 5h-5v3h-3v-3H6l4-5H7.5L11 7H9l3-4z" fill="currentColor"/>`,
);

// Tencent — pale blue tile, brand blue.
const TENCENT = glyph(
  "#E6F0FA",
  "#0052D9",
  `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
);

// Baidu / ERNIE — pale blue tile, brand blue.
const BAIDU = glyph(
  "#E8E9FB",
  "#2932E1",
  `<circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="6" r="2" fill="currentColor"/><circle cx="6" cy="11" r="2" fill="currentColor"/><circle cx="18" cy="11" r="2" fill="currentColor"/><path d="M12 11c-3 0-5 3-5 5.5S9 19 12 19s5-1 5-2.5S15 11 12 11z" fill="currentColor"/>`,
);

// Stepfun — orange S-shape.
const STEPFUN = glyph(
  "#FF6B35",
  "#FFFFFF",
  `<path d="M16 8c-1-1-2.5-1.5-4-1.5-3 0-5 1.8-5 4 0 4 7 3 7 5 0 .8-.8 1.5-2.5 1.5-1.5 0-2.7-.6-3.5-1.5l-1.5 2c1.2 1.2 3 2 5 2 3 0 5-1.8 5-4 0-4-7-3-7-5 0-.8.8-1.5 2.5-1.5 1.2 0 2.3.4 3 1l1-2z" fill="currentColor"/>`,
);

// Moonshot AI / Kimi — yellow crescent moon.
const MOONSHOT = glyph(
  "#1F1F1F",
  "#FFE66D",
  `<path d="M14 4a8 8 0 100 16 6 6 0 010-12 6 6 0 01-2-2 6 6 0 012-2z" fill="currentColor"/>`,
);

// ByteDance — pale blue tile, brand blue.
const BYTEDANCE = glyph(
  "#E6F2FF",
  "#3C8CFF",
  `<path d="M6 4v8h3v8l9-12h-4l3-4z" fill="currentColor"/>`,
);

// Tsinghua / Zhipu — blue with Z.
const ZHIPU = glyph(
  "#1E3FFF",
  "#FFFFFF",
  `<path d="M6 6h12L8 16h10v2H6v-2L16 8H6V6z" fill="currentColor"/>`,
);

// Allen AI — gold/orange A.
const ALLENAI = glyph(
  "#0F0F0F",
  "#F8B700",
  `<path d="M12 5l7 14h-3l-1.4-3H9.4L8 19H5l7-14zm0 4.5l-1.7 4h3.4l-1.7-4z" fill="currentColor"/>`,
);

// Salesforce — pale sky tile, brand sky-blue.
const SALESFORCE = glyph(
  "#E0F4FE",
  "#00A1E0",
  `<path d="M18.5 13.5a3.5 3.5 0 00-3-5.4 4 4 0 00-7.4-1A3 3 0 003.5 11a3 3 0 002.5 3.4A3 3 0 0010 17a3 3 0 005.5-.5 3 3 0 003-3z" fill="currentColor"/>`,
);

// Hume AI — purple H.
const HUME = glyph(
  "#000000",
  "#FFCC00",
  `<path d="M6 5h2.5v6h7V5H18v14h-2.5v-6h-7v6H6V5z" fill="currentColor"/>`,
);

// Suno — light tile, dark logo.
const SUNO = glyph(
  "#F0F0F0",
  "#0A0A0A",
  `<path d="M16 8c-1-1.5-3-2.5-5-2.5-3.5 0-6 2-6 4.5 0 5 9 4 9 6.5 0 1-1.5 1.5-3 1.5-2 0-3.5-.8-4.5-2L5 18c1.5 1.5 3.5 2 5.5 2 3.5 0 6-2 6-4.5 0-5-9-4-9-6.5 0-1 1.5-1.5 3-1.5 1.5 0 2.8.5 3.5 1.5l2-1z" fill="currentColor"/>`,
);

// Runway — green/black play arrow.
const RUNWAY = glyph(
  "#0A0A0A",
  "#00FF85",
  `<path d="M8 5l11 7-11 7V5z" fill="currentColor"/>`,
);

// Midjourney — sand tile, ship icon.
const MIDJOURNEY = glyph(
  "#191B1F",
  "#FFFFFF",
  `<path d="M3 14l9-9 9 9-3 5H6l-3-5zm9-6l-6 6h12l-6-6z" fill="currentColor"/>`,
);

// Luma AI — purple wave.
const LUMA = glyph(
  "#1B1B1B",
  "#A78BFA",
  `<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
);

// ElevenLabs — neutral light tile, dark logo.
const ELEVENLABS = glyph(
  "#F4F4F5",
  "#0A0A0A",
  `<g fill="currentColor"><rect x="9" y="6" width="2" height="12" rx="1"/><rect x="13" y="6" width="2" height="12" rx="1"/></g>`,
);

// Map — keys are the EXACT org name as it appears in content.config.ts.
// Add aliases (DeepMind / Google DeepMind / Google Brain → GOOGLE).
export const ORG_LOGOS: Record<string, OrgLogo> = {
  "Anthropic": ANTHROPIC,
  "OpenAI": OPENAI,
  "Google": GOOGLE,
  "Google DeepMind": GOOGLE,
  "DeepMind": GOOGLE,
  "Google Brain": GOOGLE,
  "Meta AI": META,
  "Microsoft": MICROSOFT,
  "Mistral AI": MISTRAL,
  "xAI": XAI,
  "DeepSeek": DEEPSEEK,
  "Alibaba": ALIBABA,
  "Nvidia": NVIDIA,
  "Amazon": AMAZON,
  "Cohere": COHERE,
  "IBM": IBM,
  "Apple": APPLE,
  "Liquid AI": LIQUID,
  "AI21 Labs": AI21,
  "Perplexity": PERPLEXITY,
  "MiniMax": MINIMAX,
  "Hugging Face": HUGGINGFACE,
  "Stability AI": STABILITY,
  "Black Forest Labs": BFL,
  "Tencent": TENCENT,
  "Baidu": BAIDU,
  "Stepfun": STEPFUN,
  "Moonshot AI": MOONSHOT,
  "ByteDance": BYTEDANCE,
  "Tsinghua / Zhipu": ZHIPU,
  "Allen AI": ALLENAI,
  "Salesforce": SALESFORCE,
  "Hume AI": HUME,
  "Suno": SUNO,
  "Runway": RUNWAY,
  "Midjourney": MIDJOURNEY,
  "Luma AI": LUMA,
  "ElevenLabs": ELEVENLABS,
};

export function logoForOrg(org: string): OrgLogo | null {
  return ORG_LOGOS[org] ?? null;
}

// Per-org direct chat / play product URL — preferred over the generic
// homepage when wiring the "Try X" CTA. Falls back to homepage when an
// entry is missing or no product is publicly available.
export const ORG_CHAT_URL: Record<string, string> = {
  "Anthropic": "https://claude.ai/",
  "OpenAI": "https://chatgpt.com/",
  "Google": "https://gemini.google.com/",
  "Google DeepMind": "https://gemini.google.com/",
  "DeepMind": "https://gemini.google.com/",
  "xAI": "https://grok.com/",
  "Mistral AI": "https://chat.mistral.ai/",
  "Meta AI": "https://meta.ai/",
  "Microsoft": "https://copilot.microsoft.com/",
  "DeepSeek": "https://chat.deepseek.com/",
  "Alibaba": "https://chat.qwen.ai/",
  "Cohere": "https://coral.cohere.com/",
  "Perplexity": "https://www.perplexity.ai/",
  "MiniMax": "https://chat.minimax.io/",
  "Moonshot AI": "https://kimi.moonshot.cn/",
  "Tsinghua / Zhipu": "https://chatglm.cn/",
  "Tencent": "https://hunyuan.tencent.com/",
  "Baidu": "https://yiyan.baidu.com/",
  "ByteDance": "https://www.doubao.com/",
  "Suno": "https://suno.com/create",
  "Runway": "https://app.runwayml.com/",
  "Midjourney": "https://www.midjourney.com/explore",
  "Luma AI": "https://lumalabs.ai/dream-machine",
  "ElevenLabs": "https://elevenlabs.io/app",
  "Hume AI": "https://app.hume.ai/",
  "Hugging Face": "https://huggingface.co/chat/",
};

// Per-org "primary product" name used in the "Try X" CTA label. e.g.
// Anthropic → "Try Claude", OpenAI → "Try ChatGPT", Google → "Try Gemini".
// Falls back to "Try demo" when no entry exists.
export const ORG_PRODUCT_NAME: Record<string, string> = {
  "Anthropic": "Claude",
  "OpenAI": "ChatGPT",
  "Google": "Gemini",
  "Google DeepMind": "Gemini",
  "DeepMind": "Gemini",
  "xAI": "Grok",
  "Mistral AI": "Le Chat",
  "Meta AI": "Meta AI",
  "Microsoft": "Copilot",
  "DeepSeek": "DeepSeek",
  "Alibaba": "Qwen",
  "Cohere": "Coral",
  "Perplexity": "Perplexity",
  "MiniMax": "MiniMax",
  "Moonshot AI": "Kimi",
  "Tsinghua / Zhipu": "ChatGLM",
  "Tencent": "Hunyuan",
  "Baidu": "Ernie Bot",
  "ByteDance": "Doubao",
  "Suno": "Suno",
  "Runway": "Runway",
  "Midjourney": "Midjourney",
  "Luma AI": "Dream Machine",
  "ElevenLabs": "ElevenLabs",
  "Hume AI": "Hume",
  "Hugging Face": "HF Chat",
};
