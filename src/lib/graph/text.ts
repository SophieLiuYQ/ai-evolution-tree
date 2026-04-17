// ===== Card text helpers — keep text inside the 220px card width
export const TITLE_MAX = 22; // chars at 13px sans-serif bold
export const SPEC_MAX = 24; // chars at 11px monospace
export const META_MAX = 26; // chars at 11px monospace bold ("Jun · OrgName")

export function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Strip verbose parenthetical variants ("(base)", "(big)") so the most
// representative number fits without overflowing
export function simplifyParams(p: string): string {
  return p
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+\/\s+/g, " / ")
    .trim();
}

export function fmtCtx(c: number): string {
  // Always round to integer — never show "32.768k", show "33k"
  if (c >= 1_000_000) return `${Math.round(c / 1_000_000)}M ctx`;
  if (c >= 1000) return `${Math.round(c / 1000)}k ctx`;
  return `${c} ctx`;
}

export function fmtSpec(
  ms: { parameters?: string; context_window?: number } | undefined,
): string | null {
  if (!ms) return null;
  let s = ms.parameters ? simplifyParams(ms.parameters) : "";
  if (ms.context_window) {
    const ctx = fmtCtx(ms.context_window);
    s = s ? `${s} · ${ctx}` : ctx;
  }
  return s ? clip(s, SPEC_MAX) : null;
}

export const fmtMonth = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short" });
