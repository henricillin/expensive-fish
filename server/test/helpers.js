import { after } from "node:test";
import { createApp } from "../src/app.js";
import { migrate, openDatabase } from "../src/db.js";

/* 每個測試檔一台記憶體伺服器，聽 0 號埠讓 OS 自己挑，測試才能平行跑。 */
export async function startTestServer() {
  const db = openDatabase(":memory:");
  migrate(db);
  const app = createApp(db);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const close = () =>
    new Promise((resolve) => {
      server.close(() => {
        db.close();
        resolve();
      });
    });
  after(close);

  return { db, base, close, api: makeApi(base) };
}

function makeApi(base) {
  return async function api(method, path, { token, body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  };
}

export async function registerUser(api, email = "a@example.com", password = "hunter2hunter2") {
  const res = await api("POST", "/api/auth/register", {
    body: { email, password, deviceName: "test" },
  });
  return res.body.token;
}

export function change(collection, uid, payload, updatedAt = Date.now()) {
  return { collection, uid, payload, updatedAt, deleted: false };
}

export function tombstone(collection, uid, updatedAt = Date.now()) {
  return { collection, uid, payload: null, updatedAt, deleted: true };
}
