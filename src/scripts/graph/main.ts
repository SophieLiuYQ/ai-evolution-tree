// Entry point for the graph component's client-side runtime.
// Loaded via <script>import "../scripts/graph/main.ts"</script> in Graph.astro.

import { attachCompactHandler } from "./compact";
import { attachEdgeTypeHandlers } from "./edge-types";
import { attachInteractions } from "./hover";
import { attachNodeTypeHandlers } from "./node-types";
import { attachOrientHandlers } from "./orient";
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
});
