// Entry point for the graph component's client-side runtime.
// Loaded via <script>import "../scripts/graph/main.ts"</script> in Graph.astro.

import { attachCompactHandler } from "./compact";
import { attachEdgeTypeHandlers } from "./edge-types";
import { attachInteractions } from "./hover";
import { attachNodeTypeHandlers } from "./node-types";
import { attachOrientHandlers } from "./orient";
import { scrollToMostRecent } from "./scroll-latest";
import { attachSearchHandlers } from "./search";
import { attachSortHandlers } from "./sort";
import { initState } from "./state";
import { attachStickyHeaders } from "./sticky";
import { attachZoomHandlers } from "./zoom";

document.addEventListener("DOMContentLoaded", () => {
  initState();
  attachOrientHandlers();
  attachInteractions();
  attachZoomHandlers();
  attachSortHandlers();
  attachEdgeTypeHandlers();
  attachNodeTypeHandlers();
  attachStickyHeaders();
  attachSearchHandlers();
  attachCompactHandler();
  // Anchor the initial viewport to the most recent year. setOrient
  // already does an end-scroll on load, but at DOMContentLoaded the
  // SVG's intrinsic scrollHeight isn't always settled (CSS / fonts
  // still landing). Re-scroll after the next paint frame, and again
  // on window load, to make sure we end up at "today" reliably.
  requestAnimationFrame(scrollToMostRecent);
  window.addEventListener("load", () => scrollToMostRecent());
});
