// Card-visibility filters: Node types + License. Both dimensions are
// AND-ed — a card must pass BOTH to be shown. Hidden cards get
// .card-filtered (display: none, see Card.astro CSS).
//
// Edges are intentionally NOT touched here — fading just the cards
// preserves the lineage skeleton so the user can still hover a visible
// card and see its full ancestor lineage even when some intermediate
// nodes are filtered out (the arrow draws to where the hidden card
// would have been).

import {
  initLicenseState,
  initNodeTypeState,
  isLicenseEnabled,
  isNodeTypeEnabled,
  nodePassesFilter,
  nodePassesLicenseFilter,
  setAllNodeTypesEnabled,
  setLicenseEnabled,
  setNodeTypeEnabled,
} from "./state";

const FILTERED_CLASS = "card-filtered";

function refreshTypeRow(row: HTMLElement, on: boolean) {
  row.dataset.on = String(on);
  const btn = row.querySelector<HTMLElement>(".node-type-toggle");
  if (btn) btn.setAttribute("aria-pressed", String(on));
}

function refreshLicenseRow(row: HTMLElement, on: boolean) {
  row.dataset.on = String(on);
  const btn = row.querySelector<HTMLElement>(".license-toggle");
  if (btn) btn.setAttribute("aria-pressed", String(on));
}

function refreshAllTypeRows() {
  document.querySelectorAll<HTMLElement>(".node-type-row").forEach((row) => {
    const t = row.dataset.type;
    if (!t) return;
    refreshTypeRow(row, isNodeTypeEnabled(t));
  });
}

function refreshAllLicenseRows() {
  document.querySelectorAll<HTMLElement>(".license-row").forEach((row) => {
    const k = row.dataset.license;
    if (!k) return;
    refreshLicenseRow(row, isLicenseEnabled(k));
  });
}

function applyCardFilter() {
  document.querySelectorAll<HTMLElement>(".node-link[data-cats]").forEach((a) => {
    const cats = (a.dataset.cats ?? "").split(/\s+/).filter(Boolean);
    const license = a.dataset.license ?? "open";
    const hide = !nodePassesFilter(cats) || !nodePassesLicenseFilter(license);
    a.classList.toggle(FILTERED_CLASS, hide);
  });
}

export function attachNodeTypeHandlers() {
  // ===== Node-type filter =====
  const allTypes = Array.from(
    document.querySelectorAll<HTMLElement>(".node-type-row[data-type]"),
  )
    .map((row) => row.dataset.type)
    .filter((t): t is string => typeof t === "string");

  if (allTypes.length === 0) return; // legend not present

  initNodeTypeState(allTypes);
  refreshAllTypeRows();

  document.querySelectorAll<HTMLElement>(".node-type-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const t = btn.dataset.type;
      if (!t) return;
      const next = !isNodeTypeEnabled(t);
      setNodeTypeEnabled(t, next);
      const row = btn.closest<HTMLElement>(".node-type-row");
      if (row) refreshTypeRow(row, next);
      applyCardFilter();
    });
  });

  document.querySelectorAll<HTMLElement>(".bulk-node-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const on = btn.dataset.bulk === "all";
      setAllNodeTypesEnabled(on);
      refreshAllTypeRows();
      applyCardFilter();
    });
  });

  // ===== License filter =====
  const allLicenses = Array.from(
    document.querySelectorAll<HTMLElement>(".license-row[data-license]"),
  )
    .map((row) => row.dataset.license)
    .filter((k): k is string => typeof k === "string");

  initLicenseState(allLicenses);
  refreshAllLicenseRows();

  document.querySelectorAll<HTMLElement>(".license-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const k = btn.dataset.license;
      if (!k) return;
      const next = !isLicenseEnabled(k);
      setLicenseEnabled(k, next);
      const row = btn.closest<HTMLElement>(".license-row");
      if (row) refreshLicenseRow(row, next);
      applyCardFilter();
    });
  });

  // Apply once both filter dimensions have initialized
  applyCardFilter();
}
