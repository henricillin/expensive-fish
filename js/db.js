const DB_NAME = "expenseTrackerDB";
const DB_VERSION = 2;

export const STORE_CATEGORIES = "categories";
export const STORE_EXPENSES = "expenses";
export const STORE_BUDGETS = "budgets";
export const STORE_PEOPLE = "people";
export const STORE_SETTLEMENTS = "settlements";

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
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export async function countStore(storeName) {
  return tx(storeName, "readonly", (store) => reqToPromise(store.count()));
}
