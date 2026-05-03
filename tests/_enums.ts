import { readFileSync } from "node:fs";
import { join } from "node:path";

// Extract enum arrays from src/content.config.ts as plain string sets.
// Avoids importing the Astro schema (which depends on the `astro:content`
// virtual module and only resolves inside Astro's build).
//
// If the schema file's enum format changes, update the regex here.
const SRC = readFileSync(
  join(__dirname, "..", "src", "content.config.ts"),
  "utf-8",
);

function extractEnum(name: string): string[] {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`);
  const match = SRC.match(re);
  if (!match) throw new Error(`Could not find enum ${name} in content.config.ts`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export const ERAS = new Set(extractEnum("ERAS"));
export const STATUSES = new Set(extractEnum("STATUSES"));
export const RELATIONSHIP_TYPES = new Set(extractEnum("RELATIONSHIP_TYPES"));
export const CITATION_TYPES = new Set(extractEnum("CITATION_TYPES"));
