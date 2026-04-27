// Right-side inspector panel: click a node to populate summary,
// benchmarks, and lineage without leaving /tree/.

import {
  graphData,
  incoming,
  outgoing,
  getSelected,
  setSelected,
  type Orient,
} from "./state";
import { normalizeTitleCasing } from "../../lib/graph/text";

// Compact context-window formatter — "128k" / "1M" instead of raw
// "128,000 ctx". The label "Context" already provides units context.
function fmtCtxCompact(c: number): string {
  if (c >= 1_000_000) return `${Math.round(c / 1_000_000)}M`;
  if (c >= 1000) return `${Math.round(c / 1000)}k`;
  return `${c}`;
}

type Bench = { name: string; score: string };
type NodeMeta = {
  slug: string;
  title: string;
  org: string;
  date: string;
  era: string;
  category: string[];
  breakthrough_score: number;
  public_view?: { plain_english?: string };
  model_spec?: {
    parameters?: string;
    context_window?: number;
    release_type?: string;
    availability?: string[];
    modalities?: string[];
    modalities_in?: string[];
    modalities_out?: string[];
    benchmarks?: Bench[];
  };
};

const SELECT_EVT = "ai-tree:select";

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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function scoreMax(b: Bench): number | null {
  // Accept "56.1%", "60.6% (51.0–60.6%)", "12.00", etc.
  const nums = String(b.score ?? "").match(/-?\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const parsed = nums.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (!parsed.length) return null;
  return Math.max(...parsed);
}

function pickBestByName(
  bs: Bench[],
  match: (name: string) => boolean,
): Bench | null {
  let best: Bench | null = null;
  let bestVal = -Infinity;
  for (const b of bs) {
    if (!match(String(b.name ?? ""))) continue;
    const v = scoreMax(b);
    if (v == null) continue;
    if (v > bestVal) {
      bestVal = v;
      best = b;
    }
  }
  return best;
}

function pickFirstByName(
  bs: Bench[],
  match: (name: string) => boolean,
): Bench | null {
  for (const b of bs) {
    if (match(String(b.name ?? ""))) return b;
  }
  return null;
}

function pickKeyBenchmarks(n: NodeMeta): Bench[] {
  const bs = n.model_spec?.benchmarks ?? [];
  if (!bs.length) return [];
  const isMeaningful = (b: Bench) => {
    const s = String(b.score ?? "").trim();
    if (!s || s === "—") return false;
    if (s === "0" || s === "0.0" || s === "0.00" || s === "0%") return false;
    if (/\$0\.00 in\s*\/\s*\$0\.00 out/i.test(s)) return false;
    return true;
  };
  const filtered = bs.filter(isMeaningful);
  if (!filtered.length) return [];

  const out: Bench[] = [];
  const nameHas = (needle: string) => (name: string) =>
    name.toLowerCase().includes(needle.toLowerCase());

  // Always show (when present): AA Intelligence + Speed + Price.
  const aa = pickBestByName(filtered, nameHas("aa intelligence index"));
  if (aa) out.push(aa);

  const speed = pickBestByName(filtered, nameHas("output tok/s"));
  if (speed) out.push(speed);

  const price = pickFirstByName(filtered, nameHas("price ($/m tokens)"));
  if (price) out.push(price);

  // Pick exactly ONE task benchmark, depending on node type.
  const cats = new Set((n.category ?? []).map((c) => String(c).toLowerCase()));
  const taskCandidates =
    cats.has("agents")
      ? ["terminal-bench hard", "terminal-bench"]
      : cats.has("code")
        ? ["scicode", "swe-bench", "humaneval"]
        : cats.has("multimodal") || cats.has("cv") || cats.has("video")
          ? ["mmmu"]
          : cats.has("reasoning")
            ? ["gpqa diamond", "gpqa", "mmlu-pro", "mmlu pro", "hle"]
            : ["mmlu-pro", "mmlu pro", "mmlu", "gpqa"];

  const already = new Set(out.map((b) => b.name.toLowerCase()));
  let task: Bench | null = null;
  for (const cand of taskCandidates) {
    task = pickBestByName(filtered, nameHas(cand));
    if (task && !already.has(task.name.toLowerCase())) break;
    task = null;
  }
  if (task) out.push(task);

  // If we still have nothing (rare), fallback to any one meaningful bench.
  if (!out.length) out.push(filtered[0]);

  // Ensure order + cap at 4 rows.
  return out.slice(0, 4);
}

function nodeUrl(slug: string) {
  return `/node/${slug}/`;
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

function renderBenchmarks(n: NodeMeta) {
  const list = document.getElementById("inspector-bench");
  if (!list) return;
  list.innerHTML = "";
  const keys = pickKeyBenchmarks(n);
  for (const b of keys) {
    const li = document.createElement("li");
    const left = document.createElement("a");
    left.href = nodeUrl(n.slug);
    left.textContent = b.name;
    const right = document.createElement("span");
    right.className = "right";
    right.textContent = b.score;
    li.append(left, right);
    list.appendChild(li);
  }
  setHidden("inspector-bench-section", keys.length === 0);
}

function renderLineage(n: NodeMeta, metaBySlug: Record<string, NodeMeta>) {
  const orient = activeOrient();
  if (!orient) return;
  const inc = incoming()[orient][n.slug] ?? [];
  const out = outgoing()[orient][n.slug] ?? [];

  const parentsEl = document.getElementById("inspector-parents");
  const childrenEl = document.getElementById("inspector-children");
  if (!parentsEl || !childrenEl) return;

  parentsEl.innerHTML = "";
  childrenEl.innerHTML = "";

  function addRow(target: HTMLElement, slug: string) {
    const m = metaBySlug[slug];
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = nodeUrl(slug);
    a.textContent = m?.title ?? slug;
    const right = document.createElement("span");
    right.className = "right";
    right.textContent = m?.date ? fmtDate(m.date) : "";
    li.append(a, right);
    target.appendChild(li);
  }

  inc.forEach((s) => addRow(parentsEl, s));
  out.forEach((s) => addRow(childrenEl, s));

  setHidden(
    "inspector-lineage-section",
    inc.length === 0 && out.length === 0,
  );
}

function renderMeta(n: NodeMeta) {
  const meta = document.getElementById("inspector-meta");
  if (!meta) return;
  const ctx = n.model_spec?.context_window
    ? fmtCtxCompact(n.model_spec.context_window)
    : null;

  const availability = (() => {
    const avail = n.model_spec?.availability;
    if (Array.isArray(avail) && avail.length) return avail;
    const rt = n.model_spec?.release_type;
    return rt ? [rt] : null;
  })();

  const formatAvail = (v: string) => {
    switch (v) {
      case "api":
        return "API";
      case "product":
        return "Product";
      case "open_weights":
        return "Open weights";
      case "research":
        return "Research";
      case "demo":
        return "Demo";
      case "enterprise":
        return "Enterprise";
      case "paper":
        return "Paper";
      default:
        return v.replace(/_/g, " ");
    }
  };

  const availText = availability?.length
    ? availability.map(formatAvail).join(", ")
    : "—";

  const fmtMod = (m: string) => m.toLowerCase().replace(/_/g, " ");
  const inMods = (() => {
    const v = n.model_spec?.modalities_in;
    if (Array.isArray(v) && v.length) return v.map(fmtMod).join(", ");
    const mods = n.model_spec?.modalities;
    if (Array.isArray(mods) && mods.length) return mods.map(fmtMod).join(", ");
    return "—";
  })();
  const outMods = (() => {
    const v = n.model_spec?.modalities_out;
    if (Array.isArray(v) && v.length) return v.map(fmtMod).join(", ");
    const mods = n.model_spec?.modalities;
    if (Array.isArray(mods) && mods.length) return mods.map(fmtMod).join(", ");
    return "—";
  })();

  const CAP_LABELS: Record<string, string> = {
    agents: "Agent",
    multimodal: "Multimodal",
    reasoning: "Reasoning",
    generative: "Generative",
    code: "Coding",
    cv: "Vision",
    audio: "Audio",
    video: "Video",
    nlp: "Text / NLP",
    world_model: "World model",
    paper: "Paper",
  };
  const caps = Array.isArray(n.category) && n.category.length
    ? n.category.map((c: string) => CAP_LABELS[c] ?? c).join(", ")
    : "—";
  meta.innerHTML = [
    `<div><strong>Released</strong> ${fmtDate(n.date)}</div>`,
    ctx ? `<div><strong>Context</strong> ${ctx}</div>` : "",
    `<div><strong>Available as</strong> ${availText}</div>`,
    `<div><strong>Modality input</strong> ${inMods}</div>`,
    `<div><strong>Modality output</strong> ${outMods}</div>`,
    `<div><strong>Capabilities</strong> ${caps}</div>`,
  ]
    .filter(Boolean)
    .join("");
  meta.hidden = false;
}

function highlightSelected(slug: string | null) {
  document
    .querySelectorAll<HTMLElement>(".node-link.selected-card")
    .forEach((el) => el.classList.remove("selected-card"));
  if (!slug) return;
  const pane = activePaneEl();
  if (!pane) return;
  const link = pane.querySelector<HTMLElement>(
    `.node-link[data-slug="${slug}"]`,
  );
  if (link) link.classList.add("selected-card");
}

function wireInspectorButtons(slug: string) {
  const open = document.getElementById("inspector-open") as HTMLAnchorElement | null;
  if (open) open.href = nodeUrl(slug);

  const benchLink = document.getElementById("inspector-bench-link") as HTMLAnchorElement | null;
  if (benchLink) {
    benchLink.href = nodeUrl(slug);
    benchLink.hidden = false;
  }
}

function setPanelOpen(open: boolean) {
  const panel = document.querySelector<HTMLElement>(".tree-inspector");
  if (!panel) return;
  panel.dataset.open = open ? "true" : "false";
}

function render(slug: string) {
  const raw = graphData().nodes?.[slug] as NodeMeta | undefined;
  const metaBySlug = graphData().nodes as Record<string, NodeMeta> | undefined;
  if (!raw || !metaBySlug) return;

  setText("inspector-org", raw.org);
  setText("inspector-title", normalizeTitleCasing(raw.title));
  renderMeta(raw);

  const desc = raw.public_view?.plain_english?.trim() ?? "";
  setText(
    "inspector-desc",
    desc || "No summary yet. Open the full page for details.",
  );

  renderBenchmarks(raw);
  renderLineage(raw, metaBySlug);
  wireInspectorButtons(slug);
  setHidden("inspector-footer", false);
  setPanelOpen(true);
  highlightSelected(slug);
}

function handleSelect(slug: string) {
  setSelected(slug);
  render(slug);
}

export function attachInspectorHandlers() {
  // Close button just collapses the panel content (keeps selection).
  const close = document.querySelector<HTMLButtonElement>(".inspector-close");
  close?.addEventListener("click", () => setPanelOpen(false));

  // Node click → select (but keep ctrl/cmd-click for navigation).
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.(".pin-btn")) return;
    const link = t?.closest?.(".node-link") as HTMLElement | null;
    if (!link) return;
    const slug = link.getAttribute("data-slug");
    if (!slug) return;
    const me = e as MouseEvent;
    const allowNav = me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0;
    if (!allowNav) e.preventDefault();
    handleSelect(slug);
  });

  // Other modules (search, etc.) can request selection.
  document.addEventListener(SELECT_EVT, (e) => {
    const slug = (e as CustomEvent).detail?.slug as string | undefined;
    if (slug) handleSelect(slug);
  });

  // Restore last selection (useful after hot reload).
  const s = getSelected();
  if (s) render(s);
}
