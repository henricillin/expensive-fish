/* 帳號與登入權杖。刻意只用 node:crypto：
   - 密碼走 scrypt（Node 內建、記憶體硬，不用 bcrypt 那種原生相依）
   - 權杖是 32 bytes 亂數，資料庫只存 sha256，所以外洩也沒辦法反推回去 */
import crypto from "node:crypto";
import { config } from "./config.js";

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;

export const MIN_PASSWORD_LENGTH = 8;

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return ["scrypt", SCRYPT_N, SCRYPT_r, SCRYPT_p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function createSession(db, userId, deviceName) {
  const token = newToken();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, device_name, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    hashToken(token),
    userId,
    String(deviceName || "").slice(0, 60),
    now,
    now,
    now + config.sessionDays * 24 * 60 * 60 * 1000
  );
  return { token, expiresAt: now + config.sessionDays * 24 * 60 * 60 * 1000 };
}

export function deleteExpiredSessions(db) {
  return db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(Date.now()).changes;
}

/* Authorization: Bearer <token>。認過就把 user 和 session 掛在 req 上。 */
export function requireAuth(db) {
  const findSession = db.prepare(
    `SELECT s.token_hash, s.user_id, s.device_name, s.expires_at, u.email, u.cursor
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  );
  const touch = db.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`);

  return function auth(req, res, next) {
    const header = req.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
      return res.status(401).json({ error: "unauthorized", message: "請先登入" });
    }
    const tokenHash = hashToken(match[1]);
    const session = findSession.get(tokenHash);
    if (!session) {
      return res.status(401).json({ error: "unauthorized", message: "登入資訊無效，請重新登入" });
    }
    if (session.expires_at < Date.now()) {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
      return res.status(401).json({ error: "session_expired", message: "登入已過期，請重新登入" });
    }
    /* 每分鐘最多寫一次，不然每個 request 都在 UPDATE。 */
    if (Date.now() - session.last_seen_at > 60_000) touch.run(Date.now(), tokenHash);

    req.user = { id: session.user_id, email: session.email, cursor: session.cursor };
    req.session = { tokenHash, deviceName: session.device_name };
    next();
  };
}

/* 登入／註冊的節流。放在記憶體就好——重開就清空是可以接受的，
   這台伺服器本來就只服務自己跟家人。 */
export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20 } = {}) {
  const hits = new Map();
  return function limit(req, res, next) {
    const key = `${req.ip}|${normalizeEmail(req.body?.email)}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: "too_many_requests", message: "嘗試次數太多，請稍後再試" });
    }
    list.push(now);
    hits.set(key, list);
    /* 順手清掉沒人再碰的 key，免得 Map 一直長大 */
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    next();
  };
}
