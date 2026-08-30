import { STORE_CATEGORIES, STORE_EXPENSES, STORE_BUDGETS, getAll, clearStore, add } from "./db.js";

const SCHEMA_VERSION = 1;

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

export async function exportJSON() {
  const [categories, expenses, budgets] = await Promise.all([
    getAll(STORE_CATEGORIES),
    getAll(STORE_EXPENSES),
    getAll(STORE_BUDGETS),
  ]);
  const payload = {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    expenses,
    budgets,
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

  await clearStore(STORE_CATEGORIES);
  await clearStore(STORE_EXPENSES);
  await clearStore(STORE_BUDGETS);

  for (const c of data.categories) await add(STORE_CATEGORIES, c);
  for (const e of data.expenses) {
    const { id, ...rest } = e;
    await add(STORE_EXPENSES, rest);
  }
  for (const b of data.budgets || []) await add(STORE_BUDGETS, b);

  return {
    categories: data.categories.length,
    expenses: data.expenses.length,
    budgets: (data.budgets || []).length,
  };
}
