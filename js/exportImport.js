import {
  STORE_CATEGORIES,
  STORE_EXPENSES,
  STORE_BUDGETS,
  STORE_PEOPLE,
  STORE_SETTLEMENTS,
  STORE_TRIPS,
  STORE_TRIP_SETTLEMENTS,
  STORE_PACKING_ITEMS,
  getAll,
  clearStore,
  add,
} from "./db.js";

const SCHEMA_VERSION = 3;

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* 收據照片刻意不進備份：JSON.stringify 碰到 Blob 會安靜地變成 {}，
   就算改成 base64，幾十張照片也會讓備份檔從幾十 KB 變成幾十 MB。
   更多頁的說明有寫這件事。 */
export async function exportJSON() {
  const [categories, expenses, budgets, people, settlements, trips, tripSettlements, packingItems] =
    await Promise.all([
      getAll(STORE_CATEGORIES),
      getAll(STORE_EXPENSES),
      getAll(STORE_BUDGETS),
      getAll(STORE_PEOPLE),
      getAll(STORE_SETTLEMENTS),
      getAll(STORE_TRIPS),
      getAll(STORE_TRIP_SETTLEMENTS),
      getAll(STORE_PACKING_ITEMS),
    ]);
  const payload = {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    expenses,
    budgets,
    people,
    settlements,
    trips,
    tripSettlements,
    packingItems,
  };
  const filename = `expense-backup-${new Date().toISOString().slice(0, 10)}.json`;
  downloadBlob(JSON.stringify(payload, null, 2), filename, "application/json");
}

export async function exportCSV() {
  const [expenses, categories] = await Promise.all([
    getAll(STORE_EXPENSES),
    getAll(STORE_CATEGORIES),
  ]);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const rows = [["日期", "分類", "金額", "備註", "評分"]];
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    rows.push([
      e.date,
      catMap[e.categoryId] || e.categoryId,
      e.amount,
      (e.note || "").replace(/[\r\n,]/g, " "),
      Number(e.rating) || "",
    ]);
  }
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const filename = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob("﻿" + csv, filename, "text/csv");
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function importJSON(file) {
  const text = await readFileAsText(file);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("檔案格式錯誤，不是有效的 JSON");
  }
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.expenses)) {
    throw new Error("備份檔內容不完整");
  }

  /* 舊版備份沒有同伴／方案這些欄位，一律當成空陣列處理。
     v2 以前的備份存的是 packingLists，直接當成方案還原。 */
  const people = data.people || [];
  const settlements = data.settlements || [];
  const tripSettlements = data.tripSettlements || [];
  const packingItems = data.packingItems || [];
  const trips = (data.trips || data.packingLists || []).map((t) => ({
    startDate: "",
    endDate: "",
    memberIds: [],
    note: "",
    ...t,
  }));

  await clearStore(STORE_CATEGORIES);
  await clearStore(STORE_EXPENSES);
  await clearStore(STORE_BUDGETS);
  await clearStore(STORE_PEOPLE);
  await clearStore(STORE_SETTLEMENTS);
  await clearStore(STORE_TRIPS);
  await clearStore(STORE_TRIP_SETTLEMENTS);
  await clearStore(STORE_PACKING_ITEMS);

  for (const c of data.categories) await add(STORE_CATEGORIES, c);
  for (const e of data.expenses) {
    const { id, ...rest } = e;
    await add(STORE_EXPENSES, rest);
  }
  for (const b of data.budgets || []) await add(STORE_BUDGETS, b);
  for (const p of people) await add(STORE_PEOPLE, p);
  /* 這幾個 store 是 autoIncrement，去掉 id 讓它重新編號；關聯用的是字串 id。 */
  for (const st of settlements) {
    const { id, ...rest } = st;
    await add(STORE_SETTLEMENTS, rest);
  }
  for (const t of trips) await add(STORE_TRIPS, t);
  for (const st of tripSettlements) {
    const { id, ...rest } = st;
    await add(STORE_TRIP_SETTLEMENTS, rest);
  }
  for (const it of packingItems) {
    const { id, ...rest } = it;
    await add(STORE_PACKING_ITEMS, rest);
  }

  return {
    categories: data.categories.length,
    expenses: data.expenses.length,
    budgets: (data.budgets || []).length,
    people: people.length,
    trips: trips.length,
    packingItems: packingItems.length,
  };
}
