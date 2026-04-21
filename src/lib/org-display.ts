// Display-layer org consolidation. The ORGS enum in content.config.ts
// keeps fine-grained lab names (Google, DeepMind, Google DeepMind) for
// frontmatter accuracy — a 2013 Word2vec paper is Google Research, not
// DeepMind, and AlphaGo 2016 was pre-merger DeepMind. But for the
// user-facing Company filter + `data-org` attribute we collapse the
// three into one "Google/DeepMind" bucket, because by 2026 that's the
// reality: Gemini ships under DeepMind, but everyone calls it Google.
// Three filter rows for one org hurts more than it helps.
//
// Like the category normalizer, this is display-only — frontmatter
// stays untouched so the historical org names remain queryable.

const GOOGLE_GROUP = new Set(["Google", "DeepMind", "Google DeepMind"]);
export const GOOGLE_GROUP_LABEL = "Google/DeepMind";

export function normalizeOrg(org: string): string {
  return GOOGLE_GROUP.has(org) ? GOOGLE_GROUP_LABEL : org;
}
