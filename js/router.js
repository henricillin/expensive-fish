import { icon } from "./icons.js";

const routes = new Map();
let currentPath = null;

export function registerRoute(path, view) {
  routes.set(path, view);
}

function resolvePath() {
  const hash = location.hash.replace(/^#/, "");
  return routes.has(hash) ? hash : "/home";
}

function renderHeader(view) {
  const titleEl = document.getElementById("app-title");
  const backEl = document.getElementById("app-back");
  if (titleEl) titleEl.textContent = view?.title || "";
  if (!backEl) return;
  if (view?.back) {
    backEl.hidden = false;
    backEl.innerHTML = icon("chevronLeft", { size: 22 });
    backEl.onclick = () => {
      location.hash = view.back;
    };
  } else {
    backEl.hidden = true;
    backEl.onclick = null;
  }
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
  renderHeader(view);
  window.scrollTo(0, 0);

  if (view && typeof view.onShow === "function") {
    await view.onShow();
  }
}

/* 資料被別的地方換掉時（例如同步剛拉回一批變更）拿來重畫目前這一頁。
   走 render() 沒有用——path 沒變它會直接 return。 */
export async function refreshCurrentView() {
  const view = routes.get(currentPath);
  if (view && typeof view.onShow === "function") await view.onShow();
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
