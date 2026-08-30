import { seedDefaultCategoriesIfEmpty } from "./categories.js";
import { registerRoute, startRouter } from "./router.js";
import * as home from "./views/home.js";
import * as records from "./views/records.js";
import * as summary from "./views/summary.js";
import * as more from "./views/more.js";
import * as split from "./views/split.js";

async function init() {
  await seedDefaultCategoriesIfEmpty();

  registerRoute("/home", home);
  registerRoute("/records", records);
  registerRoute("/summary", summary);
  registerRoute("/more", more);
  registerRoute("/split", split);

  startRouter();
  summary.refreshBadgeOnly();

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
