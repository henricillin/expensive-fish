import {
  STORE_EXPENSES,
  getAll,
  getById,
  put,
  add,
  remove,
  getAllByIndex,
} from "./db.js";

export function todayISO() {
  const d = new Date();
  return dateToISO(d);
}

export function dateToISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoToYearMonth(iso) {
  return iso.slice(0, 7);
}

export function currentYearMonth() {
  return isoToYearMonth(todayISO());
}

export function shiftYearMonth(yearMonth, delta) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatYearMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

export async function listExpenses() {
  const all = await getAll(STORE_EXPENSES);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export async function listExpensesByMonth(yearMonth) {
  const all = await getAllByIndex(STORE_EXPENSES, "yearMonth", yearMonth);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export async function getExpense(id) {
  return getById(STORE_EXPENSES, id);
}

export async function createExpense({ amount, categoryId, date, note, split }) {
  const expense = {
    amount: Number(amount),
    categoryId,
    date,
    yearMonth: isoToYearMonth(date),
    note: note ? note.trim() : "",
    createdAt: Date.now(),
  };
  if (split) expense.split = split;
  const id = await add(STORE_EXPENSES, expense);
  return { ...expense, id };
}

export async function updateExpense(id, changes) {
  const existing = await getExpense(id);
  if (!existing) throw new Error("Expense not found");
  const updated = { ...existing, ...changes };
  if (changes.date) updated.yearMonth = isoToYearMonth(changes.date);
  if (changes.amount !== undefined) updated.amount = Number(changes.amount);
  await put(STORE_EXPENSES, updated);
  return updated;
}

export async function deleteExpense(id) {
  await remove(STORE_EXPENSES, id);
}

export async function monthTotal(yearMonth) {
  const list = await listExpensesByMonth(yearMonth);
  return list.reduce((sum, e) => sum + e.amount, 0);
}

export async function monthTotalsByCategory(yearMonth) {
  const list = await listExpensesByMonth(yearMonth);
  const map = {};
  for (const e of list) {
    map[e.categoryId] = (map[e.categoryId] || 0) + e.amount;
  }
  return map;
}

export async function recentMonthlyTotals(monthCount) {
  const all = await getAll(STORE_EXPENSES);
  const totals = {};
  for (const e of all) {
    totals[e.yearMonth] = (totals[e.yearMonth] || 0) + e.amount;
  }
  const months = [];
  let cursor = currentYearMonth();
  for (let i = 0; i < monthCount; i++) {
    months.unshift(cursor);
    cursor = shiftYearMonth(cursor, -1);
  }
  return months.map((ym) => ({ yearMonth: ym, total: totals[ym] || 0 }));
}
