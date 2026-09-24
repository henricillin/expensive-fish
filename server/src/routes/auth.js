import express from "express";
import { config } from "../config.js";
import { transaction } from "../db.js";
import {
  MIN_PASSWORD_LENGTH,
  createRateLimiter,
  createSession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  requireAuth,
  verifyPassword,
} from "../auth.js";

/* Express 4 不會接住 async handler 丟出來的錯，包一層轉給 error middleware。 */
const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function authRoutes(db) {
  const router = express.Router();
  const auth = requireAuth(db);
  const limit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

  function readCredentials(req) {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    return { email, password, deviceName: String(req.body?.deviceName ?? "") };
  }

  router.post(
    "/register",
    limit,
    a(async (req, res) => {
      if (config.disableRegistration) {
        return res.status(403).json({ error: "registration_disabled", message: "這台伺服器已關閉註冊" });
      }
      const { email, password, deviceName } = readCredentials(req);
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: "invalid_email", message: "Email 格式不正確" });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res
          .status(400)
          .json({ error: "weak_password", message: `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字` });
      }
      if (db.prepare(`SELECT 1 FROM users WHERE email = ?`).get(email)) {
        return res.status(409).json({ error: "email_taken", message: "這個 Email 已經註冊過了" });
      }

      const passwordHash = await hashPassword(password);
      const info = db
        .prepare(`INSERT INTO users (email, password_hash, cursor, created_at) VALUES (?, ?, 0, ?)`)
        .run(email, passwordHash, Date.now());

      const { token, expiresAt } = createSession(db, info.lastInsertRowid, deviceName);
      res.status(201).json({ token, expiresAt, user: { email }, cursor: 0 });
    })
  );

  router.post(
    "/login",
    limit,
    a(async (req, res) => {
      const { email, password, deviceName } = readCredentials(req);
      const user = db.prepare(`SELECT id, email, password_hash, cursor FROM users WHERE email = ?`).get(email);

      /* 帳號不存在也照樣算一次雜湊，不然回應快慢就等於在說「這個 Email 沒註冊過」。 */
      const ok = user
        ? await verifyPassword(password, user.password_hash)
        : await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
      if (!user || !ok) {
        return res.status(401).json({ error: "invalid_credentials", message: "Email 或密碼不對" });
      }

      const { token, expiresAt } = createSession(db, user.id, deviceName);
      res.json({ token, expiresAt, user: { email: user.email }, cursor: user.cursor });
    })
  );

  router.get(
    "/me",
    auth,
    a(async (req, res) => {
      const devices = db
        .prepare(
          `SELECT device_name AS name, created_at AS createdAt, last_seen_at AS lastSeenAt
             FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC`
        )
        .all(req.user.id, Date.now());
      res.json({ user: { email: req.user.email }, cursor: req.user.cursor, devices });
    })
  );

  router.post(
    "/logout",
    auth,
    a(async (req, res) => {
      db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(req.session.tokenHash);
      res.json({ ok: true });
    })
  );

  /* 手機掉了用這個：把所有裝置都踢掉（包含現在這台）。 */
  router.post(
    "/logout-all",
    auth,
    a(async (req, res) => {
      const removed = db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(req.user.id).changes;
      res.json({ ok: true, removed });
    })
  );

  router.post(
    "/password",
    auth,
    limit,
    a(async (req, res) => {
      const currentPassword = String(req.body?.currentPassword ?? "");
      const newPassword = String(req.body?.newPassword ?? "");
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res
          .status(400)
          .json({ error: "weak_password", message: `密碼至少要 ${MIN_PASSWORD_LENGTH} 個字` });
      }
      const row = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.user.id);
      if (!(await verifyPassword(currentPassword, row.password_hash))) {
        return res.status(401).json({ error: "invalid_credentials", message: "目前的密碼不對" });
      }

      const hash = await hashPassword(newPassword);
      /* 改密碼順便把其他裝置踢掉，只留現在這台。 */
      transaction(db, () => {
        db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, req.user.id);
        db.prepare(`DELETE FROM sessions WHERE user_id = ? AND token_hash != ?`).run(
          req.user.id,
          req.session.tokenHash
        );
      })();
      res.json({ ok: true });
    })
  );

  return router;
}
