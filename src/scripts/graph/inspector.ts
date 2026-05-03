// Right-side inspector panel: click a node to populate a concise model
// brief, related models, and source links without leaving /tree/.

import {
  graphData,
  incoming,
  outgoing,
  getSelected,
  setSelected,
} from "./state";
import { normalizeTitleCasing } from "../../lib/graph/text";

type Bench = { name: string; score: string };
type Relationship = { to: string; type: string; note?: string };
type NodeMeta = {
  slug: string;
  title: string;
  org: string;
  date: string;
  era: string;
  category: string[];
  breakthrough_score: number;
  public_view?: { plain_english?: string };
  relationships?: Relationship[];
  model_spec?: {
    family?: string;
    parameters?: string;
    context_window?: number;
    release_type?: string;
    best_for?: string;
    availability?: string[];
    modalities?: string[];
    modalities_in?: string[];
    modalities_out?: string[];
    benchmarks?: Bench[];
    homepage?: string;
    github?: string;
    aa_url?: string;
    hf_url?: string;
    last_verified_at?: string;
  };
};

const SELECT_EVT = "ai-tree:select";

function activeOrient(): "h" | "v" {
  const sel = document.querySelector<HTMLButtonElement>(
    '.orient-btn[aria-selected="true"]',
  );
  return sel?.dataset.orient === "h" ? "h" : "v";
}

function isCompactMode(): boolean {
  return document.querySelector(".ai-tree-graph")?.classList.contains("compact-mode") ?? false;
}

function fmtDate(iso: string, withDay = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    "en-US",
    withDay
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", year: "numeric" },
  );
}

function fmtCtx(c?: number): string {
  if (!c) return "Unknown";
  return c >= 1_000_000
    ? `${(c / 1_000_000).toFixed(c % 1_000_000 === 0 ? 0 : 1)}M tokens`
    : c >= 1000
      ? `${Math.round(c / 1000).toLocaleString()}k tokens`
      : `${c.toLocaleString()} tokens`;
}

function fmtReleaseType(rt?: string): string {
  switch (rt) {
    case "open_weights":
      return "Open";
    case "api":
      return "API";
    case "product":
      return "Product";
    case "demo":
      return "Demo";
    case "paper":
      return "Paper";
    default:
      return "";
  }
}

function fmtLicense(rt?: string): string {
  if (rt === "open_weights") return "Open weights";
  if (rt === "paper") return "Research only";
  return "Proprietary";
}

function fmtModelType(n: NodeMeta): string {
  const cats = new Set((n.category ?? []).map((c) => c.toLowerCase()));
  if (cats.has("agents")) return "Agent";
  if (cats.has("multimodal")) return "Multimodal";
  if (cats.has("reasoning")) return "Reasoning";
  if (cats.has("code")) return "Coding";
  if (cats.has("video")) return "Video";
  if (cats.has("audio")) return "Audio";
  if (cats.has("cv")) return "Vision";
  if (cats.has("paper")) return "Research";
  return "LLM";
}

function compactName(s?: string): string {
  if (!s) return "Unknown";
  return s
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function setPanelOpen(open: boolean) {
  const panel = document.querySelector<HTMLElement>(".tree-inspector");
  if (!panel) return;
  panel.dataset.open = open ? "true" : "false";
}

function setText(id: string, v: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function setHidden(id: string, hidden: boolean) {
  const el = document.getElementById(id);
  if (el) el.hidden = hidden;
}

function clearList(id: string) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = "";
}

function pickExternalLink(n: NodeMeta): { href: string; label: string } | null {
  const spec = n.model_spec;
  if (!spec) return null;
  if (spec.homepage) return { href: spec.homepage, label: hostname(spec.homepage) };
  if (spec.github) return { href: spec.github, label: "GitHub" };
  if (spec.hf_url) return { href: spec.hf_url, label: "Hugging Face" };
  if (spec.aa_url) return { href: spec.aa_url, label: "Artificial Analysis" };
  return null;
}

function highlightSelected(slug: string | null) {
  document
    .querySelectorAll<HTMLElement>(".node-link.selected-card")
    .forEach((el) => el.classList.remove("selected-card"));
  if (!slug) return;
  const scope = isCompactMode()
    ? document.querySelector<HTMLElement>(".compact-list")
    : document.querySelector<HTMLElement>(
        `.orient-pane[data-orient="${activeOrient()}"]`,
      );
  if (!scope) return;
  const link = scope.querySelector<HTMLElement>(
    `.node-link[data-slug="${slug}"]`,
  );
  if (link) link.classList.add("selected-card");
}

function renderFacts(n: NodeMeta) {
  const facts = document.getElementById("inspector-facts");
  if (!facts) return;
  const spec = n.model_spec;
  const ext = pickExternalLink(n);
  const rows = [
    ["Context Window", fmtCtx(spec?.context_window)],
    ["Parameters", compactName(spec?.parameters)],
    ["Model Type", fmtModelType(n)],
    ["License", fmtLicense(spec?.release_type)],
    [
      "Website",
      ext ? `<a href="${ext.href}" target="_blank" rel="noopener">${ext.label}</a>` : "Unavailable",
    ],
  ];
  facts.innerHTML = rows
    .map(
      ([k, v]) => `<div class="inspector-fact"><dt>${k}</dt><dd>${v}</dd></div>`,
    )
    .join("");
  facts.hidden = false;
}

function renderActions(n: NodeMeta) {
  const open = document.getElementById("inspector-open") as HTMLAnchorElement | null;
  if (open) open.href = `/node/${n.slug}/`;

  const ext = pickExternalLink(n);
  const external = document.getElementById("inspector-external") as HTMLAnchorElement | null;
  if (external) {
    if (ext) {
      external.href = ext.href;
      external.textContent = ext.label;
      external.hidden = false;
    } else {
      external.hidden = true;
    }
  }
  setHidden("inspector-actions", false);
}

function relatedModels(n: NodeMeta, metaBySlug: Record<string, NodeMeta>) {
  const orient = activeOrient();
  const family = n.model_spec?.family;
  const out: string[] = [];
  const seen = new Set<string>([n.slug]);

  const push = (slug: string) => {
    if (!slug || seen.has(slug) || !metaBySlug[slug]) return;
    seen.add(slug);
    out.push(slug);
  };

  for (const slug of incoming()[orient][n.slug] ?? []) push(slug);
  for (const slug of outgoing()[orient][n.slug] ?? []) push(slug);

  if (family) {
    const sameFamily = Object.values(metaBySlug)
      .filter((m) => m.slug !== n.slug && m.model_spec?.family === family)
      .sort(
        (a, b) =>
          Math.abs(new Date(a.date).getTime() - new Date(n.date).getTime()) -
          Math.abs(new Date(b.date).getTime() - new Date(n.date).getTime()),
      );
    for (const m of sameFamily) push(m.slug);
  }

  return out.slice(0, 6);
}

function renderRelated(n: NodeMeta, metaBySlug: Record<string, NodeMeta>) {
  const related = relatedModels(n, metaBySlug);
  const list = document.getElementById("inspector-related");
  const more = document.getElementById("inspector-more-related") as HTMLAnchorElement | null;
  if (!list || !more) return;
  list.innerHTML = "";
  for (const slug of related) {
    const m = metaBySlug[slug];
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `/node/${slug}/`;
    a.textContent = normalizeTitleCasing(m?.title ?? slug);
    const right = document.createElement("span");
    right.className = "right";
    right.textContent = m?.org ?? "";
    li.append(a, right);
    list.appendChild(li);
  }
  more.href = `/node/${n.slug}/`;
  more.hidden = related.length === 0;
  setHidden("inspector-related-section", related.length === 0);
}

function buildInsights(n: NodeMeta): string[] {
  const spec = n.model_spec;
  const out: string[] = [];
  if (spec?.best_for) out.push(spec.best_for);
  if (spec?.context_window) {
    if (spec.context_window >= 1_000_000) out.push("Large context window for long documents and multi-step workflows.");
    else if (spec.context_window >= 128_000) out.push("Long-context capable for larger documents and codebases.");
  }
  if (spec?.release_type === "open_weights") out.push("Open weights: usable outside a hosted API, with your own deployment stack.");
  if (spec?.release_type === "api") out.push("Primarily shipped as a hosted API or managed product surface.");
  if (n.category.includes("reasoning")) out.push("Reasoning-oriented model line with stronger multi-step problem solving focus.");
  if (n.category.includes("multimodal")) out.push("Multimodal model: supports more than text-only workflows.");
  if (!out.length && n.public_view?.plain_english) out.push(n.public_view.plain_english);
  return out.slice(0, 3);
}

function renderInsights(n: NodeMeta) {
  const list = document.getElementById("inspector-insights");
  if (!list) return;
  const items = buildInsights(n);
  list.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  setHidden("inspector-insights-section", items.length === 0);
}

function renderSources(n: NodeMeta) {
  const meta = document.getElementById("inspector-source-meta");
  const links = document.getElementById("inspector-source-links");
  if (!meta || !links) return;
  const spec = n.model_spec;
  const hrefs = [
    spec?.homepage ? { href: spec.homepage, label: "Website" } : null,
    spec?.github ? { href: spec.github, label: "GitHub" } : null,
    spec?.hf_url ? { href: spec.hf_url, label: "Hugging Face" } : null,
    spec?.aa_url ? { href: spec.aa_url, label: "Artificial Analysis" } : null,
  ].filter(Boolean) as { href: string; label: string }[];

  meta.textContent = spec?.last_verified_at
    ? `Last verified: ${fmtDate(spec.last_verified_at, true)}`
    : "Schema-backed model data from this repository.";
  links.innerHTML = hrefs
    .map(
      (link) =>
        `<a href="${link.href}" target="_blank" rel="noopener">${link.label}</a>`,
    )
    .join("");
  setHidden("inspector-sources-section", hrefs.length === 0 && !spec?.last_verified_at);
}

function resetPanel() {
  setText("inspector-title", "Select a node");
  setText("inspector-subtitle", "Open the compact view or click a node in the graph.");
  setText(
    "inspector-desc",
    "Click a node in the graph to explore its summary, model facts, and related lineage.",
  );
  setHidden("inspector-badge", true);
  setHidden("inspector-facts", true);
  setHidden("inspector-actions", true);
  setHidden("inspector-related-section", true);
  setHidden("inspector-insights-section", true);
  setHidden("inspector-sources-section", true);
  clearList("inspector-related");
  clearList("inspector-insights");
  const links = document.getElementById("inspector-source-links");
  if (links) links.innerHTML = "";
  setSelected(null);
  highlightSelected(null);
  setPanelOpen(false);
}

function render(slug: string) {
  let raw: NodeMeta | undefined;
  let metaBySlug: Record<string, NodeMeta> | undefined;
  try {
    raw = graphData().nodes?.[slug] as NodeMeta | undefined;
    metaBySlug = graphData().nodes as Record<string, NodeMeta> | undefined;
  } catch {
    return;
  }
  if (!raw || !metaBySlug) return;

  setText("inspector-title", normalizeTitleCasing(raw.title));
  setText(
    "inspector-subtitle",
    `${raw.org} · Released ${fmtDate(raw.date, true)}`,
  );
  setText(
    "inspector-desc",
    raw.public_view?.plain_english?.trim() || "No summary yet. Open the full page for details.",
  );

  const badge = document.getElementById("inspector-badge");
  const badgeText = fmtReleaseType(raw.model_spec?.release_type);
  if (badge) {
    badge.textContent = badgeText;
    badge.hidden = !badgeText;
  }

  setPanelOpen(true);
  renderFacts(raw);
  renderActions(raw);
  renderRelated(raw, metaBySlug);
  renderInsights(raw);
  renderSources(raw);
  highlightSelected(slug);
}

function handleSelect(slug: string) {
  setSelected(slug);
  render(slug);
}

export function attachInspectorHandlers() {
  const close = document.querySelector<HTMLButtonElement>(".inspector-close");
  close?.addEventListener("click", () => resetPanel());
  close?.addEventListener("pointerup", (e) => {
    e.preventDefault();
    resetPanel();
  });

  document.querySelectorAll<HTMLElement>(".node-link[data-slug]").forEach((link) => {
    let downX = 0;
    let downY = 0;

    link.addEventListener("click", (e) => {
      const slug = link.getAttribute("data-slug");
      if (!slug) return;
      const me = e as MouseEvent;
      const allowNav =
        me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0;
      if (allowNav) return;
      e.preventDefault();
      handleSelect(slug);
    });

    link.addEventListener("pointerdown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    link.addEventListener("pointerup", (e) => {
      const slug = link.getAttribute("data-slug");
      if (!slug) return;
      const allowNav = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
      if (allowNav) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > 4 || dy > 4) return;
      e.preventDefault();
      handleSelect(slug);
    });
  });

  document.addEventListener(SELECT_EVT, (e) => {
    const slug = (e as CustomEvent).detail?.slug as string | undefined;
    if (slug) handleSelect(slug);
  });

  const selected = getSelected();
  if (selected) render(selected);
}
