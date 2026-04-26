#!/usr/bin/env node
// Debug helper: fetch an AA URL and print status + final URL.
const u = process.argv[2];
if (!u) {
  console.error("usage: node scripts/_check-aa-url.mjs <url>");
  process.exit(1);
}

const r = await fetch(u, {
  redirect: "follow",
  headers: { "User-Agent": "Mozilla/5.0 (compatible; ai-tree-check/0.1)" },
});
console.log(JSON.stringify({ url: u, status: r.status, ok: r.ok, finalUrl: r.url }, null, 2));

