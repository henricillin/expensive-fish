import { listPeople, ME } from "./people.js";
import { openModal, closeModal, showToast, formatMoney, escapeHtml } from "./ui.js";
import { openPersonCreator } from "./personModal.js";
import { sharesFor, sumShares } from "./split.js";
import {
  participantRow,
  splitMethodFields,
  restoreSplitMethod,
  updateShareAmounts,
} from "./splitUI.js";

let onApplyCallback = null;
let wired = false;
let selected = new Set([ME.id]);
let method = "equal";
let customAmounts = {};
let weights = {};
let allPeople = [ME];

function els() {
  return {
    total: document.getElementById("split-total"),
    payer: document.getElementById("split-payer"),
    participants: document.getElementById("split-participants"),
    methodBtns: document.querySelectorAll("#split-modal .method-btn"),
    summary: document.getElementById("split-summary"),
    apply: document.getElementById("split-apply"),
    cancel: document.getElementById("split-cancel"),
    addPerson: document.getElementById("split-modal-add-person"),
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

function renderPayerSelect() {
  const { payer } = els();
  const prev = payer.value;
  payer.innerHTML = allPeople
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  payer.value = allPeople.some((p) => p.id === prev) ? prev : ME.id;
}

function renderParticipants() {
  const { participants } = els();
  const shares = currentShares();
  participants.innerHTML = allPeople
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
  const myShare = shares[ME.id] || 0;
  if (method === "custom" && sum !== totalAmount) {
    summary.innerHTML = `<span style="color:var(--color-danger)">已分配 ${formatMoney(sum)}，與總額 ${formatMoney(totalAmount)} 不符</span>`;
  } else {
    summary.innerHTML = `<span>我的份：${formatMoney(myShare)}</span>`;
  }
}

async function refreshPeople() {
  const people = await listPeople();
  allPeople = [ME, ...people];
}

function wire() {
  if (wired) return;
  wired = true;
  const { total, methodBtns, apply, cancel, addPerson } = els();

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

  addPerson.addEventListener("click", () => {
    openPersonCreator(async (person) => {
      await refreshPeople();
      if (person) selected.add(person.id);
      renderPayerSelect();
      renderParticipants();
      renderSummary();
    });
  });

  apply.addEventListener("click", () => {
    const totalAmount = Number(total.value);
    if (!totalAmount || totalAmount <= 0) {
      showToast("請輸入帳單總額");
      return;
    }
    if (selected.size === 0) {
      showToast("請選擇至少一位分帳對象");
      return;
    }
    const shares = currentShares();
    const sum = sumShares(shares, [...selected]);
    if (method === "custom" && sum !== totalAmount) {
      showToast("自訂金額加總要等於帳單總額");
      return;
    }
    const payerId = els().payer.value;
    const shareList = [...selected].map((id) => ({ personId: id, amount: shares[id] || 0 }));
    const myShare = shares[ME.id] || 0;
    closeModal("split-modal");
    onApplyCallback &&
      onApplyCallback({
        totalAmount,
        payerId,
        shares: shareList,
        myShare,
        ...splitMethodFields(method, selected, weights),
      });
  });

  cancel.addEventListener("click", () => closeModal("split-modal"));
}

export async function openSplitModal({ prefillTotal, existingSplit } = {}, onApply) {
  wire();
  onApplyCallback = onApply;
  await refreshPeople();

  if (existingSplit) {
    selected = new Set(existingSplit.shares.map((s) => s.personId));
    customAmounts = Object.fromEntries(existingSplit.shares.map((s) => [s.personId, s.amount]));
    ({ method, weights } = restoreSplitMethod(existingSplit));
  } else {
    selected = new Set([ME.id]);
    customAmounts = {};
    weights = {};
    method = "equal";
  }

  const { total, methodBtns } = els();
  total.value = existingSplit ? existingSplit.totalAmount : prefillTotal || "";
  methodBtns.forEach((b) => b.classList.toggle("selected", b.dataset.method === method));

  renderPayerSelect();
  if (existingSplit) els().payer.value = existingSplit.payerId;
  renderParticipants();
  renderSummary();
  openModal("split-modal");
}
