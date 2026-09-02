/* 雲端同步的 client 端。

   同步的規則就三條：
   1. 每筆資料有一個跨裝置不變的 uid（db.js 負責蓋上去）
   2. 誰的 updatedAt 比較新誰贏（last-write-wins）
   3. 刪除送的是墓碑，不是「什麼都不送」——不然離線那台會把它救回來

   一輪同步固定是「先推再拉」：推完之後拉一次，別台裝置在這期間的變更
   一併帶回來，游標只在整頁套用成功後才前進，中途斷線最多就是下次重拉。 */
import {
  SYNCABLE_STORES,
  clearQueue,
  clearQueueEntries,
  enqueueAll,
  findByUid,
  getMeta,
  listQueue,
  queueCount,
  rawAdd,
  rawPut,
  rawRemove,
  removeQueueKeys,
  setMeta,
} from "./db.js";
import { deleteReceipt } from "./receipts.js";

export const DEFAULT_BASE_URL = "http://localhost:8787";

const LS_BASE_URL = "sync.baseUrl";
const LS_TOKEN = "sync.token";
const LS_EMAIL = "sync.email";

const META_CURSOR = "cursor";
const META_ACCOUNT = "account";
const META_LAST_SYNC = "lastSyncAt";
/* 第一次連上某個帳號時為 true：那一輪拉下來的東西無條件蓋掉本機同一筆。
   不這樣做的話，新手機剛開 App 產生的預設分類（updatedAt 是「現在」）
   會反過來把雲端上改過名字的分類蓋掉。 */
const META_ADOPT = "adoptCloud";

const PUSH_BATCH = 300;
const PULL_LIMIT = 300;
const DEBOUNCE_MS = 3000;
/* 切回前景時，離上次同步超過這麼久才再同步一次 */
const REFRESH_AFTER_MS = 60 * 1000;

export class SyncError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "SyncError";
    this.status = status;
    this.code = code;
  }
}

let state = { syncing: false, lastError: null, pending: 0, lastSyncAt: 0 };
const listeners = new Set();

export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(getState());
    } catch (err) {
      console.warn("sync listener failed", err);
    }
  }
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function getConfig() {
  return {
    baseUrl: localStorage.getItem(LS_BASE_URL) || "",
    token: localStorage.getItem(LS_TOKEN) || "",
    email: localStorage.getItem(LS_EMAIL) || "",
  };
}

export function isLinked() {
  const { baseUrl, token } = getConfig();
  return Boolean(baseUrl && token);
}

export function getState() {
  const { baseUrl, email } = getConfig();
  return { linked: isLinked(), baseUrl, email, ...state };
}

/* 讓 UI 隨時問得到「還有幾筆沒上傳」 */
export async function refreshPending() {
  state = { ...state, pending: await queueCount(), lastSyncAt: await getMeta(META_LAST_SYNC, 0) };
  emit();
  return state.pending;
}

async function api(method, path, { body, auth = true } = {}) {
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
    if (res.status === 401 && auth) unlinkLocal();
    throw new SyncError(data?.message || `同步失敗（HTTP ${res.status}）`, {
      status: res.status,
      code: data?.error,
    });
  }
  return data;
}

/* ---- 登入／登出 ---- */

export async function link({ baseUrl, email, password, register = false }) {
  const url = normalizeBaseUrl(baseUrl);
  if (!url) throw new SyncError("請輸入伺服器網址");
  localStorage.setItem(LS_BASE_URL, url);
  localStorage.removeItem(LS_TOKEN);

  const deviceName = describeDevice();
  const data = await api("POST", register ? "/api/auth/register" : "/api/auth/login", {
    auth: false,
    body: { email: String(email || "").trim(), password, deviceName },
  });

  localStorage.setItem(LS_TOKEN, data.token);
  localStorage.setItem(LS_EMAIL, data.user.email);

  /* 換了帳號（或第一次連）就重來一次：游標歸零、本機資料全部重排上傳，
     並且標記這一輪要「以雲端為準」。 */
  const account = `${url}|${data.user.email}`;
  if ((await getMeta(META_ACCOUNT, null)) !== account) {
    await setMeta(META_ACCOUNT, account);
    await setMeta(META_CURSOR, 0);
    await setMeta(META_ADOPT, true);
    await clearQueue();
    await enqueueAll();
  }

  state = { ...state, lastError: null };
  emit();
  return syncNow({ silent: false });
}

/* 只清掉這台裝置的登入狀態，本機資料和雲端資料都不動。 */
export function unlinkLocal() {
  localStorage.removeItem(LS_TOKEN);
  state = { ...state, syncing: false };
  emit();
}

export async function unlink() {
  try {
    await api("POST", "/api/auth/logout");
  } catch {
    /* 伺服器連不上也要能在本機登出，不然使用者被卡死 */
  }
  unlinkLocal();
}

/* 把雲端那份砍掉。本機資料一筆都不動——這支只管伺服器上那一份。 */
export async function wipeCloud() {
  const result = await api("DELETE", "/api/sync/data?confirm=yes");
  await setMeta(META_CURSOR, result.cursor);
  return result;
}

function describeDevice() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "瀏覽器";
}

/* ---- 推 ---- */

/* 伺服器不需要（也不該拿到）本機的自動編號 id：每台裝置編出來的號碼不一樣，
   身分一律看 uid。字串主鍵的 store 則相反，id 本身就是 uid，要留著。 */
function toPayload(collection, record) {
  const { uid, updatedAt, ...rest } = record;
  if (SYNCABLE_STORES[collection] === "field") delete rest.id;
  return rest;
}

/* 回傳「這一輪自己推上去的」指紋。緊接著的拉會把這些原封不動送回來，
   認得出來就不用再套用一次——省掉一次白工，也省掉一次沒必要的畫面重畫。 */
async function pushPending(justPushed) {
  let pushed = 0;
  for (let round = 0; round < 50; round++) {
    const queue = await listQueue();
    if (!queue.length) break;

    const batch = queue.slice(0, PUSH_BATCH);
    const changes = [];
    const sent = [];

    for (const entry of batch) {
      if (entry.deleted) {
        changes.push({
          collection: entry.collection,
          uid: entry.uid,
          deleted: true,
          updatedAt: entry.updatedAt || Date.now(),
        });
        sent.push(entry);
        continue;
      }
      const record = await findByUid(entry.collection, entry.uid);
      if (!record) {
        /* 排隊時還在、現在找不到了。刪除會另外排一筆墓碑進來，
           所以這裡不要自作主張送刪除，把這筆丟掉就好。 */
        sent.push(entry);
        continue;
      }
      changes.push({
        collection: entry.collection,
        uid: entry.uid,
        deleted: false,
        updatedAt: record.updatedAt || entry.updatedAt || Date.now(),
        payload: toPayload(entry.collection, record),
      });
      sent.push(entry);
    }

    if (changes.length) {
      const res = await api("POST", "/api/sync/push", { body: { changes } });
      /* 被退回來的代表雲端那份比較新，直接拿它蓋掉本機，
         不然這筆會每次同步都再被退一次。 */
      for (const r of res.results) {
        if (r.status === "stale" && r.server) await applyChange(r.server, { adopt: true });
      }
      for (const c of changes) {
        justPushed.add(`${c.collection}|${c.uid}|${c.updatedAt}`);
      }
      pushed += res.applied;
    }

    const removed = await clearQueueEntries(sent);
    /* 一筆都清不掉代表全部在同步途中又被改過，留給下一輪，不要在這裡空轉 */
    if (!removed) break;
    if (queue.length <= PUSH_BATCH) break;
  }
  return pushed;
}

/* ---- 拉 ---- */

/* 這一輪總共動到幾筆本機資料。有動到就要叫畫面重畫，
   不然使用者會盯著一份已經過時的月結算。 */
let appliedCount = 0;

async function applyChange(change, { adopt }) {
  const { collection, uid, deleted, updatedAt, payload } = change;
  const mode = SYNCABLE_STORES[collection];
  if (!mode) return false;

  const local = await findByUid(collection, uid);
  /* 本機比較新就不動它，等下一輪把本機這份推上去。
     時間一樣時讓伺服器贏——兩台裝置才會收斂到同一個值。 */
  if (!adopt && local && (local.updatedAt || 0) > updatedAt) return false;

  if (deleted) {
    if (!local) return false;
    await rawRemove(collection, local.id);
    /* 收據不同步，但支出被刪掉時它就成了永遠讀不到的孤兒 */
    if (collection === "expenses") await deleteReceipt(local.id);
    appliedCount++;
    return true;
  }

  appliedCount++;
  const record = { ...payload, uid, updatedAt };
  if (mode === "id") {
    record.id = uid;
    await rawPut(collection, record);
  } else if (local) {
    /* 自動編號的 store：保留本機的 id，只換內容 */
    record.id = local.id;
    await rawPut(collection, record);
  } else {
    delete record.id;
    await rawAdd(collection, record);
  }
  return true;
}

async function pullAll({ adopt, skip }) {
  let cursor = await getMeta(META_CURSOR, 0);
  let applied = 0;

  for (let page = 0; page < 500; page++) {
    const res = await api("GET", `/api/sync/pull?since=${cursor}&limit=${PULL_LIMIT}`);
    for (const change of res.changes) {
      if (skip?.has(`${change.collection}|${change.uid}|${change.updatedAt}`)) continue;
      if (await applyChange(change, { adopt })) applied++;
    }
    /* 以雲端為準的那一輪，剛蓋下來的這些就不用再推回去了 */
    if (adopt && res.changes.length) {
      await removeQueueKeys(res.changes.map((c) => `${c.collection}|${c.uid}`));
    }
    cursor = res.cursor;
    /* 整頁套用成功才前進游標：中途斷線最多就是下次重拉同一頁 */
    await setMeta(META_CURSOR, cursor);
    if (!res.hasMore) break;
  }
  return applied;
}

/* ---- 一輪同步 ---- */

let running = null;

export async function syncNow() {
  if (!isLinked()) return { skipped: "not_linked" };
  if (running) return running;

  state = { ...state, syncing: true, lastError: null };
  emit();

  const appliedBefore = appliedCount;
  running = (async () => {
    try {
      /* 第一次連上這個帳號：先把雲端整份拉下來蓋掉本機同名資料，
         再把本機獨有的東西推上去。 */
      let adopted = 0;
      if (await getMeta(META_ADOPT, false)) {
        adopted = await pullAll({ adopt: true });
        await setMeta(META_ADOPT, false);
      }
      const justPushed = new Set();
      const pushed = await pushPending(justPushed);
      const pulled = await pullAll({ adopt: false, skip: justPushed });

      /* 本機資料被改動過才叫畫面重畫，沒事就不要動使用者正在看的東西 */
      if (appliedCount !== appliedBefore) {
        window.dispatchEvent(new CustomEvent("sync:applied"));
      }

      const now = Date.now();
      await setMeta(META_LAST_SYNC, now);
      state = { ...state, syncing: false, lastError: null, lastSyncAt: now };
      await refreshPending();
      return { pushed, pulled: pulled + adopted };
    } catch (err) {
      state = { ...state, syncing: false, lastError: err.message || "同步失敗" };
      emit();
      throw err;
    } finally {
      running = null;
    }
  })();

  return running;
}

/* ---- 自動同步 ---- */

let debounceTimer = null;

export function scheduleSync(delay = DEBOUNCE_MS) {
  if (!isLinked()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    syncNow().catch(() => {
      /* 背景同步失敗不用打擾使用者，狀態會顯示在「更多」頁 */
    });
  }, delay);
}

let autoStarted = false;

export function startAutoSync() {
  if (autoStarted) return;
  autoStarted = true;

  /* db.js 每次寫入會發這個事件。連續記三筆不要同步三次，所以壓一段時間再送。 */
  window.addEventListener("sync:dirty", () => {
    refreshPending();
    scheduleSync();
  });

  /* 從背景切回來：手機上這就是「打開 App」，順便把別台的變更帶回來 */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - state.lastSyncAt > REFRESH_AFTER_MS) scheduleSync(500);
  });

  window.addEventListener("online", () => scheduleSync(500));

  refreshPending();
  if (isLinked()) scheduleSync(1500);
}

export function formatSyncTime(ts) {
  if (!ts) return "還沒同步過";
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return "剛剛同步過";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分鐘前同步`;
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} 同步`;
}
