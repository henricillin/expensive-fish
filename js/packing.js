/* 攜帶清單 — 每個方案一份，項目可以指派給方案裡的一位成員。
   （store 的欄位名還是 listId，值就是方案 id。） */
import {
  STORE_PACKING_ITEMS,
  getById,
  getAll,
  put,
  add,
  remove,
  getAllByIndex,
} from "./db.js";

export const UNASSIGNED = { id: "", name: "未認領" };

/* ---- 分類 ----
   分類沒有自己的 store：項目上直接存分類的名字（`category`，空字串就是未分類）。
   選單上的選項是「內建的幾個 + 這台裝置自己加過的 + 所有項目用過的」合起來。
   開新 store 的話 db.js 的 SYNCABLE_STORES 和伺服器的 COLLECTIONS 都要跟著改，
   而分類就是一個字串，塞在項目裡同步本來就會過去，不值得多開一張表。 */
export const DEFAULT_CATEGORIES = ["生活", "實習", "電器", "證件", "藥品"];
export const NO_CATEGORY = { id: "", name: "未分類" };

const CUSTOM_CATEGORY_KEY = "packingCategories";
const MAX_CATEGORY_LENGTH = 10;

export function normalizeCategory(name) {
  return String(name ?? "").trim().slice(0, MAX_CATEGORY_LENGTH);
}

function customCategories() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_CATEGORY_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(normalizeCategory).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/* 剛加好、還沒有任何項目用到的分類只留在這台裝置（localStorage）。
   一旦有項目用了它，分類就跟著項目同步過去，別台裝置也會看到。 */
export function rememberCategory(name) {
  const value = normalizeCategory(name);
  if (!value) return "";
  const list = customCategories();
  if (!list.includes(value)) {
    try {
      localStorage.setItem(CUSTOM_CATEGORY_KEY, JSON.stringify([...list, value]));
    } catch {
      /* 隱私模式寫不進去就算了，分類還是會跟著項目留下來 */
    }
  }
  return value;
}

export async function listPackingCategories() {
  const used = (await getAll(STORE_PACKING_ITEMS)).map((i) => normalizeCategory(i.category));
  const names = [];
  for (const name of [...DEFAULT_CATEGORIES, ...customCategories(), ...used]) {
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/* 依分類分組，順序照 listPackingCategories()，未分類永遠排最後。 */
export function groupByCategory(items, categories) {
  const groups = new Map(categories.map((name) => [name, []]));
  const rest = [];
  for (const item of items) {
    const name = normalizeCategory(item.category);
    if (name && groups.has(name)) groups.get(name).push(item);
    else if (name) groups.set(name, [item]);
    else rest.push(item);
  }
  const result = [...groups].filter(([, list]) => list.length);
  if (rest.length) result.push([NO_CATEGORY.name, rest]);
  return result;
}

export async function listItems(tripId) {
  const items = await getAllByIndex(STORE_PACKING_ITEMS, "listId", tripId);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addItem(tripId, name, category = "") {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("請輸入項目名稱");
  const item = {
    listId: tripId,
    name: trimmed,
    category: normalizeCategory(category),
    note: "",
    personId: "",
    done: false,
    createdAt: Date.now(),
  };
  const id = await add(STORE_PACKING_ITEMS, item);
  return { ...item, id };
}

export async function updateItem(id, changes) {
  const existing = await getById(STORE_PACKING_ITEMS, id);
  if (!existing) throw new Error("找不到這個項目");
  if (typeof changes.name === "string") {
    const trimmed = changes.name.trim();
    if (!trimmed) throw new Error("請輸入項目名稱");
    changes = { ...changes, name: trimmed };
  }
  if (changes.category !== undefined) {
    changes = { ...changes, category: normalizeCategory(changes.category) };
  }
  const updated = { ...existing, ...changes };
  await put(STORE_PACKING_ITEMS, updated);
  return updated;
}

export async function deleteItem(id) {
  await remove(STORE_PACKING_ITEMS, id);
}

export async function toggleItem(id) {
  const existing = await getById(STORE_PACKING_ITEMS, id);
  if (!existing) return null;
  return updateItem(id, { done: !existing.done });
}

export async function uncheckAll(tripId) {
  const items = await listItems(tripId);
  for (const item of items) {
    if (item.done) await put(STORE_PACKING_ITEMS, { ...item, done: false });
  }
}

export async function removeDone(tripId) {
  const items = await listItems(tripId);
  let removed = 0;
  for (const item of items) {
    if (item.done) {
      await remove(STORE_PACKING_ITEMS, item.id);
      removed++;
    }
  }
  return removed;
}

export function progressOf(items) {
  return { total: items.length, done: items.filter((i) => i.done).length };
}

export async function listProgress(tripId) {
  return progressOf(await listItems(tripId));
}
