#!/usr/bin/env node
// Debug helper: checks if the AA /models payload contains a model_family_slug.
import { readFile } from "node:fs/promises";

const key = process.argv[2];
if (!key) {
  console.error("usage: node scripts/_aa-has-key.mjs <model_family_slug>");
  process.exit(1);
}

const AA_URL = "https://artificialanalysis.ai/models";

function unescapeRSC(html) {
  const chunks = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g),
  ].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"),
  );
  return chunks.join("\n");
}

function parseRecords(blob) {
  const re = /\{"additional_text":/g;
  const out = [];
  let m;
  while ((m = re.exec(blob)) !== null) {
    let depth = 0;
    let i = m.index;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < blob.length; i++) {
      const c = blob[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    try {
      const obj = JSON.parse(blob.slice(start, i));
      if (obj.model_family_slug) out.push(obj);
    } catch {}
  }
  return out;
}

const r = await fetch(AA_URL, { headers: { Accept: "text/html" } });
const html = await r.text();
const blob = unescapeRSC(html);
const records = parseRecords(blob);
const found = records.some((x) => String(x.model_family_slug) === key);
console.log(JSON.stringify({ key, found, totalRecords: records.length }, null, 2));

