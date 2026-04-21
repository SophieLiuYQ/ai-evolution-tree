// Display-layer category consolidation.
//
// The frontmatter `category[]` uses fine-grained tags (theory, training,
// architecture, safety, rl, infrastructure) that collapse into a single
// user-facing concept: "this is a foundational paper / meta-work, not a
// released model." The UI consolidates these under one "Paper" tag so
// the filter list stays readable and the detail page doesn't show four
// near-synonymous meta pills on a single paper.
//
// The frontmatter stays fine-grained — we only collapse at display.

const PAPER_META = new Set([
  "theory",
  "training",
  "architecture",
  "safety",
  "rl",
  "infrastructure",
]);

/** Collapse paper-meta tags to a single "paper" tag, preserving order
 *  and deduping. All non-meta tags pass through unchanged. */
export function normalizeCategories(cats: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let sawPaper = false;
  for (const c of cats) {
    if (PAPER_META.has(c)) {
      if (!sawPaper) {
        out.push("paper");
        seen.add("paper");
        sawPaper = true;
      }
      continue;
    }
    if (!seen.has(c)) {
      out.push(c);
      seen.add(c);
    }
  }
  return out;
}
