/* 評分 — food & drink scores across every record. */
import { categoryMap } from "../categories.js";
import { listRatedExpenses, listPendingRatings } from "../expenses.js";
import { formatMoney, escapeHtml } from "../ui.js";
import { icon, iconBadge } from "../icons.js";
import { starsStatic } from "../rating.js";
import { openExpenseEditor } from "../expenseModal.js";

export const elementId = "view-ratings";
export const title = "美食評分";

let sortMode = "rating";
let wired = false;

function els() {
  return {
    count: document.getElementById("ratings-count"),
    average: document.getElementById("ratings-average"),
    pending: document.getElementById("ratings-pending"),
    pendingSection: document.getElementById("ratings-pending-section"),
    pendingList: document.getElementById("ratings-pending-list"),
    sort: document.getElementById("ratings-sort"),
    categoryFilter: document.getElementById("ratings-category-filter"),
    minFilter: document.getElementById("ratings-min-filter"),
    list: document.getElementById("ratings-list"),
  };
}

function rowHtml(expense, cat, { showStars = true } = {}) {
  return `<div class="record-item" data-id="${expense.id}">
    ${iconBadge(cat.icon, cat.color)}
    <div class="meta">
      <div class="name">${escapeHtml(expense.note || cat.name)}</div>
      <div class="sub">${expense.date} · ${escapeHtml(cat.name)} ${showStars ? starsStatic(expense.rating, { size: 13 }) : ""}</div>
    </div>
    <div class="amount">${formatMoney(expense.amount)}</div>
  </div>`;
}

function wireRows(container, expenses, onDone) {
  container.querySelectorAll(".record-item").forEach((row) => {
    row.addEventListener("click", () => {
      const expense = expenses.find((e) => e.id === Number(row.dataset.id));
      if (expense) openExpenseEditor(expense, onDone);
    });
  });
}

async function populateCategoryFilter(ratableCats) {
  const { categoryFilter } = els();
  const prev = categoryFilter.value || "all";
  categoryFilter.innerHTML =
    `<option value="all">全部分類</option>` +
    ratableCats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  if ([...categoryFilter.options].some((o) => o.value === prev)) categoryFilter.value = prev;
}

async function render() {
  const { count, average, pending, pendingSection, pendingList, categoryFilter, minFilter, list } = els();
  const { cats, get } = await categoryMap();
  const ratableCats = cats.filter((c) => c.ratable);
  const ratableIds = new Set(ratableCats.map((c) => c.id));

  await populateCategoryFilter(ratableCats);

  const rated = await listRatedExpenses();
  const pendingItems = (await listPendingRatings(ratableIds)).slice(0, 6);

  count.textContent = String(rated.length);
  average.textContent = rated.length
    ? (rated.reduce((s, e) => s + Number(e.rating), 0) / rated.length).toFixed(1)
    : "–";
  pending.textContent = String(pendingItems.length);

  if (pendingItems.length) {
    pendingSection.hidden = false;
    pendingList.innerHTML = pendingItems.map((e) => rowHtml(e, get(e.categoryId), { showStars: false })).join("");
    wireRows(pendingList, pendingItems, render);
  } else {
    pendingSection.hidden = true;
  }

  const catFilter = categoryFilter.value;
  const min = Number(minFilter.value) || 0;
  let shown = rated.filter((e) => (catFilter === "all" || e.categoryId === catFilter) && e.rating >= min);
  shown = shown.sort((a, b) =>
    sortMode === "rating"
      ? b.rating - a.rating || b.date.localeCompare(a.date)
      : b.date.localeCompare(a.date) || b.rating - a.rating
  );

  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-icon">${icon("star", { size: 24 })}</span>
      <div>還沒有評分記錄。<br />記帳時選食物或飲料分類，就能打星星。</div>
    </div>`;
    return;
  }

  if (sortMode === "rating") {
    let html = "";
    for (let score = 5; score >= 1; score--) {
      const group = shown.filter((e) => e.rating === score);
      if (!group.length) continue;
      html += `<div class="day-group-label">${starsStatic(score, { size: 13 })}</div>`;
      html += group.map((e) => rowHtml(e, get(e.categoryId), { showStars: false })).join("");
    }
    list.innerHTML = html;
  } else {
    list.innerHTML = shown.map((e) => rowHtml(e, get(e.categoryId))).join("");
  }
  wireRows(list, shown, render);
}

function wire() {
  if (wired) return;
  wired = true;
  const { sort, categoryFilter, minFilter } = els();
  sort.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      sortMode = btn.dataset.sort;
      sort.querySelectorAll("button").forEach((b) => b.classList.toggle("selected", b === btn));
      render();
    });
  });
  categoryFilter.addEventListener("change", render);
  minFilter.addEventListener("change", render);
}

export async function onShow() {
  wire();
  await render();
}
