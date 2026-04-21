// Sticky axis headers — keep year + cross-axis labels visible at the
// edge of the viewport when the user scrolls within the pane.
//
// Two header strips per pane (when applicable):
//   .bands-header  → year axis (LEFT in v / TOP in h)
//                    sticky on the PERPENDICULAR scroll
//   .cross-bands   → company/license axis, only in byOrg/byLicense modes
//                    (TOP in v / LEFT in h)
//                    sticky on the OTHER perpendicular scroll
//
// In SVG, applying transform="translate(scrollOffset, 0)" to a group
// shifts it back by exactly the amount the pane scrolled — making it
// appear pinned. Both groups are rendered LAST in the SVG so they
// overlay the cards/edges as they slide into view.

export function attachStickyHeaders() {
  document.querySelectorAll<HTMLElement>(".orient-pane").forEach((pane) => {
    const orient = pane.dataset.orient;
    const bandsHeader = pane.querySelector<SVGGElement>(".bands-header");
    const crossBands = pane.querySelector<SVGGElement>(".cross-bands");

    const update = () => {
      // bands-header (year axis) — sticks on the axis perpendicular to year:
      //   v: year is on rows → stick to LEFT (translate by scrollLeft)
      //   h: year is on cols → stick to TOP  (translate by scrollTop)
      if (bandsHeader) {
        if (orient === "v") {
          bandsHeader.setAttribute(
            "transform",
            `translate(${pane.scrollLeft} 0)`,
          );
        } else {
          bandsHeader.setAttribute(
            "transform",
            `translate(0 ${pane.scrollTop})`,
          );
        }
      }
      // cross-bands (company/type axis) — sticks on the OTHER perpendicular:
      //   v: cross is on cols → stick to TOP  (translate by scrollTop)
      //   h: cross is on rows → stick to LEFT (translate by scrollLeft)
      if (crossBands) {
        if (orient === "v") {
          crossBands.setAttribute(
            "transform",
            `translate(0 ${pane.scrollTop})`,
          );
        } else {
          crossBands.setAttribute(
            "transform",
            `translate(${pane.scrollLeft} 0)`,
          );
        }
      }
    };

    update();
    pane.addEventListener("scroll", update, { passive: true });
  });
}
