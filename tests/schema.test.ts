import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { ERAS, STATUSES, RELATIONSHIP_TYPES } from "./_enums";

const NODES_DIR = join(__dirname, "..", "src", "content", "nodes");

const files = readdirSync(NODES_DIR).filter(
  (f) => f.endsWith(".mdx") && !f.startsWith("_"),
);

const nodes = files.map((file) => {
  const raw = readFileSync(join(NODES_DIR, file), "utf-8");
  return { file, fm: matter(raw).data as Record<string, unknown> };
});

const slugs = new Set(nodes.map((n) => n.fm.slug as string));

describe("node frontmatter", () => {
  it("loads at least one node", () => {
    expect(nodes.length).toBeGreaterThan(0);
  });

  it.each(nodes)("$file: required fields present", ({ fm }) => {
    expect(fm.slug, "slug").toBeTruthy();
    expect(fm.title, "title").toBeTruthy();
    expect(fm.date, "date").toBeTruthy();
    expect(fm.era, "era").toBeTruthy();
    expect(fm.org, "org").toBeTruthy();
  });

  it.each(nodes)("$file: era is valid enum", ({ fm }) => {
    expect(ERAS.has(fm.era as string)).toBe(true);
  });

  it.each(nodes)("$file: status (if set) is valid enum", ({ fm }) => {
    if (fm.status !== undefined) {
      expect(STATUSES.has(fm.status as string)).toBe(true);
    }
  });

  it.each(nodes)("$file: relationship types are valid enum values", ({ fm }) => {
    const rels = (fm.relationships ?? []) as Array<{ to: string; type: string }>;
    for (const rel of rels) {
      expect(RELATIONSHIP_TYPES.has(rel.type), `bad type ${rel.type}`).toBe(true);
    }
  });

  // Regression guard: there are pre-existing dangling parent references in
  // the corpus (relationships pointing at slugs without a corresponding MDX
  // file). Pin the count so PRs can only reduce it, not grow it.
  const DANGLING_PARENT_BASELINE = 8;
  it("dangling parent-slug count does not regress", () => {
    const dangling = new Set<string>();
    for (const { fm } of nodes) {
      const rels = (fm.relationships ?? []) as Array<{ to: string }>;
      for (const rel of rels) {
        if (!slugs.has(rel.to)) dangling.add(rel.to);
      }
    }
    expect(
      dangling.size,
      `unknown parent slugs: ${[...dangling].sort().join(", ")}`,
    ).toBeLessThanOrEqual(DANGLING_PARENT_BASELINE);
  });

  it("slugs are unique across all nodes", () => {
    const seen = new Map<string, string>();
    for (const { file, fm } of nodes) {
      const slug = fm.slug as string;
      if (seen.has(slug)) {
        throw new Error(`duplicate slug "${slug}" in ${file} and ${seen.get(slug)}`);
      }
      seen.set(slug, file);
    }
  });

  // Regression guard: filename year prefix should match frontmatter date
  // year, with a small allowance for historical entries where publication
  // vs. dating conventions differ (e.g. perceptron 1957 vs 1958).
  const YEAR_MISMATCH_BASELINE = 2;
  it("filename year vs date year mismatch count does not regress", () => {
    const mismatches: string[] = [];
    for (const { file, fm } of nodes) {
      const filenameYear = file.match(/^(\d{4})-/)?.[1];
      if (!filenameYear) continue;
      const dateYear = String(fm.date).slice(0, 4);
      if (filenameYear !== dateYear) mismatches.push(`${file} (${dateYear})`);
    }
    expect(
      mismatches.length,
      `mismatches: ${mismatches.join(", ")}`,
    ).toBeLessThanOrEqual(YEAR_MISMATCH_BASELINE);
  });
});
