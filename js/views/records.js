import { listCategories } from "../categories.js";
import { listExpenses, formatYearMonthLabel } from "../expenses.js";
import { formatMoney, escapeHtml } from "../ui.js";
import { openExpenseEditor } from "../expenseModal.js";

export const elementId = "view-records";

let wired = false;

function els() {
  return {
    monthFilter: document.getElementById("records-month-filter"),
    categoryFilter: document.getElementById("records-category-filter"),
    list: document.getElementById("records-list"),
  };
}

function groupByDate(expenses) {
  const groups = new Map();
  for (const e of expenses) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  return groups;
}

async function renderList() {
  const { monthFilter, categoryFilter, list } = els();
  const cats = await listCategories();
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  let all = await listExpenses();

  const month = monthFilter.value;
  const category = categoryFilter.value;
  if (month !== "all") all = all.filter((e) => e.yearMonth === month);
  if (category !== "all") all = all.filter((e) => e.categoryId === category);

  if (!all.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span>沒有符合條件的記錄</div>`;
    return;
  }

  const groups = groupByDate(all);
  let html = "";
  for (const [date, items] of groups) {
    html += `<div class="day-group-label">${date}</div>`;
    for (const e of items) {
      const c = catMap[e.categoryId] || { icon: "🏷️", name: "未分類" };
      html += `<div class="record-item" data-id="${e.id}">
        <div class="emoji">${c.icon}</div>
        <div class="meta">
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="sub">${escapeHtml(e.note || "")}</div>
        </div>
        <div class="amount">${formatMoney(e.amount)}</div>
      </div>`;
    }
  }
  list.innerHTML = html;
  list.querySelectorAll(".record-item").forEach((row) => {
    row.addEventListener("click", async () => {
      const id = Number(row.dataset.id);
      const expense = all.find((e) => e.id === id);
      openExpenseEditor(expense, refresh);
    });
  });
}

async function populateFilters() {
  const { monthFilter, categoryFilter } = els();
  const all = await listExpenses();
  const cats = await listCategories();

  const months = [...new Set(all.map((e) => e.yearMonth))].sort().reverse();
  const prevMonth = monthFilter.value || "all";
  monthFilter.innerHTML =
    `<option value="all">全部月份</option>` +
    months.map((m) => `<option value="${m}">${formatYearMonthLabel(m)}</option>`).join("");
  if ([...monthFilter.options].some((o) => o.value === prevMonth)) monthFilter.value = prevMonth;

  const prevCat = categoryFilter.value || "all";
  categoryFilter.innerHTML =
    `<option value="all">全部分類</option>` +
    cats.map((c) => `<option value="${c.id}">${c.icon} ${escapeHtml(c.name)}</option>`).join("");
  if ([...categoryFilter.options].some((o) => o.value === prevCat)) categoryFilter.value = prevCat;
}

async function refresh() {
  await populateFilters();
  await renderList();
}

function wire() {
  if (wired) return;
  wired = true;
  const { monthFilter, categoryFilter } = els();
  monthFilter.addEventListener("change", renderList);
  categoryFilter.addEventListener("change", renderList);
}

export async function onShow() {
  wire();
  await refresh();
}
