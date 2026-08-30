import { listPeople, ME } from "./people.js";
import { openModal, closeModal, showToast, formatMoney, escapeHtml } from "./ui.js";
import { openPersonCreator } from "./personModal.js";

let onApplyCallback = null;
let wired = false;
let selected = new Set([ME.id]);
let method = "equal";
let customAmounts = {};
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

function equalShares(total, ids) {
  const n = ids.length;
  if (n === 0) return {};
  const base = Math.floor(total / n);
  let remainder = Math.round(total - base * n);
  const shares = {};
  ids.forEach((id, i) => {
    shares[id] = base + (i < remainder ? 1 : 0);
  });
  return shares;
}

function currentShares() {
  const total = Number(els().total.value) || 0;
  const ids = [...selected];
  if (method === "equal") {
    return equalShares(total, ids);
  }
  const shares = {};
  for (const id of ids) shares[id] = Number(customAmounts[id]) || 0;
  return shares;
}

function renderPayerSelect() {
  const { payer } = els();
  const prev = payer.value;
  payer.innerHTML = allPeople.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  payer.value = allPeople.some((p) => p.id === prev) ? prev : ME.id;
}

function renderParticipants() {
  const { participants } = els();
  const shares = method === "custom" ? null : currentShares();
  participants.innerHTML = allPeople
    .map((p) => {
      const checked = selected.has(p.id);
      const amountField =
        method === "custom"
          ? `<input type="number" inputmode="decimal" min="0" step="1" class="split-amount-input" data-id="${p.id}" value="${customAmounts[p.id] ?? ""}" placeholder="0" ${checked ? "" : "disabled"} style="width:80px;text-align:right;border:1px solid var(--color-border);border-radius:8px;padding:6px 8px;" />`
          : `<span style="width:80px;text-align:right;display:inline-block;">${checked ? formatMoney(shares[p.id] || 0) : ""}</span>`;
      return `<div class="card-row" style="padding:6px 0;">
        <label style="display:flex;align-items:center;gap:8px;flex-shrink:0;white-space:nowrap;">
          <input type="checkbox" class="split-participant-check" data-id="${p.id}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(p.name)}</span>
        </label>
        ${amountField}
      </div>`;
    })
    .join("");

  participants.querySelectorAll(".split-participant-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(cb.dataset.id);
      else selected.delete(cb.dataset.id);
      renderParticipants();
      renderSummary();
    });
  });

  participants.querySelectorAll(".split-amount-input").forEach((input) => {
    input.addEventListener("input", () => {
      customAmounts[input.dataset.id] = input.value;
      renderSummary();
    });
  });
}

function renderSummary() {
  const { summary, total } = els();
  const totalAmount = Number(total.value) || 0;
  const shares = currentShares();
  const sum = [...selected].reduce((s, id) => s + (shares[id] || 0), 0);
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
    const sum = [...selected].reduce((s, id) => s + (shares[id] || 0), 0);
    if (method === "custom" && sum !== totalAmount) {
      showToast("自訂金額加總要等於帳單總額");
      return;
    }
    const payerId = els().payer.value;
    const shareList = [...selected].map((id) => ({ personId: id, amount: shares[id] || 0 }));
    const myShare = shares[ME.id] || 0;
    closeModal("split-modal");
    onApplyCallback && onApplyCallback({ totalAmount, payerId, shares: shareList, myShare });
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
    method = "custom";
  } else {
    selected = new Set([ME.id]);
    customAmounts = {};
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
