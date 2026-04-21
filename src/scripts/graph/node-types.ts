// Per-node-type visibility toggles. Wires up the eye buttons next to
// each row in the LegendPanel "Node types" section + the bulk Show /
// Hide controls. On change: walks every .node-link, reads its
// `data-cats` attribute, and applies the .node-type-filtered class
// when the card's category set doesn't intersect the enabled set.
//
// Edges are intentionally NOT touched here — fading just the cards
// preserves the lineage skeleton so the user can see WHERE the
// filtered-out models were in the tree, not just blank space.

import {
  initNodeTypeState,
  isNodeTypeEnabled,
  nodePassesFilter,
  setAllNodeTypesEnabled,
  setNodeTypeEnabled,
} from "./state";

const FILTERED_CLASS = "node-type-filtered";

function refreshRowState(row: HTMLElement, on: boolean) {
  row.dataset.on = String(on);
  const btn = row.querySelector<HTMLElement>(".node-type-toggle");
  if (btn) btn.setAttribute("aria-pressed", String(on));
}

function refreshAllRows() {
  document.querySelectorAll<HTMLElement>(".node-type-row").forEach((row) => {
    const t = row.dataset.type;
    if (!t) return;
    refreshRowState(row, isNodeTypeEnabled(t));
  });
}

function applyCardFilter() {
  document.querySelectorAll<HTMLElement>(".node-link[data-cats]").forEach((a) => {
    const cats = (a.dataset.cats ?? "").split(/\s+/).filter(Boolean);
    a.classList.toggle(FILTERED_CLASS, !nodePassesFilter(cats));
  });
}

export function attachNodeTypeHandlers() {
  // Discover all node-type ids from the legend itself (the source of
  // truth — any type listed there is filterable).
  const allTypes = Array.from(
    document.querySelectorAll<HTMLElement>(".node-type-row[data-type]"),
  )
    .map((row) => row.dataset.type)
    .filter((t): t is string => typeof t === "string");

  if (allTypes.length === 0) return; // legend not present (e.g. on detail page)

  initNodeTypeState(allTypes);
  refreshAllRows();
  applyCardFilter();

  document.querySelectorAll<HTMLElement>(".node-type-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const t = btn.dataset.type;
      if (!t) return;
      const next = !isNodeTypeEnabled(t);
      setNodeTypeEnabled(t, next);
      const row = btn.closest<HTMLElement>(".node-type-row");
      if (row) refreshRowState(row, next);
      applyCardFilter();
    });
  });

  document.querySelectorAll<HTMLElement>(".bulk-node-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const on = btn.dataset.bulk === "all";
      setAllNodeTypesEnabled(on);
      refreshAllRows();
      applyCardFilter();
    });
  });
}
