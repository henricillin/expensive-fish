import express from "express";
import { COLLECTIONS, config } from "./config.js";
import { deleteExpiredSessions } from "./auth.js";
import { authRoutes } from "./routes/auth.js";
import { syncRoutes, syncLimits } from "./routes/sync.js";

/* 只有幾個固定來源要放行，用不到 cors 套件。 */
function cors(req, res, next) {
  const origin = req.get("origin");
  const allowAll = config.corsOrigins.includes("*");
  if (origin && (allowAll || config.corsOrigins.includes(origin))) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.set("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

export function createApp(db) {
  const app = express();

  /* 放在反向代理後面時，req.ip 才會是真的來源（節流用得到）。 */
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  app.use(cors);
  app.use(express.json({ limit: config.jsonBodyLimit }));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      collections: COLLECTIONS,
      limits: syncLimits,
      registrationOpen: !config.disableRegistration,
    });
  });

  app.use("/api/auth", authRoutes(db));
  app.use("/api/sync", syncRoutes(db));

  app.use((req, res) => {
    res.status(404).json({ error: "not_found", message: "沒有這條路徑" });
  });

  app.use((err, req, res, next) => {
    /* body-parser 對壞掉的 JSON 或超過上限的 body 丟的錯 */
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "payload_too_large", message: "資料太大，請分批同步" });
    }
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid_json", message: "request body 不是有效的 JSON" });
    }
    console.error("[error]", err);
    res.status(500).json({ error: "internal_error", message: "伺服器出錯了" });
  });

  return app;
}

/* 過期的 session 沒人清就會一直躺在資料庫裡。開機掃一次，之後每天一次。 */
export function startSessionCleanup(db, intervalMs = 24 * 60 * 60 * 1000) {
  deleteExpiredSessions(db);
  const timer = setInterval(() => deleteExpiredSessions(db), intervalMs);
  timer.unref();
  return timer;
}
