/* 方案裡的一筆花費：總金額、誰先付、怎麼分、收據照片。
   存進支出時，amount 只放「我的份」，總額留在 split 裡，月結算才不會被別人的份灌水。 */
import { listCategories } from "./categories.js";
import { createExpense, updateExpense, deleteExpense, todayISO } from "./expenses.js";
import { tripMembers } from "./trips.js";
import { ME } from "./people.js";
import { openModal, closeModal, showToast, formatMoney, escapeHtml } from "./ui.js";
import { sharesFor, sumShares } from "./split.js";
import {
  participantRow,
  splitMethodFields,
  restoreSplitMethod,
  updateShareAmounts,
} from "./splitUI.js";
import { mountReceiptField } from "./receiptField.js";

let currentTrip = null;
let editingExpense = null;
let onDoneCallback = null;
let members = { options: [ME], ids: [ME.id] };
let selected = new Set([ME.id]);
let method = "equal";
let customAmounts = {};
let weights = {};
let receiptField = null;
let wired = false;

function els() {
  return {
    title: document.getElementById("trip-expense-title"),
    note: document.getElementById("trip-expense-note"),
    total: document.getElementById("trip-expense-total"),
    category: document.getElementById("trip-expense-category"),
    date: document.getElementById("trip-expense-date"),
    payer: document.getElementById("trip-expense-payer"),
    participants: document.getElementById("trip-expense-participants"),
    methodBtns: document.querySelectorAll("#trip-expense-modal .method-btn"),
    summary: document.getElementById("trip-expense-summary"),
    receipt: document.getElementById("trip-expense-receipt"),
    save: document.getElementById("trip-expense-save"),
    del: document.getElementById("trip-expense-delete"),
    cancel: document.getElementById("trip-expense-cancel"),
  };
}

function currentShares() {
  return sharesFor({
    method,
    total: Number(els().total.value) || 0,
    ids: [...selected],
    customAmounts,
    weights,
  });
}

function renderPayer(selectedId) {
  const { payer } = els();
  payer.innerHTML = members.options
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  payer.value = members.options.some((p) => p.id === selectedId) ? selectedId : ME.id;
}

async function renderCategories(selectedId) {
  const { category } = els();
  const cats = await listCategories();
  category.innerHTML = cats
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join("");
  category.value = cats.some((c) => c.id === selectedId) ? selectedId : cats[0]?.id || "";
}

function renderParticipants() {
  const { participants } = els();
  const shares = currentShares();
  participants.innerHTML = members.options
    .map((p) => participantRow(p, selected.has(p.id), method, shares, customAmounts, weights))
    .join("");

  participants.querySelectorAll(".share-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.id);
      else selected.delete(cb.dataset.id);
      renderParticipants();
      renderSummary();
    });
  });

  participants.querySelectorAll(".share-input").forEach((input) => {
    input.addEventListener("input", () => {
      customAmounts[input.dataset.id] = input.value;
      renderSummary();
    });
  });

  participants.querySelectorAll(".share-weight").forEach((input) => {
    input.addEventListener("input", () => {
      weights[input.dataset.id] = input.value;
      updateShareAmounts(participants, currentShares(), selected);
      renderSummary();
    });
  });
}

function renderSummary() {
  const { summary, total } = els();
  const totalAmount = Number(total.value) || 0;
  const shares = currentShares();
  const sum = sumShares(shares, [...selected]);
  if (method === "custom" && sum !== totalAmount) {
    summary.innerHTML = `<span style="color:var(--color-danger)">已分配 ${formatMoney(sum)}，與總額 ${formatMoney(totalAmount)} 不符</span>`;
  } else {
    summary.innerHTML = `<span>我的份：${formatMoney(shares[ME.id] || 0)}</span><span>${selected.size} 人分</span>`;
  }
}

function wire() {
  if (wired) return;
  wired = true;
  const { total, methodBtns, save, del, cancel, receipt } = els();

  receiptField = mountReceiptField(receipt);

  total.addEventListener("input", () => {
    renderParticipants();
    renderSummary();
  });

  methodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      method = btn.dataset.method;
      methodBtns.forEach((b) => b.classList.toggle("selected", b === btn));
      renderParticipants();
      renderSummary();
    });
  });

  save.addEventListener("click", async () => {
    const { note, total: totalEl, category, date } = els();
    const totalAmount = Number(totalEl.value);
    if (!totalAmount || totalAmount <= 0) {
      showToast("請輸入總金額");
      return;
    }
    if (!selected.size) {
      showToast("請選擇至少一位分攤的人");
      return;
    }
    const shares = currentShares();
    const sum = sumShares(shares, [...selected]);
    if (method === "custom" && sum !== totalAmount) {
      showToast("自訂金額加總要等於總金額");
      return;
    }
    const split = {
      totalAmount,
      payerId: els().payer.value,
      shares: [...selected].map((id) => ({ personId: id, amount: shares[id] || 0 })),
      ...splitMethodFields(method, selected, weights),
    };
    const payload = {
      amount: shares[ME.id] || 0,
      categoryId: category.value,
      date: date.value || todayISO(),
      note: note.value,
      split,
    };
    /* 新增時要先有 id 才存得了收據，所以照片一律在支出寫完之後才 commit */
    const saved = editingExpense
      ? await updateExpense(editingExpense.id, payload)
      : await createExpense({ ...payload, tripId: currentTrip.id });
    await receiptField.commit(saved.id);
    closeModal("trip-expense-modal");
    showToast(editingExpense ? "已儲存" : "已記一筆");
    onDoneCallback && onDoneCallback();
  });

  del.addEventListener("click", async () => {
    if (!editingExpense) return;
    if (!confirm("確定要刪除這筆花費嗎？")) return;
    await deleteExpense(editingExpense.id);
    closeModal("trip-expense-modal");
    showToast("已刪除");
    onDoneCallback && onDoneCallback();
  });

  cancel.addEventListener("click", () => closeModal("trip-expense-modal"));
}

/* 記在方案的日期範圍裡：今天在範圍內就用今天，否則貼齊出發／結束日。 */
function defaultDate(trip) {
  const today = todayISO();
  if (trip.startDate && today < trip.startDate) return trip.startDate;
  if (trip.endDate && today > trip.endDate) return trip.endDate;
  return today;
}

export async function openTripExpenseModal(trip, expense, onDone) {
  wire();
  currentTrip = trip;
  editingExpense = expense || null;
  onDoneCallback = onDone;
  members = await tripMembers(trip);

  const { title, note, total, date, del, methodBtns } = els();
  if (editingExpense) {
    const split = editingExpense.split;
    title.textContent = "編輯花費";
    note.value = editingExpense.note || "";
    total.value = split ? split.totalAmount : editingExpense.amount;
    date.value = editingExpense.date;
    selected = new Set(split ? split.shares.map((s) => s.personId) : [ME.id]);
    customAmounts = split
      ? Object.fromEntries(split.shares.map((s) => [s.personId, s.amount]))
      : {};
    ({ method, weights } = restoreSplitMethod(split));
    del.hidden = false;
    await renderCategories(editingExpense.categoryId);
    renderPayer(split ? split.payerId : ME.id);
  } else {
    title.textContent = "新增花費";
    note.value = "";
    total.value = "";
    date.value = defaultDate(trip);
    selected = new Set(members.ids);
    customAmounts = {};
    weights = {};
    method = "equal";
    del.hidden = true;
    await renderCategories(null);
    renderPayer(ME.id);
  }

  methodBtns.forEach((b) => b.classList.toggle("selected", b.dataset.method === method));
  renderParticipants();
  renderSummary();
  await receiptField.load(editingExpense ? editingExpense.id : null);
  openModal("trip-expense-modal");
}
