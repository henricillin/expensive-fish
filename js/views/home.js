import { listCategories, categoryMap } from "../categories.js";
import { createExpense, listExpenses, todayISO } from "../expenses.js";
import { showToast, formatMoney, escapeHtml } from "../ui.js";
import { openExpenseEditor } from "../expenseModal.js";
import { openSplitModal } from "../splitModal.js";
import { icon, iconBadge } from "../icons.js";
import { starsInput, wireStars, getStars, starsStatic, RATING_LABELS } from "../rating.js";
import { initSummary, renderSummary } from "../summary.js";

export const elementId = "view-home";
export const title = "記一筆";

let selectedCategoryId = null;
let currentSplit = null;
let categories = [];
let wired = false;

function els() {
  return {
    amount: document.getElementById("home-amount"),
    splitToggle: document.getElementById("home-split-toggle"),
    splitSummary: document.getElementById("home-split-summary"),
    grid: document.getElementById("home-category-grid"),
    ratingBox: document.getElementById("home-rating-box"),
    ratingStars: document.getElementById("home-rating-stars"),
    ratingLabel: document.getElementById("home-rating-label"),
    date: document.getElementById("home-date"),
    note: document.getElementById("home-note"),
    save: document.getElementById("home-save"),
    recent: document.getElementById("home-recent-list"),
  };
}

function selectedCategory() {
  return categories.find((c) => c.id === selectedCategoryId) || null;
}

function renderRatingBox(value = 0) {
  const { ratingBox, ratingStars, ratingLabel, note } = els();
  const cat = selectedCategory();
  const ratable = Boolean(cat && cat.ratable);
  ratingBox.hidden = !ratable;
  note.placeholder = ratable ? "店名、品項…" : "備註…";
  if (!ratable) return;
  ratingStars.innerHTML = starsInput(value);
  ratingLabel.textContent = RATING_LABELS[value];
  wireStars(ratingStars.querySelector(".stars-input"), (v) => {
    ratingLabel.textContent = RATING_LABELS[v];
  });
}

function currentRating() {
  const box = document.querySelector("#home-rating-stars .stars-input");
  const cat = selectedCategory();
  if (!cat || !cat.ratable || !box) return 0;
  return getStars(box);
}

function renderSplitSummary() {
  const { amount, splitSummary, splitToggle } = els();
  if (currentSplit) {
    amount.value = currentSplit.myShare;
    amount.readOnly = true;
    splitSummary.innerHTML = `已分帳（共 ${currentSplit.shares.length} 人）· <a href="#" id="home-split-clear">取消</a>`;
    splitToggle.innerHTML = `${icon("users", { size: 18 })}<span>編輯分帳</span>`;
    document.getElementById("home-split-clear").addEventListener("click", (ev) => {
      ev.preventDefault();
      currentSplit = null;
      amount.value = "";
      amount.readOnly = false;
      renderSplitSummary();
    });
  } else {
    amount.readOnly = false;
    splitSummary.textContent = "";
    splitToggle.innerHTML = `${icon("users", { size: 18 })}<span>與人分帳</span>`;
  }
}

async function renderCategoryGrid() {
  const { grid } = els();
  categories = await listCategories();
  if (!categories.some((c) => c.id === selectedCategoryId)) {
    selectedCategoryId = categories.length ? categories[0].id : null;
  }
  grid.innerHTML = categories
    .map(
      (c) => `<button type="button" class="category-chip ${c.id === selectedCategoryId ? "selected" : ""}" data-id="${c.id}">
        ${iconBadge(c.icon, c.color, { size: 36, iconSize: 20 })}
        <span class="chip-name">${escapeHtml(c.name)}</span>
      </button>`
    )
    .join("");
  grid.querySelectorAll(".category-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategoryId = btn.dataset.id;
      grid.querySelectorAll(".category-chip").forEach((b) => {
        b.classList.toggle("selected", b.dataset.id === selectedCategoryId);
      });
      renderRatingBox(currentRating());
    });
  });
  renderRatingBox(currentRating());
}

async function renderRecent() {
  const { recent } = els();
  const { get } = await categoryMap();
  const all = (await listExpenses()).slice(0, 5);
  if (!all.length) {
    recent.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon("inbox", { size: 24 })}</span><div>還沒有任何記錄，從上面記第一筆吧！</div></div>`;
    return;
  }
  recent.innerHTML = all
    .map((e) => {
      const c = get(e.categoryId);
      return `<div class="record-item" data-id="${e.id}">
        ${iconBadge(c.icon, c.color)}
        <div class="meta">
          <div class="name">${escapeHtml(e.note || c.name)}</div>
          <div class="sub">${e.date}${e.note ? " · " + escapeHtml(c.name) : ""} ${starsStatic(e.rating, { size: 12 })}</div>
        </div>
        <div class="amount">${formatMoney(e.amount)}</div>
      </div>`;
    })
    .join("");
  recent.querySelectorAll(".record-item").forEach((row) => {
    row.addEventListener("click", () => {
      const expense = all.find((e) => e.id === Number(row.dataset.id));
      openExpenseEditor(expense, onShow);
    });
  });
}

function wireForm() {
  if (wired) return;
  wired = true;
  const { amount, date, note, save, splitToggle } = els();

  splitToggle.addEventListener("click", () => {
    openSplitModal(
      { prefillTotal: currentSplit ? currentSplit.totalAmount : amount.value, existingSplit: currentSplit },
      (result) => {
        currentSplit = result;
        renderSplitSummary();
      }
    );
  });

  save.addEventListener("click", async () => {
    const amt = Number(amount.value);
    if (!amt || amt <= 0) {
      showToast("請輸入有效金額");
      return;
    }
    if (!selectedCategoryId) {
      showToast("請選擇分類");
      return;
    }
    await createExpense({
      amount: amt,
      categoryId: selectedCategoryId,
      date: date.value || todayISO(),
      note: note.value,
      rating: currentRating(),
      split: currentSplit
        ? { totalAmount: currentSplit.totalAmount, payerId: currentSplit.payerId, shares: currentSplit.shares }
        : null,
    });
    amount.value = "";
    note.value = "";
    currentSplit = null;
    renderSplitSummary();
    renderRatingBox(0);
    showToast("已記錄一筆");
    await renderRecent();
    await renderSummary();
  });
}

export async function onShow() {
  const { date } = els();
  if (!date.value) date.value = todayISO();
  wireForm();
  initSummary();
  renderSplitSummary();
  await renderCategoryGrid();
  await renderSummary();
  await renderRecent();
}
