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

// ===== Axis label fitting (wrap + shrink) =====
// SVG text doesn't auto-wrap; we pre-compute lines + font size that fits
// the available width, splitting on word boundaries first and falling back
// to a smaller font if a single word still overflows.

const AVG_CHAR_RATIO = 0.55; // bold sans-serif: avg glyph width ≈ 0.55 × font size

function maxCharsAt(fontSize: number, maxWidth: number): number {
  return Math.max(1, Math.floor(maxWidth / (fontSize * AVG_CHAR_RATIO)));
}

function wrapWords(label: string, maxChars: number): string[] {
  if (label.length <= maxChars) return [label];
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Try to fit `label` inside `maxWidth × maxLines` at the given font sizes
 * (preferred first). Returns the first { lines, fontSize } combination that
 * fits, or the smallest font with hard-truncation if nothing fits cleanly.
 */
export function fitAxisLabel(
  label: string,
  maxWidth: number,
  maxLines: number,
  preferredSizes: number[] = [22, 19, 16, 14, 12],
): { lines: string[]; fontSize: number } {
  for (const fs of preferredSizes) {
    const cap = maxCharsAt(fs, maxWidth);
    const lines = wrapWords(label, cap);
    const longest = Math.max(...lines.map((l) => l.length));
    if (lines.length <= maxLines && longest <= cap) {
      return { lines, fontSize: fs };
    }
  }
  // Final fallback: smallest font + hard truncate
  const fs = preferredSizes[preferredSizes.length - 1];
  const cap = maxCharsAt(fs, maxWidth);
  const lines = wrapWords(label, cap).slice(0, maxLines);
  if (lines.length === maxLines && lines[maxLines - 1].length > cap - 1) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, cap - 1) + "…";
  }
  return { lines, fontSize: fs };
}

