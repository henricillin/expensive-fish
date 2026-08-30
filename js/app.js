import { seedDefaultCategoriesIfEmpty, migrateCategories } from "./categories.js";
import { registerRoute, startRouter } from "./router.js";
import { refreshBadgeOnly } from "./summary.js";
import { icon } from "./icons.js";
import * as home from "./views/home.js";
import * as records from "./views/records.js";
import * as ratings from "./views/ratings.js";
import * as more from "./views/more.js";
import * as split from "./views/split.js";

const TABS = [
  { route: "/home", label: "記一筆", icon: "pencil", dot: "summary-tab-dot" },
  { route: "/records", label: "明細", icon: "list" },
  { route: "/ratings", label: "評分", icon: "star" },
  { route: "/more", label: "更多", icon: "sliders" },
];

function renderTabbar() {
  const bar = document.getElementById("tabbar");
  bar.innerHTML = TABS.map(
    (t) => `<button class="tab-btn" data-route="${t.route}">
      ${icon(t.icon, { size: 22 })}<span>${t.label}</span>
      ${t.dot ? `<span class="tab-dot" id="${t.dot}"></span>` : ""}
    </button>`
  ).join("");
  bar.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route;
      if (location.hash.replace(/^#/, "") === route) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        location.hash = route;
      }
    });
  });
}

function wireHeaderShadow() {
  const header = document.getElementById("app-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

async function init() {
  await seedDefaultCategoriesIfEmpty();
  await migrateCategories();

  renderTabbar();
  wireHeaderShadow();

  registerRoute("/home", home);
  registerRoute("/records", records);
  registerRoute("/ratings", ratings);
  registerRoute("/more", more);
  registerRoute("/split", split);

  startRouter();
  refreshBadgeOnly();

  if ("serviceWorker" in navigator) {
    const register = () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("Service worker registration failed", err);
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
    }
  }
}

init();
