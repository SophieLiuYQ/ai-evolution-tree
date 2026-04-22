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

// Wrap each attach so one throw doesn't halt the whole init chain
// (which is what bricked buttons in the past — a single broken module
// init blocked every later attachX from running). Errors are logged
// so DevTools console makes it obvious which one failed.
function safe(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error(`[ai-tree:init] ${name} threw:`, err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  safe("initState", initState);
  safe("attachOrientHandlers", attachOrientHandlers);
  safe("attachInteractions", attachInteractions);
  safe("attachZoomHandlers", attachZoomHandlers);
  safe("attachSortHandlers", attachSortHandlers);
  safe("attachEdgeTypeHandlers", attachEdgeTypeHandlers);
  safe("attachNodeTypeHandlers", attachNodeTypeHandlers);
  safe("attachStickyHeaders", attachStickyHeaders);
  safe("attachSearchHandlers", attachSearchHandlers);
  safe("attachCompactHandler", attachCompactHandler);
  safe("scrollToMostRecent (RAF)", () =>
    requestAnimationFrame(scrollToMostRecent),
  );
  window.addEventListener("load", () =>
    safe("scrollToMostRecent (load)", scrollToMostRecent),
  );
});
