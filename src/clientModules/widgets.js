// Mounts the interactive figures. Runs after each client-side navigation and
// whenever new figure roots appear in the DOM (tab switches, hot reloads,
// React re-mounts), so an empty figure root never stays empty.
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

let scheduled = false;
function mount() {
  scheduled = false;
  if (window.gcWidgetsInit) {
    window.gcWidgetsInit();
    return;
  }
  if (document.getElementById("gc-widgets-script")) return;
  const s = document.createElement("script");
  s.id = "gc-widgets-script";
  // cache-bust per page load so a redeployed or hot-reloaded figure script is never served stale
  s.src = (window.__docusaurus_base || "/gpu-components-docs/") + "js/widgets.js?v=" + Date.now();
  s.async = true;
  document.body.appendChild(s);
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(mount, 0);
}

if (ExecutionEnvironment.canUseDOM) {
  window.__docusaurus_base = "/gpu-components-docs/";
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.(".gc-widget") || n.querySelector?.(".gc-widget")) { schedule(); return; }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function onRouteDidUpdate() {
  if (ExecutionEnvironment.canUseDOM) schedule();
}
