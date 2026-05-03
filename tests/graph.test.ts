import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const graph = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "graph.json"), "utf-8"),
);

describe("data/graph.json invariants", () => {
  it("has version, nodes, edges", () => {
    expect(graph.version).toBeTruthy();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  it("stats counts match arrays", () => {
    expect(graph.stats.node_count).toBe(graph.nodes.length);
    expect(graph.stats.edge_count).toBe(graph.edges.length);
  });

  it("every node has a unique slug", () => {
    const slugs = graph.nodes.map((n: { slug: string }) => n.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // Regression guard: pre-existing dangling edges in graph.json (edges
  // pointing at slugs that aren't exported as nodes — typically because
  // the parent MDX is missing or filtered out by graph_featured). Pin the
  // count so PRs can only reduce it, not grow it.
  const DANGLING_EDGE_BASELINE = 32;
  it("dangling edge count does not regress", () => {
    const slugs = new Set(graph.nodes.map((n: { slug: string }) => n.slug));
    const dangling = graph.edges.filter(
      (e: { from: string; to: string }) => !slugs.has(e.from) || !slugs.has(e.to),
    );
    expect(
      dangling.length,
      JSON.stringify(dangling.slice(0, 3)),
    ).toBeLessThanOrEqual(DANGLING_EDGE_BASELINE);
  });

  it("no edge is a self-loop", () => {
    const loops = graph.edges.filter(
      (e: { from: string; to: string }) => e.from === e.to,
    );
    expect(loops).toEqual([]);
  });

  it("year_range is plausible", () => {
    const [lo, hi] = graph.stats.year_range;
    expect(lo).toBeGreaterThanOrEqual(1900);
    expect(hi).toBeLessThanOrEqual(new Date().getFullYear() + 1);
    expect(lo).toBeLessThanOrEqual(hi);
  });

  it("nodes are sorted by date ascending", () => {
    for (let i = 1; i < graph.nodes.length; i++) {
      expect(
        graph.nodes[i].date >= graph.nodes[i - 1].date,
        `node ${i} (${graph.nodes[i].slug}) out of order`,
      ).toBe(true);
    }
  });
});
