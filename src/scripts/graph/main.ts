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
// Visible on-page banner so we can tell if the script ran at all
// without the user opening DevTools. Auto-hides after 3s once init
// finishes successfully. Bricked imports / CSP blocks the banner from
// appearing → instant signal that the script never executed.
function dbgBanner(msg: string, ok: boolean) {
  let el = document.getElementById("ai-tree-dbg");
  if (!el) {
    el = document.createElement("div");
    el.id = "ai-tree-dbg";
    el.style.cssText =
      "position:fixed;bottom:8px;left:8px;z-index:9999;padding:6px 10px;border-radius:6px;font:11px ui-monospace,Menlo,monospace;background:#fef3c7;color:#78350f;border:1px solid #f59e0b;box-shadow:0 1px 4px rgba(0,0,0,.1);max-width:60vw;";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = ok ? "#dcfce7" : "#fef3c7";
  el.style.color = ok ? "#166534" : "#78350f";
  el.style.borderColor = ok ? "#22c55e" : "#f59e0b";
  if (ok) setTimeout(() => el?.remove(), 3000);
}

function safe(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    console.error(`[ai-tree:init] ${name} threw:`, err);
    dbgBanner(`init failed: ${name} threw — open console for details`, false);
  }
}

// Astro compiles each <script> block as an ES module — modules are
// deferred, so by the time this file runs the document is already
// `interactive` (DOMContentLoaded has fired). Listening for
// DOMContentLoaded here would never fire in Chrome and the entire
// init chain (including the inspector click handler) would silently
// no-op. We instead init immediately, with a one-tick fallback for
// the rare case where the script somehow lands during `loading`.
function initAll() {
  console.log("[ai-tree] initAll() running, readyState =", document.readyState);
  dbgBanner("ai-tree: init running…", false);
  safe("initState", initState);
  safe("attachOrientHandlers", attachOrientHandlers);
  safe("attachInteractions", attachInteractions);
  safe("attachSortHandlers", attachSortHandlers);
  safe("attachEdgeTypeHandlers", attachEdgeTypeHandlers);
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
  dbgBanner("ai-tree: init complete ✓", true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll, { once: true });
} else {
  initAll();
}
