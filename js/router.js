const routes = new Map();
let currentPath = null;

export function registerRoute(path, view) {
  routes.set(path, view);
}

function resolvePath() {
  const hash = location.hash.replace(/^#/, "");
  return routes.has(hash) ? hash : "/home";
}

async function render() {
  const path = resolvePath();
  if (path === currentPath) return;
  currentPath = path;

  for (const [p, view] of routes) {
    const el = document.getElementById(view.elementId);
    if (!el) continue;
    el.hidden = p !== path;
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = btn.dataset.route === path;
    btn.setAttribute("aria-current", isActive ? "page" : "false");
  });

  const view = routes.get(path);
  if (view && typeof view.onShow === "function") {
    await view.onShow();
  }
}

export function navigate(path) {
  if (location.hash.replace(/^#/, "") === path) {
    render();
  } else {
    location.hash = path;
  }
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "/home";
  render();
}
