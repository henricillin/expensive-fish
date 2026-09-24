/* 跟同步伺服器講話的那一層：網址、權杖、fetch 的錯誤處理。
   拆出來是因為 sync.js（資料同步）和 shares.js（共享方案）都要用，
   兩邊互相 import 會繞成一圈。 */

export const DEFAULT_BASE_URL = "https://laptop-t9tbuffc.tail8d30be.ts.net";

const LS_BASE_URL = "sync.baseUrl";
const LS_TOKEN = "sync.token";
const LS_EMAIL = "sync.email";

export class SyncError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "SyncError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function getConfig() {
  return {
    baseUrl: localStorage.getItem(LS_BASE_URL) || "",
    token: localStorage.getItem(LS_TOKEN) || "",
    email: localStorage.getItem(LS_EMAIL) || "",
  };
}

export function setBaseUrl(url) {
  localStorage.setItem(LS_BASE_URL, normalizeBaseUrl(url));
}

export function setSession(token, email) {
  localStorage.setItem(LS_TOKEN, token);
  if (email) localStorage.setItem(LS_EMAIL, email);
}

export function clearSession() {
  localStorage.removeItem(LS_TOKEN);
}

export function isLinked() {
  const { baseUrl, token } = getConfig();
  return Boolean(baseUrl && token);
}

/* token 失效時要讓 sync.js 去清狀態、通知畫面。這裡不直接動它，
   不然這支就又回頭依賴 sync.js 了。 */
let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export async function api(method, path, { body, auth = true } = {}) {
  const { baseUrl, token } = getConfig();
  if (!baseUrl) throw new SyncError("還沒設定伺服器網址");

  let res;
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    /* fetch 只有在連不上時才 reject，訊息本身沒什麼參考價值 */
    throw new SyncError("連不上伺服器，請確認網址與網路");
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new SyncError(`伺服器回了非預期的內容（HTTP ${res.status}）`, { status: res.status });
  }

  if (!res.ok) {
    /* token 失效就直接登出，留著只會每次同步都失敗一次 */
    if (res.status === 401 && auth) unauthorizedHandler?.();
    throw new SyncError(data?.message || `同步失敗（HTTP ${res.status}）`, {
      status: res.status,
      code: data?.error,
    });
  }
  return data;
}
