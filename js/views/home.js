import { listCategories } from "../categories.js";
import { createExpense, listExpenses, todayISO } from "../expenses.js";
import { showToast, formatMoney, escapeHtml } from "../ui.js";
import { openExpenseEditor } from "../expenseModal.js";
import { openSplitModal } from "../splitModal.js";

export const elementId = "view-home";

let selectedCategoryId = null;
let currentSplit = null;
let wired = false;

function els() {
  return {
    amount: document.getElementById("home-amount"),
    splitToggle: document.getElementById("home-split-toggle"),
    splitSummary: document.getElementById("home-split-summary"),
    grid: document.getElementById("home-category-grid"),
    date: document.getElementById("home-date"),
    note: document.getElementById("home-note"),
    save: document.getElementById("home-save"),
    recent: document.getElementById("home-recent-list"),
  };
}

function renderSplitSummary() {
  const { amount, splitSummary, splitToggle } = els();
  if (currentSplit) {
    amount.value = currentSplit.myShare;
    amount.readOnly = true;
    splitSummary.innerHTML = `已分帳（共 ${currentSplit.shares.length} 人）· <a href="#" id="home-split-clear">取消分帳</a>`;
    splitToggle.textContent = "🧑‍🤝‍🧑 編輯分帳";
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
    splitToggle.textContent = "🧑‍🤝‍🧑 與人分帳";
  }
}

async function renderCategoryGrid() {
  const { grid } = els();
  const cats = await listCategories();
  if (!selectedCategoryId && cats.length) selectedCategoryId = cats[0].id;
  grid.innerHTML = cats
    .map(
      (c) => `<button type="button" class="category-chip ${c.id === selectedCategoryId ? "selected" : ""}" data-id="${c.id}">
        <span class="emoji">${c.icon}</span><span>${escapeHtml(c.name)}</span>
      </button>`
    )
    .join("");
  grid.querySelectorAll(".category-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCategoryId = btn.dataset.id;
      renderCategoryGrid();
    });
  });
}

async function renderRecent() {
  const { recent } = els();
  const cats = await listCategories();
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const all = (await listExpenses()).slice(0, 5);
  if (!all.length) {
    recent.innerHTML = `<div class="empty-state"><span class="emoji">🧾</span>還沒有任何記錄，開始記第一筆吧！</div>`;
    return;
  }
  recent.innerHTML = all
    .map((e) => {
      const c = catMap[e.categoryId] || { icon: "🏷️", name: "未分類" };
      return `<div class="record-item" data-id="${e.id}">
        <div class="emoji">${c.icon}</div>
        <div class="meta">
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="sub">${e.date}${e.note ? " · " + escapeHtml(e.note) : ""}</div>
        </div>
        <div class="amount">${formatMoney(e.amount)}</div>
      </div>`;
    })
    .join("");
  recent.querySelectorAll(".record-item").forEach((row) => {
    row.addEventListener("click", async () => {
      const id = Number(row.dataset.id);
      const expense = all.find((e) => e.id === id);
      openExpenseEditor(expense, onShow);
    });
  });
}

function wireForm() {
  if (wired) return;
  wired = true;
  const { amount, date, note, save, splitToggle } = els();

  splitToggle.addEventListener("click", () => {
    openSplitModal({ prefillTotal: currentSplit ? currentSplit.totalAmount : amount.value, existingSplit: currentSplit }, (result) => {
      currentSplit = result;
      renderSplitSummary();
    });
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
      split: currentSplit
        ? { totalAmount: currentSplit.totalAmount, payerId: currentSplit.payerId, shares: currentSplit.shares }
        : null,
    });
    amount.value = "";
    note.value = "";
    currentSplit = null;
    renderSplitSummary();
    showToast("已記錄一筆");
    renderRecent();
  });
}

export async function onShow() {
  const { date } = els();
  if (!date.value) date.value = todayISO();
  wireForm();
  renderSplitSummary();
  await renderCategoryGrid();
  await renderRecent();
}
