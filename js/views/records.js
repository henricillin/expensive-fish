import { listCategories, categoryMap } from "../categories.js";
import { listExpenses, formatYearMonthLabel } from "../expenses.js";
import { formatMoney, escapeHtml } from "../ui.js";
import { openExpenseEditor } from "../expenseModal.js";
import { icon, iconBadge } from "../icons.js";
import { starsStatic } from "../rating.js";
import { currencyTag } from "../currencies.js";

export const elementId = "view-records";
export const title = "消費明細";

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
  const { get } = await categoryMap();
  let all = await listExpenses();

  const month = monthFilter.value;
  const category = categoryFilter.value;
  if (month !== "all") all = all.filter((e) => e.yearMonth === month);
  if (category !== "all") all = all.filter((e) => e.categoryId === category);

  if (!all.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon("search", { size: 24 })}</span><div>沒有符合條件的記錄</div></div>`;
    return;
  }

  const groups = groupByDate(all);
  let html = "";
  for (const [date, items] of groups) {
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    html += `<div class="day-group-label" style="display:flex;justify-content:space-between;"><span>${date}</span><span>${formatMoney(dayTotal)}</span></div>`;
    for (const e of items) {
      const c = get(e.categoryId);
      html += `<div class="record-item" data-id="${e.id}">
        ${iconBadge(c.icon, c.color)}
        <div class="meta">
          <div class="name">${escapeHtml(e.note || c.name)}</div>
          <div class="sub">${escapeHtml(c.name)} ${starsStatic(e.rating, { size: 12 })}</div>
        </div>
        <div class="amount">${formatMoney(e.amount)}${currencyTag(e.currency)}</div>
      </div>`;
    }
  }
  list.innerHTML = html;
  list.querySelectorAll(".record-item").forEach((row) => {
    row.addEventListener("click", () => {
      const expense = all.find((e) => e.id === Number(row.dataset.id));
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
    cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
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
