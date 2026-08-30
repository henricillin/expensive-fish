import { addSettlement } from "./settlements.js";
import { todayISO } from "./expenses.js";
import { openModal, closeModal, showToast, escapeHtml } from "./ui.js";

let currentPersonId = null;
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    title: document.getElementById("settle-modal-title"),
    amount: document.getElementById("settle-amount"),
    direction: document.getElementById("settle-direction"),
    date: document.getElementById("settle-date"),
    note: document.getElementById("settle-note"),
    save: document.getElementById("settle-save"),
    cancel: document.getElementById("settle-cancel"),
  };
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, cancel } = els();

  save.addEventListener("click", async () => {
    const { amount, direction, date, note } = els();
    const amt = Number(amount.value);
    if (!amt || amt <= 0) {
      showToast("請輸入有效金額");
      return;
    }
    await addSettlement({
      personId: currentPersonId,
      amount: amt,
      type: direction.value,
      date: date.value || todayISO(),
      note: note.value,
    });
    closeModal("settle-modal");
    showToast("已登記");
    onDoneCallback && onDoneCallback();
  });

  cancel.addEventListener("click", () => closeModal("settle-modal"));
}

export function openSettleModal(person, balance, onDone) {
  wire();
  currentPersonId = person.id;
  onDoneCallback = onDone;
  const { title, amount, direction, date, note } = els();
  title.textContent = `登記結清：${escapeHtml(person.name)}`;
  amount.value = Math.abs(balance.net) || "";
  direction.value = balance.net >= 0 ? "receive" : "pay";
  date.value = todayISO();
  note.value = "";
  openModal("settle-modal");
}
