/* 攜帶清單 — 每個方案一份，項目可以指派給方案裡的一位成員。
   （store 的欄位名還是 listId，值就是方案 id。） */
import {
  STORE_PACKING_ITEMS,
  getById,
  put,
  add,
  remove,
  getAllByIndex,
} from "./db.js";

export const UNASSIGNED = { id: "", name: "未認領" };

export async function listItems(tripId) {
  const items = await getAllByIndex(STORE_PACKING_ITEMS, "listId", tripId);
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addItem(tripId, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("請輸入項目名稱");
  const item = {
    listId: tripId,
    name: trimmed,
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
