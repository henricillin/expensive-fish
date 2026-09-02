const DB_NAME = "expenseTrackerDB";
const DB_VERSION = 6;

export const STORE_CATEGORIES = "categories";
export const STORE_EXPENSES = "expenses";
export const STORE_BUDGETS = "budgets";
export const STORE_PEOPLE = "people";
export const STORE_SETTLEMENTS = "settlements";
export const STORE_TRIPS = "trips";
export const STORE_TRIP_SETTLEMENTS = "tripSettlements";
/* 攜帶清單的項目。欄位仍叫 listId，值是方案 id（v4 之前是清單 id，兩者相同）。 */
export const STORE_PACKING_LISTS = "packingLists";
export const STORE_PACKING_ITEMS = "packingItems";
/* 收據照片。一筆支出最多一張，所以直接用 expenseId 當 key。
   值是壓縮過的 Blob，刻意跟 expenses 分開存——不然每次列支出都會把照片一起讀進記憶體。 */
export const STORE_RECEIPTS = "receipts";

/* v6：雲端同步用的兩個 store。
   syncMeta 放游標和帳號資訊，syncQueue 是「還沒上傳的變更」。 */
export const STORE_SYNC_META = "syncMeta";
export const STORE_SYNC_QUEUE = "syncQueue";

/* 會同步的 store，值代表 uid（跨裝置的身分）從哪裡來：
   "id"    → 主鍵本來就是字串而且全域唯一（slug + 亂碼），uid 就是 id
   "field" → 主鍵是 autoIncrement 的整數，每台裝置編號不一樣，
             所以另外存一個 uid 欄位，同步時只認 uid、不認 id
   收據（receipts）不在名單上：那是 Blob，走 JSON 同步會直接爆掉。 */
export const SYNCABLE_STORES = {
  [STORE_CATEGORIES]: "id",
  [STORE_EXPENSES]: "field",
  [STORE_BUDGETS]: "id",
  [STORE_PEOPLE]: "id",
  [STORE_SETTLEMENTS]: "field",
  [STORE_TRIPS]: "id",
  [STORE_TRIP_SETTLEMENTS]: "field",
  [STORE_PACKING_ITEMS]: "field",
};

export const SYNCABLE_STORE_NAMES = Object.keys(SYNCABLE_STORES);

let dbPromise = null;

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  /* 舊 WebView 沒有 randomUUID，退回自己拼一個 v4 */
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/* 同一毫秒內連續兩次寫入要拿到不同的號碼，不然「送出去之後把佇列清掉」
   會誤刪中途剛排進來的那筆。 */
let lastStamp = 0;
function nextStamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        db.createObjectStore(STORE_CATEGORIES, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_EXPENSES)) {
        const expenses = db.createObjectStore(STORE_EXPENSES, {
          keyPath: "id",
          autoIncrement: true,
        });
        expenses.createIndex("date", "date", { unique: false });
        expenses.createIndex("categoryId", "categoryId", { unique: false });
        expenses.createIndex("yearMonth", "yearMonth", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_BUDGETS)) {
        db.createObjectStore(STORE_BUDGETS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_PEOPLE)) {
        db.createObjectStore(STORE_PEOPLE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_SETTLEMENTS)) {
        const settlements = db.createObjectStore(STORE_SETTLEMENTS, {
          keyPath: "id",
          autoIncrement: true,
        });
        settlements.createIndex("personId", "personId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_PACKING_LISTS)) {
        db.createObjectStore(STORE_PACKING_LISTS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORE_PACKING_ITEMS)) {
        const items = db.createObjectStore(STORE_PACKING_ITEMS, {
          keyPath: "id",
          autoIncrement: true,
        });
        items.createIndex("listId", "listId", { unique: false });
      }

      /* v4：出門清單升級成「方案」。舊的 packingLists 一份一份搬過來，
         id 不變，所以底下的項目（listId）自動接上新的方案。
         舊 store 留著不刪，萬一搬家出問題還救得回來。 */
      if (!db.objectStoreNames.contains(STORE_TRIPS)) {
        const trips = db.createObjectStore(STORE_TRIPS, { keyPath: "id" });
        const legacy = req.transaction.objectStore(STORE_PACKING_LISTS);
        legacy.getAll().onsuccess = (ev) => {
          for (const list of ev.target.result || []) {
            trips.put({
              id: list.id,
              name: list.name,
              startDate: "",
              endDate: "",
              memberIds: [],
              note: "",
              createdAt: list.createdAt || Date.now(),
            });
          }
        };
      }

      if (!db.objectStoreNames.contains(STORE_TRIP_SETTLEMENTS)) {
        const tripSettlements = db.createObjectStore(STORE_TRIP_SETTLEMENTS, {
          keyPath: "id",
          autoIncrement: true,
        });
        tripSettlements.createIndex("tripId", "tripId", { unique: false });
      }

      /* v5：收據照片。方案封存（trips.archivedAt）不用 migration——
         沒有這個欄位就當成沒封存，normalize() 補上預設值。 */
      if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
        db.createObjectStore(STORE_RECEIPTS, { keyPath: "expenseId" });
      }

      /* v6：雲端同步。 */
      if (!db.objectStoreNames.contains(STORE_SYNC_META)) {
        db.createObjectStore(STORE_SYNC_META, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: "key" });
      }
      backfillSyncFields(req.transaction);
    };

    req.onsuccess = () => {
      const db = req.result;
      /* App 開在兩個分頁時，舊分頁要讓位，不然下次改版會卡住。 */
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("資料庫要更新，但 App 還開在另一個分頁，請把其他分頁關掉再重新整理"));
  });
  return dbPromise;
}

/* v6 的搬家：自動編號的 store 加上 uid 索引，然後把既有資料補上 uid／updatedAt。
   補完順手全部排進上傳佇列——升級前就存在的資料伺服器沒看過，
   第一次同步本來就該整批上去。 */
function backfillSyncFields(upgradeTx) {
  for (const [storeName, mode] of Object.entries(SYNCABLE_STORES)) {
    const store = upgradeTx.objectStore(storeName);
    if (mode === "field" && !store.indexNames.contains("uid")) {
      store.createIndex("uid", "uid", { unique: true });
    }
  }

  const queue = upgradeTx.objectStore(STORE_SYNC_QUEUE);
  for (const [storeName, mode] of Object.entries(SYNCABLE_STORES)) {
    const store = upgradeTx.objectStore(storeName);
    store.openCursor().onsuccess = (ev) => {
      const cursor = ev.target.result;
      if (!cursor) return;
      const value = cursor.value;
      const uid = value.uid || (mode === "id" ? value.id : uuid());
      const updatedAt = value.updatedAt || value.createdAt || Date.now();
      if (value.uid !== uid || value.updatedAt !== updatedAt) {
        cursor.update({ ...value, uid, updatedAt });
      }
      queue.put({
        key: `${storeName}|${uid}`,
        collection: storeName,
        uid,
        deleted: false,
        updatedAt,
        stamp: nextStamp(),
      });
      cursor.continue();
    };
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* storeNames 可以是一個名字（fn 收到那個 store），也可以是陣列
   （fn 收到 { 名字: store }）。要跨 store 又要一起成功或一起失敗時用得到——
   例如「寫資料」跟「把它排進上傳佇列」就必須是同一筆交易。 */
export async function tx(storeNames, mode, fn) {
  const db = await openDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, mode);
    const arg = Array.isArray(storeNames)
      ? Object.fromEntries(names.map((n) => [n, transaction.objectStore(n)]))
      : transaction.objectStore(names[0]);
    let result;
    Promise.resolve(fn(arg))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAll(storeName) {
  return tx(storeName, "readonly", (store) => reqToPromise(store.getAll()));
}

export async function getById(storeName, id) {
  return tx(storeName, "readonly", (store) => reqToPromise(store.get(id)));
}

export async function getAllByIndex(storeName, indexName, query) {
  return tx(storeName, "readonly", (store) =>
    reqToPromise(store.index(indexName).getAll(query))
  );
}

export async function getAllKeys(storeName) {
  return tx(storeName, "readonly", (store) => reqToPromise(store.getAllKeys()));
}

export async function countStore(storeName) {
  return tx(storeName, "readonly", (store) => reqToPromise(store.count()));
}

/* ---- 寫入：會同步的 store 一律蓋上 uid／updatedAt，並排進上傳佇列 ---- */

function stampForWrite(storeName, value) {
  const mode = SYNCABLE_STORES[storeName];
  if (!mode) return value;
  const record = { ...value, updatedAt: Date.now() };
  if (!record.uid) record.uid = mode === "id" ? value.id ?? uuid() : uuid();
  if (mode === "id" && !record.id) record.id = record.uid;
  return record;
}

function enqueue(queueStore, collection, uid, deleted, updatedAt) {
  queueStore.put({
    key: `${collection}|${uid}`,
    collection,
    uid,
    deleted,
    updatedAt,
    stamp: nextStamp(),
  });
}

/* 有東西要上傳時吼一聲，sync.js 接到才知道該排一次同步。
   走 window 事件而不是直接 import，db.js 才不會反過來依賴 sync.js。 */
function notifyDirty() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("sync:dirty"));
}

export async function put(storeName, value) {
  if (!SYNCABLE_STORES[storeName]) {
    return tx(storeName, "readwrite", (store) => reqToPromise(store.put(value)));
  }
  const record = stampForWrite(storeName, value);
  const result = await tx([storeName, STORE_SYNC_QUEUE], "readwrite", (stores) => {
    enqueue(stores[STORE_SYNC_QUEUE], storeName, record.uid, false, record.updatedAt);
    return reqToPromise(stores[storeName].put(record));
  });
  notifyDirty();
  return result;
}

export async function add(storeName, value) {
  if (!SYNCABLE_STORES[storeName]) {
    return tx(storeName, "readwrite", (store) => reqToPromise(store.add(value)));
  }
  const record = stampForWrite(storeName, value);
  const result = await tx([storeName, STORE_SYNC_QUEUE], "readwrite", (stores) => {
    enqueue(stores[STORE_SYNC_QUEUE], storeName, record.uid, false, record.updatedAt);
    return reqToPromise(stores[storeName].add(record));
  });
  notifyDirty();
  return result;
}

/* 刪除要先把 uid 讀出來才刪得掉——沒有 uid 就沒辦法告訴伺服器「刪的是哪一筆」，
   那筆資料下次同步又會被別台裝置救回來。 */
export async function remove(storeName, id) {
  if (!SYNCABLE_STORES[storeName]) {
    return tx(storeName, "readwrite", (store) => reqToPromise(store.delete(id)));
  }
  const result = await tx([storeName, STORE_SYNC_QUEUE], "readwrite", async (stores) => {
    const existing = await reqToPromise(stores[storeName].get(id));
    const uid = existing?.uid || (SYNCABLE_STORES[storeName] === "id" ? id : null);
    if (uid) enqueue(stores[STORE_SYNC_QUEUE], storeName, uid, true, Date.now());
    return reqToPromise(stores[storeName].delete(id));
  });
  notifyDirty();
  return result;
}

/* 匯入備份會先清空。清掉的每一筆都要留一個墓碑，
   不然雲端那份會在下次同步時把它們全部倒回來。 */
export async function clearStore(storeName) {
  if (!SYNCABLE_STORES[storeName]) {
    return tx(storeName, "readwrite", (store) => reqToPromise(store.clear()));
  }
  const result = await tx([storeName, STORE_SYNC_QUEUE], "readwrite", async (stores) => {
    const all = await reqToPromise(stores[storeName].getAll());
    const now = Date.now();
    for (const value of all) {
      const uid = value.uid || (SYNCABLE_STORES[storeName] === "id" ? value.id : null);
      if (uid) enqueue(stores[STORE_SYNC_QUEUE], storeName, uid, true, now);
    }
    return reqToPromise(stores[storeName].clear());
  });
  notifyDirty();
  return result;
}

/* ---- 同步專用：不重新排隊的寫入 ----
   從伺服器拉回來的東西再排一次隊就會來回彈，所以套用時走這幾支。 */

export async function rawPut(storeName, value) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.put(value)));
}

export async function rawAdd(storeName, value) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.add(value)));
}

export async function rawRemove(storeName, id) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.delete(id)));
}

export async function findByUid(storeName, uid) {
  if (SYNCABLE_STORES[storeName] === "id") return getById(storeName, uid);
  return tx(storeName, "readonly", (store) => reqToPromise(store.index("uid").get(uid)));
}

/* ---- 同步佇列與中繼資料 ---- */

export async function listQueue() {
  return getAll(STORE_SYNC_QUEUE);
}

export async function queueCount() {
  return countStore(STORE_SYNC_QUEUE);
}

/* 只刪掉「跟送出去時一模一樣」的那些。同步進行中使用者又改了一筆的話，
   stamp 會不一樣，那筆就留著等下一輪。 */
export async function clearQueueEntries(entries) {
  if (!entries.length) return 0;
  return tx(STORE_SYNC_QUEUE, "readwrite", async (store) => {
    let removed = 0;
    for (const entry of entries) {
      const current = await reqToPromise(store.get(entry.key));
      if (current && current.stamp === entry.stamp) {
        await reqToPromise(store.delete(entry.key));
        removed++;
      }
    }
    return removed;
  });
}

/* 換帳號、或第一次登入時用：把本機所有資料重新排進佇列，整批上傳一次。
   順便補上漏掉 uid／updatedAt 的資料——升級時的 migration 有機會漏掉
   （例如同一次升級裡才剛被建出來的 store），這裡當作最後一道保險。 */
export async function enqueueAll() {
  for (const storeName of SYNCABLE_STORE_NAMES) {
    const mode = SYNCABLE_STORES[storeName];
    await tx([storeName, STORE_SYNC_QUEUE], "readwrite", async (stores) => {
      const all = await reqToPromise(stores[storeName].getAll());
      for (const value of all) {
        const uid = value.uid || (mode === "id" ? value.id : uuid());
        const updatedAt = value.updatedAt || value.createdAt || Date.now();
        if (value.uid !== uid || value.updatedAt !== updatedAt) {
          await reqToPromise(stores[storeName].put({ ...value, uid, updatedAt }));
        }
        enqueue(stores[STORE_SYNC_QUEUE], storeName, uid, false, updatedAt);
      }
    });
  }
  notifyDirty();
}

/* 不管 stamp 直接把這幾筆從佇列拿掉。第一次登入舊帳號時用：
   雲端那份說了算，本機排隊等著上傳的同一筆就不必送了。 */
export async function removeQueueKeys(keys) {
  if (!keys.length) return 0;
  return tx(STORE_SYNC_QUEUE, "readwrite", async (store) => {
    for (const key of keys) await reqToPromise(store.delete(key));
    return keys.length;
  });
}

export async function clearQueue() {
  return tx(STORE_SYNC_QUEUE, "readwrite", (store) => reqToPromise(store.clear()));
}

export async function getMeta(key, fallback = null) {
  const row = await getById(STORE_SYNC_META, key);
  return row === undefined ? fallback : row.value;
}

export async function setMeta(key, value) {
  return tx(STORE_SYNC_META, "readwrite", (store) => reqToPromise(store.put({ key, value })));
}
