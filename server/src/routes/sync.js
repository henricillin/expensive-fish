import express from "express";
import { COLLECTIONS, config } from "../config.js";
import { requireAuth } from "../auth.js";
import { ValidationError, createStore } from "../store.js";

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function syncRoutes(db) {
  const router = express.Router();
  const auth = requireAuth(db);
  const store = createStore(db);

  router.use(auth);

  /* 拉：只回 version 比 since 大的變更。hasMore 為 true 就把回來的 cursor
     再丟進 since 拉下一頁，直到 false 為止。 */
  router.get(
    "/pull",
    a(async (req, res) => {
      const since = Number(req.query.since ?? 0);
      if (!Number.isFinite(since) || since < 0) {
        return res.status(400).json({ error: "invalid_since", message: "since 必須是非負整數" });
      }
      const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
      res.json(store.pull(req.user.id, since, limit));
    })
  );

  /* 推：整批一個 transaction。每筆會回 applied / stale / unchanged，
     stale 代表伺服器上那份比較新，順便附上贏的那份讓 client 蓋回去。 */
  router.post(
    "/push",
    a(async (req, res) => {
      const { cursor, results } = store.push(req.user.id, req.body?.changes);
      const applied = results.filter((r) => r.status === "applied").length;
      const stale = results.filter((r) => r.status === "stale").length;
      res.json({ cursor, applied, stale, results });
    })
  );

  router.get(
    "/status",
    a(async (req, res) => {
      res.json({ ...store.status(req.user.id), collections_supported: COLLECTIONS });
    })
  );

  /* 清空雲端資料。裝置上的資料不會動——這支只管伺服器這一份。
     故意要求帶 confirm，避免手滑一個 DELETE 就清光。 */
  router.delete(
    "/data",
    a(async (req, res) => {
      if (req.query.confirm !== "yes") {
        return res.status(400).json({
          error: "confirm_required",
          message: "要清空雲端資料請帶上 ?confirm=yes",
        });
      }
      res.json(store.wipe(req.user.id));
    })
  );

  /* 送出去的驗證錯誤（格式壞掉、單筆太大…）一律 400，訊息直接給使用者看。 */
  router.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(400).json({ error: "invalid_change", message: err.message, details: err.details });
    }
    next(err);
  });

  return router;
}

export const syncLimits = {
  maxPushRecords: config.maxPushRecords,
  maxPayloadBytes: config.maxPayloadBytes,
  maxPullLimit: config.maxPullLimit,
};
