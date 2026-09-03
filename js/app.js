import { seedDefaultCategoriesIfEmpty, migrateCategories } from "./categories.js";
import { registerRoute, refreshCurrentView, startRouter } from "./router.js";
import { refreshBadgeOnly } from "./summary.js";
import { icon } from "./icons.js";
import { showToast } from "./ui.js";
import { startAutoSync } from "./sync.js";
import { loadShares } from "./shares.js";
import * as home from "./views/home.js";
import * as records from "./views/records.js";
import * as ratings from "./views/ratings.js";
import * as more from "./views/more.js";
import * as split from "./views/split.js";
import * as trips from "./views/trips.js";
import * as trip from "./views/trip.js";

const TABS = [
  { route: "/home", label: "記一筆", icon: "pencil", dot: "summary-tab-dot" },
  { route: "/records", label: "明細", icon: "list" },
  { route: "/ratings", label: "評分", icon: "star" },
  { route: "/trips", label: "方案", icon: "plane" },
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
  /* 先把外框畫出來，資料庫萬一卡住（例如 App 同時開在另一個分頁）也不會整頁空白。 */
  renderTabbar();
  wireHeaderShadow();

  try {
    await seedDefaultCategoriesIfEmpty();
    await migrateCategories();
    /* 共享方案的名單存在本機，畫面要同步地問「這個方案是不是共享的」，
       所以在畫第一頁之前就要載進記憶體。 */
    await loadShares();
  } catch (err) {
    showToast(err.message || "資料庫打不開");
    console.error(err);
  }

  registerRoute("/home", home);
  registerRoute("/records", records);
  registerRoute("/ratings", ratings);
  registerRoute("/more", more);
  registerRoute("/split", split);
  registerRoute("/trips", trips);
  registerRoute("/trip", trip);

  startRouter();
  refreshBadgeOnly();

  /* 同步拉回東西時，使用者正在看的那一頁要跟著換掉——
     不然剛在別台手機記的帳，這裡要切頁再切回來才看得到。 */
  window.addEventListener("sync:applied", async () => {
    await refreshCurrentView();
    refreshBadgeOnly();
  });
  startAutoSync();

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
