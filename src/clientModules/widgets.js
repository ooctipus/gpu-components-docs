// Mounts the interactive figures after each client-side navigation.
import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

function mount() {
  if (window.gcWidgetsInit) {
    window.gcWidgetsInit();
    return;
  }
  if (document.getElementById("gc-widgets-script")) return;
  const s = document.createElement("script");
  s.id = "gc-widgets-script";
  s.src = (window.__docusaurus_base || "/gpu-components-docs/") + "js/widgets.js";
  s.async = true;
  document.body.appendChild(s);
}

if (ExecutionEnvironment.canUseDOM) {
  window.__docusaurus_base = "/gpu-components-docs/";
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

export function onRouteDidUpdate() {
  if (ExecutionEnvironment.canUseDOM) setTimeout(mount, 0);
}
