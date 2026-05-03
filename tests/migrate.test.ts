import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..");
const OUT = join(REPO, "data", "graph.json");

describe("graph:export migration script", () => {
  it("runs cleanly and regenerates data/graph.json", () => {
    const beforeMtime = statSync(OUT).mtimeMs;

    execFileSync("node", ["scripts/migrate-mdx-to-json.mjs"], {
      cwd: REPO,
      stdio: "pipe",
    });

    const afterMtime = statSync(OUT).mtimeMs;
    expect(afterMtime).toBeGreaterThanOrEqual(beforeMtime);

    const out = JSON.parse(readFileSync(OUT, "utf-8"));
    expect(out.nodes.length).toBeGreaterThan(0);
    expect(out.edges.length).toBeGreaterThan(0);
    expect(out.version).toBeTruthy();
  });
});
