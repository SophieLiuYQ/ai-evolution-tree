// Card-visibility filters: Node types + License + Company. All three
// dimensions are AND-ed — a card must pass ALL THREE to be shown.
// Hidden cards get .card-filtered (display: none, see Card.astro CSS).
//
// Edges are intentionally NOT touched here — fading just the cards
// preserves the lineage skeleton so the user can still hover a visible
// card and see its full ancestor lineage even when some intermediate
// nodes are filtered out (the arrow draws to where the hidden card
// would have been).

import { scrollToMostRecent } from "./scroll-latest";
import {
  initLicenseState,
  initNodeTypeState,
  initOrgState,
  isLicenseEnabled,
  isNodeTypeEnabled,
  isOrgEnabled,
  nodePassesFilter,
  nodePassesLicenseFilter,
  nodePassesOrgFilter,
  setAllNodeTypesEnabled,
  setAllOrgsEnabled,
  setLicenseEnabled,
  setNodeTypeEnabled,
  setOrgEnabled,
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

function refreshOrgRow(row: HTMLElement, on: boolean) {
  row.dataset.on = String(on);
  const btn = row.querySelector<HTMLElement>(".org-toggle");
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

function refreshAllOrgRows() {
  document.querySelectorAll<HTMLElement>(".org-row").forEach((row) => {
    const o = row.dataset.org;
    if (!o) return;
    refreshOrgRow(row, isOrgEnabled(o));
  });
}

function applyCardFilter() {
  document.querySelectorAll<HTMLElement>(".node-link[data-cats]").forEach((a) => {
    const cats = (a.dataset.cats ?? "").split(/\s+/).filter(Boolean);
    const license = a.dataset.license ?? "open";
    const org = a.dataset.org ?? "";
    const hide =
      !nodePassesFilter(cats) ||
      !nodePassesLicenseFilter(license) ||
      !nodePassesOrgFilter(org);
    a.classList.toggle(FILTERED_CLASS, hide);
  });
  // The user wants the most-recent-date edge to stay anchored as they
  // flip filters — if they narrow to "Anthropic only", we still show
  // Claude Opus 4.7 (2026), not drop them back at the Perceptron (1957).
  scrollToMostRecent();
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

  // ===== Org / Company filter =====
  const allOrgs = Array.from(
    document.querySelectorAll<HTMLElement>(".org-row[data-org]"),
  )
    .map((row) => row.dataset.org)
    .filter((o): o is string => typeof o === "string");

  initOrgState(allOrgs);
  refreshAllOrgRows();

  document.querySelectorAll<HTMLElement>(".org-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const o = btn.dataset.org;
      if (!o) return;
      const next = !isOrgEnabled(o);
      setOrgEnabled(o, next);
      const row = btn.closest<HTMLElement>(".org-row");
      if (row) refreshOrgRow(row, next);
      applyCardFilter();
    });
  });

  document.querySelectorAll<HTMLElement>(".bulk-org-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const on = btn.dataset.bulk === "all";
      setAllOrgsEnabled(on);
      refreshAllOrgRows();
      applyCardFilter();
    });
  });

  // Apply once all three filter dimensions have initialized
  applyCardFilter();
}
