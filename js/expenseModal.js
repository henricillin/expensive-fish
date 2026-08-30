import { listCategories } from "./categories.js";
import { updateExpense, deleteExpense } from "./expenses.js";
import { openModal, closeModal, showToast } from "./ui.js";
import { starsInput, wireStars, getStars, RATING_LABELS } from "./rating.js";

let onDoneCallback = null;
let currentId = null;
let categories = [];
let wired = false;

function els() {
  return {
    amount: document.getElementById("edit-amount"),
    category: document.getElementById("edit-category"),
    date: document.getElementById("edit-date"),
    note: document.getElementById("edit-note"),
    save: document.getElementById("edit-save"),
    del: document.getElementById("edit-delete"),
    cancel: document.getElementById("edit-cancel"),
    splitNote: document.getElementById("edit-split-note"),
    ratingBox: document.getElementById("edit-rating-box"),
    ratingStars: document.getElementById("edit-rating-stars"),
    ratingLabel: document.getElementById("edit-rating-label"),
  };
}

async function populateCategories(selectedId) {
  const { category } = els();
  categories = await listCategories();
  category.innerHTML = categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  category.value = categories.some((c) => c.id === selectedId) ? selectedId : categories[0]?.id;
}

function renderRating(value) {
  const { ratingBox, ratingStars, ratingLabel, category } = els();
  const cat = categories.find((c) => c.id === category.value);
  const ratable = Boolean(cat && cat.ratable);
  ratingBox.hidden = !ratable;
  if (!ratable) return;
  ratingStars.innerHTML = starsInput(value);
  ratingLabel.textContent = RATING_LABELS[Number(value) || 0];
  wireStars(ratingStars.querySelector(".stars-input"), (v) => {
    ratingLabel.textContent = RATING_LABELS[v];
  });
}

function currentRating() {
  const box = document.querySelector("#edit-rating-stars .stars-input");
  const { ratingBox } = els();
  if (ratingBox.hidden || !box) return 0;
  return getStars(box);
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel, category } = els();

  category.addEventListener("change", () => renderRating(currentRating()));

  save.addEventListener("click", async () => {
    const { amount, date, note } = els();
    const amt = Number(amount.value);
    if (!amt || amt <= 0) {
      showToast("請輸入有效金額");
      return;
    }
    if (!date.value) {
      showToast("請選擇日期");
      return;
    }
    await updateExpense(currentId, {
      amount: amt,
      categoryId: category.value,
      date: date.value,
      note: note.value,
      rating: currentRating(),
    });
    closeModal("expense-modal");
    showToast("已儲存");
    onDoneCallback && onDoneCallback();
  });

  del.addEventListener("click", async () => {
    if (!confirm("確定要刪除這筆記錄嗎？")) return;
    await deleteExpense(currentId);
    closeModal("expense-modal");
    showToast("已刪除");
    onDoneCallback && onDoneCallback();
  });

  cancel.addEventListener("click", () => closeModal("expense-modal"));
}

export async function openExpenseEditor(expense, onDone) {
  wire();
  onDoneCallback = onDone;
  currentId = expense.id;
  const { amount, date, note, splitNote } = els();
  amount.value = expense.amount;
  date.value = expense.date;
  note.value = expense.note || "";
  if (expense.split) {
    splitNote.hidden = false;
    splitNote.textContent = `這筆是分帳的一部分（共 ${expense.split.shares.length} 人，帳單總額 $${expense.split.totalAmount}）。這裡的金額只代表你的份，修改不會重新計算分帳，請到「分帳總覽」調整。`;
  } else {
    splitNote.hidden = true;
  }
  await populateCategories(expense.categoryId);
  renderRating(expense.rating || 0);
  openModal("expense-modal");
}
