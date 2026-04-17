// Entry point for the graph component's client-side runtime.
// Loaded via <script>import "../scripts/graph/main.ts"</script> in Graph.astro.

import { attachInteractions } from "./hover";
import { attachOrientHandlers } from "./orient";
import { attachSortHandlers } from "./sort";
import { initState } from "./state";
import { attachZoomHandlers } from "./zoom";

document.addEventListener("DOMContentLoaded", () => {
  initState();
  attachOrientHandlers();
  attachInteractions();
  attachZoomHandlers();
  attachSortHandlers();
});
