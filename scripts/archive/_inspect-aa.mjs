#!/usr/bin/env node
// Debug helper: fetch one AA record and print its key fields.
// Safe to delete any time.

const AA_URL = "https://artificialanalysis.ai/models";

function unescapeRSC(html) {
  const chunks = [
    ...html.matchAll(
      /self\.__next_f\.push\(\[1,"((?:\\"|[^"])*)"\]\)/g,
    ),
  ].map((m) =>
    m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n"),
  );
  return chunks.join("\n");
}

function parseFirstRecord(blob) {
  const re = /\{"additional_text":/g;
  let m;
  while ((m = re.exec(blob)) !== null) {
    let depth = 0;
    let i = m.index;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < blob.length; i++) {
      const c = blob[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    try {
      const obj = JSON.parse(blob.slice(start, i));
      if (obj.model_family_slug) return obj;
    } catch {
      // ignore
    }
  }
  return null;
}

const r = await fetch(AA_URL, {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; ai-tree-inspect/0.1)",
    Accept: "text/html",
  },
});
if (!r.ok) throw new Error(`AA returned HTTP ${r.status}`);
const html = await r.text();
const blob = unescapeRSC(html);
const rec = parseFirstRecord(blob);
if (!rec) {
  console.error("No AA records found.");
  process.exit(1);
}

console.log("keys (first 60):", Object.keys(rec).slice(0, 60));
console.log("sample fields:", {
  model_family_slug: rec.model_family_slug,
  model_slug: rec.model_slug,
  creator: rec.creator,
  license: rec.license,
  context_window: rec.context_window,
  input_modality: rec.input_modality,
  output_modality: rec.output_modality,
  model_size: rec.model_size,
  total_parameters: rec.total_parameters,
  active_parameters: rec.active_parameters,
});

