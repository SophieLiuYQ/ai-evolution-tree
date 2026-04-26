// Search box: type a model name → jump to it on the active pane.
// Index is built from rendered DOM (one pane is enough — same nodes,
// just different positions per orient/sort), so it never goes out of
// sync with the layouts.

import { getSort, nodePosFor, type Orient } from "./state";

type Hit = { slug: string; title: string; org: string };

const HIDE_CLASS = "hidden";
const HIGHLIGHT_CLASS = "search-highlight";
const HIGHLIGHT_MS = 2400;

let index: Hit[] = [];

function buildIndex() {
  // Use the (h, chronological) pane — always rendered initially. Titles
  // are identical across panes; only positions differ.
  const seedPane = document.querySelector<HTMLElement>(
    '.orient-pane[data-orient="h"][data-sort="chronological"]',
  );
  if (!seedPane) return;
  const links = seedPane.querySelectorAll<SVGAElement>(".node-link");
  links.forEach((link) => {
    const slug = link.getAttribute("data-slug");
    if (!slug) return;
    const texts = link.querySelectorAll("text");
    const title = texts[1]?.textContent?.trim() ?? slug;
    const meta = texts[0]?.textContent?.trim() ?? "";
    // meta format: "MMM · Org name" — split on the middle dot
    const org = meta.split("·").slice(1).join("·").trim();
    index.push({ slug, title, org });
  });
}

function rank(q: string): Hit[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return [];
  type Scored = Hit & { _score: number };
  const scored: Scored[] = [];
  for (const h of index) {
    const tl = h.title.toLowerCase();
    const sl = h.slug.toLowerCase();
    let s = 0;
    if (sl === ql) s += 100;
    else if (sl.startsWith(ql)) s += 50;
    else if (sl.includes(ql)) s += 20;
    if (tl.startsWith(ql)) s += 40;
    else if (tl.includes(ql)) s += 15;
    if (h.org.toLowerCase().includes(ql)) s += 5;
    if (s > 0) scored.push({ ...h, _score: s });
  }
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, 10);
}

function activePaneEl(): HTMLElement | null {
  const panes = document.querySelectorAll<HTMLElement>(".orient-pane");
  for (const p of panes) {
    if (getComputedStyle(p).display !== "none") return p;
  }
  return null;
}

function activeOrient(): Orient | null {
  const p = activePaneEl();
  if (!p) return null;
  return (p.dataset.orient as Orient) ?? null;
}

function scrollToNode(slug: string) {
  const orient = activeOrient();
  const paneEl = activePaneEl();
  if (!orient || !paneEl) return;
  const pos = nodePosFor(orient)[slug];
  if (!pos) return;
  // SVG viewBox coords map 1:1 to pixel coords (width/height set equal
  // to viewBox dims), so we can scroll directly to the card center.
  const targetLeft = Math.max(0, pos.x - paneEl.clientWidth / 2);
  const targetTop = Math.max(0, pos.y - paneEl.clientHeight / 2);
  paneEl.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" });

  // Brief highlight on the matched card. Find within active pane only —
  // multiple panes share the same slug. Use the card's own org-stroke
  // color for the glow so the pulse blends with the card identity
  // (Anthropic orange, Alibaba yellow, OpenAI green, ...) instead of
  // a generic accent that fights with the org palette.
  const link = paneEl.querySelector<SVGAElement>(
    `.node-link[data-slug="${slug}"]`,
  );
  if (link) {
    const border = link.querySelector<SVGRectElement>("rect.card-border");
    const stroke = border?.getAttribute("stroke") ?? "#2563eb";
    link.style.setProperty("--highlight-shadow", hexToRgba(stroke, 0.55));
    link.classList.add(HIGHLIGHT_CLASS);
    setTimeout(() => {
      link.classList.remove(HIGHLIGHT_CLASS);
      link.style.removeProperty("--highlight-shadow");
    }, HIGHLIGHT_MS);
  }
}

function hexToRgba(hex: string, alpha: number): string {
  // Accept #rgb or #rrggbb; pass through anything else unchanged.
  const m = hex.replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function attachSearchHandlers() {
  buildIndex();
  void getSort; // silence unused if sort isn't read; helps tree-shaking

  const input = document.querySelector<HTMLInputElement>("#tree-search-input");
  const dropdown = document.querySelector<HTMLElement>("#tree-search-dropdown");
  const wrap = document.querySelector<HTMLElement>(".tree-search");
  if (!input || !dropdown || !wrap) return;

  function render(hits: Hit[]) {
    if (!hits.length) {
      dropdown!.classList.add(HIDE_CLASS);
      dropdown!.innerHTML = "";
      return;
    }
    dropdown!.classList.remove(HIDE_CLASS);
    dropdown!.innerHTML = hits
      .map(
        (h) => `
        <button type="button" class="search-hit" data-slug="${escapeHTML(h.slug)}">
          <span class="search-hit-title">${escapeHTML(h.title)}</span>
          ${h.org ? `<span class="search-hit-org">${escapeHTML(h.org)}</span>` : ""}
        </button>
      `,
      )
      .join("");
    dropdown!
      .querySelectorAll<HTMLButtonElement>(".search-hit")
      .forEach((btn, i) => {
        btn.addEventListener("click", () => {
          const slug = btn.getAttribute("data-slug");
          if (!slug) return;
          input!.value = "";
          dropdown!.classList.add(HIDE_CLASS);
          scrollToNode(slug);
          document.dispatchEvent(
            new CustomEvent("ai-tree:select", { detail: { slug } }),
          );
        });
        if (i === 0) btn.classList.add("first-hit");
      });
  }

  input.addEventListener("input", () => render(rank(input.value)));
  input.addEventListener("focus", () => {
    if (input.value) render(rank(input.value));
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      dropdown.classList.add(HIDE_CLASS);
      input.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const first = rank(input.value)[0];
      if (first) {
        input.value = "";
        dropdown.classList.add(HIDE_CLASS);
        scrollToNode(first.slug);
        document.dispatchEvent(
          new CustomEvent("ai-tree:select", { detail: { slug: first.slug } }),
        );
      }
    }
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target as Node)) {
      dropdown.classList.add(HIDE_CLASS);
    }
  });
  // Re-build index after orient/sort swap so future searches still work
  // even if DOM structure changed (it doesn't — same data — but cheap).
}
