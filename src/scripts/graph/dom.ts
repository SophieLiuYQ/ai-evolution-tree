// DOM helpers — SVG element creation + active-pane lookup.

import type { Orient } from "./state";

export const NS = "http://www.w3.org/2000/svg";

export type ActivePane = {
  orient: Orient;
  edgesGroup: SVGGElement;
  labelsGroup: SVGGElement;
} | null;

export function getActivePane(): ActivePane {
  const visible = document.querySelector<HTMLElement>(
    '.orient-pane:not([style*="display: none"])',
  );
  if (!visible) return null;
  const orient = visible.dataset.orient as Orient;
  const edgesGroup = visible.querySelector<SVGGElement>(".edges");
  const labelsGroup = visible.querySelector<SVGGElement>(".edge-labels");
  if (!edgesGroup || !labelsGroup) return null;
  return { orient, edgesGroup, labelsGroup };
}

export function clearDynamicEdges() {
  document.querySelectorAll<SVGGElement>(".edges, .edge-labels").forEach((g) => {
    while (g.firstChild) g.removeChild(g.firstChild);
  });
}

export function buildPath(
  d: string,
  style: { color: string; dash?: string },
  orient: Orient,
  edgeType: string,
): SVGPathElement {
  const path = document.createElementNS(NS, "path") as SVGPathElement;
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", style.color);
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (style.dash) path.setAttribute("stroke-dasharray", style.dash);
  path.setAttribute("opacity", "0.85");
  path.setAttribute("marker-end", `url(#arrow-${orient}-${edgeType})`);
  return path;
}

export function buildLabel(
  midX: number,
  midY: number,
  style: { color: string; label: string },
): SVGGElement {
  const g = document.createElementNS(NS, "g") as SVGGElement;
  g.setAttribute("transform", `translate(${midX}, ${midY})`);
  const rect = document.createElementNS(NS, "rect");
  rect.setAttribute("x", "-39");
  rect.setAttribute("y", "-9");
  rect.setAttribute("width", "78");
  rect.setAttribute("height", "18");
  rect.setAttribute("rx", "9");
  rect.setAttribute("fill", "white");
  rect.setAttribute("stroke", style.color);
  rect.setAttribute("stroke-width", "1");
  g.appendChild(rect);
  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", "0");
  text.setAttribute("y", "3.5");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "11");
  text.setAttribute("font-family", "ui-monospace, monospace");
  text.setAttribute("fill", style.color);
  text.setAttribute("font-weight", "700");
  text.textContent = style.label;
  g.appendChild(text);
  return g;
}
