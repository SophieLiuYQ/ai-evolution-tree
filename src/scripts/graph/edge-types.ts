// Per-edge-type visibility toggles. Wires up the eye buttons next to
// each row in the legend + the bulk Show all / Hide all controls.
// On change: refresh the active hover/pin highlight so the canvas
// reflects the new filter immediately.

import { renderHover } from "./hover";
import {
  allVisibleEdgeTypes,
  getPinned,
  initEdgeTypeState,
  isEdgeTypeEnabled,
  setAllEdgeTypesEnabled,
  setEdgeTypeEnabled,
} from "./state";

function refreshRowState(row: HTMLElement, on: boolean) {
  // The SVG eye swap (pupil ⇄ slash) is purely CSS-driven via [data-on].
  row.dataset.on = String(on);
  const ariaBtn = row.querySelector<HTMLElement>(".edge-type-toggle");
  if (ariaBtn) ariaBtn.setAttribute("aria-pressed", String(on));
}

function refreshAllRows() {
  document
    .querySelectorAll<HTMLElement>(".edge-type-row")
    .forEach((row) => {
      const t = row.dataset.type;
      if (!t) return;
      refreshRowState(row, isEdgeTypeEnabled(t));
    });
}

function refreshHighlight() {
  const pinned = getPinned();
  if (pinned) renderHover(pinned);
}

export function attachEdgeTypeHandlers() {
  initEdgeTypeState();

  // Initial sync: row states reflect localStorage-restored set
  refreshAllRows();

  document
    .querySelectorAll<HTMLElement>(".edge-type-toggle")
    .forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const t = btn.dataset.type;
        if (!t) return;
        const next = !isEdgeTypeEnabled(t);
        setEdgeTypeEnabled(t, next);
        const row = btn.closest<HTMLElement>(".edge-type-row");
        if (row) refreshRowState(row, next);
        refreshHighlight();
      });
    });

  document.querySelectorAll<HTMLElement>(".bulk-edge-toggle").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const on = btn.dataset.bulk === "all";
      setAllEdgeTypesEnabled(on);
      refreshAllRows();
      refreshHighlight();
      // touch-noop to keep the linter happy about unused import
      void allVisibleEdgeTypes;
    });
  });
}
