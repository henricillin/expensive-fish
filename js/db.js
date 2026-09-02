const DB_NAME = "expenseTrackerDB";
const DB_VERSION = 5;

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

let dbPromise = null;

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

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    Promise.resolve(fn(store))
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

export async function put(storeName, value) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.put(value)));
}

export async function add(storeName, value) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.add(value)));
}

export async function remove(storeName, id) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.delete(id)));
}

export async function clearStore(storeName) {
  return tx(storeName, "readwrite", (store) => reqToPromise(store.clear()));
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
