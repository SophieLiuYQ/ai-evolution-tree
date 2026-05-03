// Entry point for the graph component's client-side runtime.
// Loaded via <script>import "../scripts/graph/main.ts"</script> in Graph.astro.

import { attachCompactHandler } from "./compact";
import { attachEdgeTypeHandlers } from "./edge-types";
import { attachInteractions } from "./hover";
import { attachNodeTypeHandlers } from "./node-types";
import { attachOrientHandlers } from "./orient";
import { scrollToMostRecent } from "./scroll-latest";
import { attachSearchHandlers } from "./search";
import { attachInspectorHandlers } from "./inspector";
import { attachSortHandlers } from "./sort";
import { initState } from "./state";
import { attachStickyHeaders } from "./sticky";

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

// Astro compiles each <script> block as an ES module — modules are
// deferred, so by the time this file runs the document is already
// `interactive` (DOMContentLoaded has fired). Listening for
// DOMContentLoaded here would never fire and the entire init chain
// would silently no-op. We instead init immediately, with a one-tick
// fallback for the rare case where the script lands during `loading`.
function initAll() {
  safe("initState", initState);
  safe("attachOrientHandlers", attachOrientHandlers);
  // Disabled (2026-05-03): hover-lineage / pin-path highlight interaction.
  // safe("attachInteractions", attachInteractions);
  safe("attachSortHandlers", attachSortHandlers);
  // Disabled (2026-05-03): edge-types per-row + bulk show/hide toggles.
  // safe("attachEdgeTypeHandlers", attachEdgeTypeHandlers);
  safe("attachNodeTypeHandlers", attachNodeTypeHandlers);
  safe("attachStickyHeaders", attachStickyHeaders);
  safe("attachSearchHandlers", attachSearchHandlers);
  safe("attachInspectorHandlers", attachInspectorHandlers);
  safe("attachCompactHandler", attachCompactHandler);
  safe("scrollToMostRecent (RAF)", () =>
    requestAnimationFrame(scrollToMostRecent),
  );
  window.addEventListener("load", () =>
    safe("scrollToMostRecent (load)", scrollToMostRecent),
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll, { once: true });
} else {
  initAll();
}
