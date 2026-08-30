import { listCategories } from "./categories.js";
import { updateExpense, deleteExpense } from "./expenses.js";
import { openModal, closeModal, showToast } from "./ui.js";

let onDoneCallback = null;
let currentId = null;
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
  };
}

async function populateCategories(selectedId) {
  const { category } = els();
  const cats = await listCategories();
  category.innerHTML = cats
    .map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`)
    .join("");
  category.value = selectedId;
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel } = els();

  save.addEventListener("click", async () => {
    const { amount, category, date, note } = els();
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
  openModal("expense-modal");
}
