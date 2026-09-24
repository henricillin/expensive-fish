/* 設定值全部從環境變數來，另外支援 server/.env（不想每次 export 一輪）。
   刻意不裝 dotenv：這裡只需要 KEY=VALUE，十幾行就寫得完。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

function loadEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    /* 真的環境變數優先，.env 只是補預設 */
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

function num(name, fallback) {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) ? n : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

const dbPath = process.env.DB_PATH || "./data/sync.db";

export const config = {
  port: num("PORT", 8787),
  host: process.env.HOST || "0.0.0.0",
  /* ":memory:" 給測試用，其他一律解成絕對路徑 */
  dbPath: dbPath === ":memory:" ? dbPath : path.resolve(ROOT, dbPath),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8123,http://127.0.0.1:8123,http://localhost:8124,http://127.0.0.1:8124")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sessionDays: num("SESSION_DAYS", 180),
  disableRegistration: bool("DISABLE_REGISTRATION", false),

  /* 一次 push 最多幾筆、單筆 payload 上限。擋的是手滑或壞掉的 client，
     不是惡意攻擊——正常一次同步幾百筆就到頂了。 */
  maxPushRecords: num("MAX_PUSH_RECORDS", 2000),
  maxPayloadBytes: num("MAX_PAYLOAD_BYTES", 256 * 1024),
  maxPullLimit: num("MAX_PULL_LIMIT", 1000),
  defaultPullLimit: num("DEFAULT_PULL_LIMIT", 500),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "8mb",
};

/* 會被同步的 store。不在這張表上的東西一律拒收——
   收據照片（receipts）是故意排除的，那是 Blob，走 JSON 同步會爆掉。 */
export const COLLECTIONS = Object.freeze([
  "categories",
  "expenses",
  "budgets",
  "people",
  "settlements",
  "trips",
  "tripSettlements",
  "packingItems",
]);

export const COLLECTION_SET = new Set(COLLECTIONS);

/* 共享方案會帶著走的資料，以及「這筆屬於哪個方案」寫在 payload 的哪個欄位。
   trips 是方案本身，它的 uid 就是方案 id，所以值是 null。
   不在這張表上的東西（分類、同伴、預算、一般結清）永遠只屬於自己的帳號。 */
export const SHARED_COLLECTIONS = Object.freeze({
  trips: null,
  packingItems: "listId",
  expenses: "tripId",
  tripSettlements: "tripId",
});

/* 邀請碼：去掉看起來像的 I/O/0/1。32 個字剛好整除 256，取亂數不用擔心偏差。 */
export const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SHARE_CODE_LENGTH = 8;
