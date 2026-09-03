/* 方案裡的結清：誰付給誰多少。牽涉到我的那幾筆，也會沖掉「分帳總覽」的欠款。 */
import { addTripSettlement, tripMembers } from "./trips.js";
import { todayISO } from "./expenses.js";
import { ME } from "./people.js";
import { openModal, closeModal, showToast, escapeHtml } from "./ui.js";

let currentTrip = null;
let members = { options: [ME] };
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    from: document.getElementById("trip-settle-from"),
    to: document.getElementById("trip-settle-to"),
    amount: document.getElementById("trip-settle-amount"),
    date: document.getElementById("trip-settle-date"),
    note: document.getElementById("trip-settle-note"),
    save: document.getElementById("trip-settle-save"),
    cancel: document.getElementById("trip-settle-cancel"),
  };
}

function renderPeopleSelects(fromId, toId) {
  const { from, to } = els();
  const options = members.options
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  from.innerHTML = options;
  to.innerHTML = options;
  const has = (id) => members.options.some((p) => p.id === id);
  /* 共享方案裡「我」是自己認領的成員 id */
  const meId = members.meId || ME.id;
  from.value = has(fromId) ? fromId : meId;
  to.value = has(toId) && toId !== from.value ? toId : members.options.find((p) => p.id !== from.value)?.id || meId;
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, cancel } = els();

  save.addEventListener("click", async () => {
    const { from, to, amount, date, note } = els();
    try {
      await addTripSettlement({
        tripId: currentTrip.id,
        fromId: from.value,
        toId: to.value,
        amount: amount.value,
        date: date.value || todayISO(),
        note: note.value,
      });
      closeModal("trip-settle-modal");
      showToast("已登記結清");
      onDoneCallback && onDoneCallback();
    } catch (err) {
      showToast(err.message);
    }
  });

  cancel.addEventListener("click", () => closeModal("trip-settle-modal"));
}

export async function openTripSettleModal(trip, transfer, onDone) {
  wire();
  currentTrip = trip;
  onDoneCallback = onDone;
  members = await tripMembers(trip);
  const { amount, date, note } = els();
  renderPeopleSelects(transfer?.fromId, transfer?.toId);
  amount.value = transfer?.amount || "";
  date.value = todayISO();
  note.value = "";
  openModal("trip-settle-modal");
}
