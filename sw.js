const CACHE_VERSION = "expense-tracker-v14";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./css/components.css",
  "./js/app.js",
  "./js/router.js",
  "./js/db.js",
  "./js/categories.js",
  "./js/expenses.js",
  "./js/icons.js",
  "./js/rating.js",
  "./js/summary.js",
  "./js/budgets.js",
  "./js/charts.js",
  "./js/exportImport.js",
  "./js/sync.js",
  "./js/syncApi.js",
  "./js/shares.js",
  "./js/shareModal.js",
  "./js/ui.js",
  "./js/expenseModal.js",
  "./js/categoryModal.js",
  "./js/people.js",
  "./js/settlements.js",
  "./js/personModal.js",
  "./js/splitModal.js",
  "./js/split.js",
  "./js/splitUI.js",
  "./js/receipts.js",
  "./js/receiptField.js",
  "./js/receiptViewer.js",
  "./js/settleModal.js",
  "./js/views/home.js",
  "./js/views/records.js",
  "./js/views/ratings.js",
  "./js/views/more.js",
  "./js/views/split.js",
  "./js/packing.js",
  "./js/packingItemModal.js",
  "./js/packingCategoryField.js",
  "./js/trips.js",
  "./js/tripModal.js",
  "./js/tripExpenseModal.js",
  "./js/tripSettleModal.js",
  "./js/views/trips.js",
  "./js/views/trip.js",
  "./js/vendor/chart.umd.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        Promise.all(PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* 同步 API 是另一個網域、而且每次的答案都不一樣，絕對不能進快取——
     快取住 /api/sync/pull 之後，同步就會永遠拿到同一批舊變更。
     非 GET 也一律放行（cache.put 對 POST 本來就會丟例外）。 */
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
