/* 一個方案的內容：上面是這趟的概況，主體是算帳；攜帶清單收在一列入口後面，點了才展開。 */
import {
  getTrip,
  computeTripAccounts,
  tripMembers,
  formatTripDates,
  deleteTripSettlement,
  isTripSettled,
  setTripArchived,
} from "../trips.js";
import { receiptIdSet } from "../receipts.js";
import { assignPersonColors } from "../people.js";
import { tint } from "../icons.js";
import {
  listItems,
  addItem,
  toggleItem,
  uncheckAll,
  removeDone,
  progressOf,
  groupByCategory,
  listPackingCategories,
  UNASSIGNED,
} from "../packing.js";
import { fillCategorySelect, wireCategorySelect } from "../packingCategoryField.js";
import { categoryMap } from "../categories.js";
import { escapeHtml, showToast, formatMoney } from "../ui.js";
import { icon, iconBadge } from "../icons.js";
import { openTripEditor } from "../tripModal.js";
import { openPackingItemEditor } from "../packingItemModal.js";
import { openTripExpenseModal } from "../tripExpenseModal.js";
import { openTripSettleModal } from "../tripSettleModal.js";
import { openShareModal } from "../shareModal.js";
import { shareForTrip } from "../shares.js";
import { navigate } from "../router.js";
import { currencyTag } from "../currencies.js";

export const elementId = "view-trip";
export const title = "方案";
export const back = "/trips";

let currentTripId = null;
let currentTrip = null;
let pane = "money";
let groupMode = "item";
let wired = false;
/* 這個方案裡每個人固定用哪個顏色——每次 render() 重算一次，同一次渲染裡到處都能用。 */
let personColors = new Map();

export function setCurrentTrip(id) {
  currentTripId = id;
  pane = "money";
}

function els() {
  return {
    name: document.getElementById("trip-detail-name"),
    dates: document.getElementById("trip-detail-dates"),
    members: document.getElementById("trip-detail-members"),
    editBtn: document.getElementById("trip-detail-edit"),
    shareBtn: document.getElementById("trip-detail-share"),
    claimBanner: document.getElementById("trip-claim-banner"),
    statTotal: document.getElementById("trip-stat-total"),
    statMine: document.getElementById("trip-stat-mine"),
    statNet: document.getElementById("trip-stat-net"),
    statNetLabel: document.getElementById("trip-stat-net-label"),
    paneList: document.getElementById("trip-pane-list"),
    paneMoney: document.getElementById("trip-pane-money"),
    packingEntry: document.getElementById("trip-packing-entry"),
    entryIcon: document.getElementById("trip-packing-entry-icon"),
    entrySub: document.getElementById("trip-packing-entry-sub"),
    entryArrow: document.getElementById("trip-packing-entry-arrow"),
    entryFill: document.getElementById("trip-packing-entry-fill"),
    backToMoney: document.getElementById("trip-back-to-money"),
    progress: document.getElementById("trip-progress"),
    itemCount: document.getElementById("trip-item-count"),
    input: document.getElementById("trip-new-item"),
    newItemCategory: document.getElementById("trip-new-item-category"),
    addItemBtn: document.getElementById("trip-add-item"),
    groupSwitch: document.getElementById("trip-group-mode"),
    itemList: document.getElementById("trip-item-list"),
    uncheckAllBtn: document.getElementById("trip-uncheck-all"),
    clearDoneBtn: document.getElementById("trip-clear-done"),
    addExpenseBtn: document.getElementById("trip-add-expense"),
    moneyBody: document.getElementById("trip-money-body"),
    settledBanner: document.getElementById("trip-settled-banner"),
  };
}

/* ---- 攜帶清單 ---- */

function itemRow(item, personName, categoryName, personId) {
  const color = personId ? personColors.get(personId) : null;
  const personPill = personName
    ? `<span class="person-pill"${color ? ` style="background:${tint(color, 0.16)};color:${color};"` : ""}>${escapeHtml(personName)}</span>`
    : "";
  return `<div class="packing-item${item.done ? " done" : ""}" data-id="${item.id}">
    <button type="button" class="packing-check${item.done ? " checked" : ""}" data-id="${item.id}"
      aria-label="${item.done ? "取消勾選" : "標記已準備"}">${icon("check", { size: 15 })}</button>
    <div class="meta">
      <div class="name">${escapeHtml(item.name)}</div>
      ${item.note ? `<div class="sub">${escapeHtml(item.note)}</div>` : ""}
    </div>
    ${categoryName ? `<span class="person-pill category-pill">${escapeHtml(categoryName)}</span>` : ""}
    ${personPill}
  </div>`;
}

/* 分類分組時項目上就不再掛分類標籤了——標題已經寫著同一個名字。 */
function categoryGroupedHtml(items, categories) {
  let html = "";
  for (const [label, group] of groupByCategory(items, categories)) {
    const { done, total } = progressOf(group);
    html += `<div class="day-group-label">${escapeHtml(label)} ${done}/${total}</div>`;
    html += `<div class="card">${group.map((i) => itemRow(i, "", "")).join("")}</div>`;
  }
  return html;
}

function groupedHtml(items, members) {
  const groups = new Map();
  for (const p of members.options) groups.set(p.id, []);
  groups.set(UNASSIGNED.id, []);
  for (const item of items) {
    const key = groups.has(item.personId) ? item.personId : UNASSIGNED.id;
    groups.get(key).push(item);
  }
  let html = "";
  for (const [id, group] of groups) {
    if (!group.length) continue;
    const { done, total } = progressOf(group);
    const label = id === UNASSIGNED.id ? UNASSIGNED.name : members.get(id).name;
    const dot = id === UNASSIGNED.id ? "" : `<span class="person-dot" style="background:${personColors.get(id)};"></span>`;
    html += `<div class="day-group-label">${dot}${escapeHtml(label)} ${done}/${total}</div>`;
    html += `<div class="card">${group.map((i) => itemRow(i, "", i.category || "")).join("")}</div>`;
  }
  return html;
}

async function renderPacking(members) {
  const { progress, itemCount, itemList, clearDoneBtn, uncheckAllBtn, entrySub, entryFill, newItemCategory } =
    els();
  const items = await listItems(currentTripId);
  /* 選單每次都重填，剛加的分類才會出現；帶著現在選的值進去就不會被重設 */
  await fillCategorySelect(newItemCategory, newItemCategory.value);
  const { total, done } = progressOf(items);
  const pct = total ? Math.round((done / total) * 100) : 0;

  itemCount.textContent = total ? `已準備 ${done} / ${total}` : "還沒有項目";
  progress.style.width = `${pct}%`;
  progress.classList.toggle("done", total > 0 && done === total);

  entrySub.textContent = total ? `已準備 ${done} / ${total}` : "還沒有項目，點進去加";
  entryFill.style.width = `${pct}%`;
  entryFill.classList.toggle("done", total > 0 && done === total);
  clearDoneBtn.disabled = done === 0;
  uncheckAllBtn.disabled = done === 0;

  if (!items.length) {
    itemList.innerHTML = `<div class="empty-state">
      <span class="empty-icon">${icon("inbox", { size: 24 })}</span>
      <div>還沒有東西。<br />在上面打字就能加進來。</div>
    </div>`;
    return;
  }

  if (groupMode === "person") {
    itemList.innerHTML = groupedHtml(items, members);
  } else if (groupMode === "category") {
    itemList.innerHTML = categoryGroupedHtml(items, await listPackingCategories());
  } else {
    const ordered = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
    itemList.innerHTML = `<div class="card">${ordered
      .map((i) => itemRow(i, i.personId ? members.get(i.personId).name : "", i.category || "", i.personId))
      .join("")}</div>`;
  }

  itemList.querySelectorAll(".packing-check").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await toggleItem(Number(btn.dataset.id));
      await render();
    });
  });

  itemList.querySelectorAll(".packing-item").forEach((row) => {
    row.addEventListener("click", () => {
      const item = items.find((i) => i.id === Number(row.dataset.id));
      if (item) openPackingItemEditor(item, currentTrip, render);
    });
  });
}

/* ---- 帳目 ---- */

function expenseListHtml(acc, cats, withReceipt) {
  if (!acc.expenses.length) {
    return `<div class="empty-state">
      <span class="empty-icon">${icon("receipt", { size: 24 })}</span>
      <div>這趟還沒有花費。<br />按右上角「新增花費」記第一筆。</div>
    </div>`;
  }
  const rows = acc.expenses
    .map((e) => {
      const c = cats.get(e.categoryId);
      const split = e.split;
      const payer = split ? acc.members.get(split.payerId).name : "我";
      const count = split ? split.shares.length : 1;
      const total = split ? split.totalAmount : e.amount;
      const receiptMark = withReceipt.has(e.id)
        ? `<span class="receipt-mark" title="有收據">${icon("receipt", { size: 13 })}</span>`
        : "";
      return `<div class="record-item trip-expense-row" data-id="${e.id}">
        ${iconBadge(c.icon, c.color)}
        <div class="meta">
          <div class="name">${escapeHtml(e.note || c.name)}</div>
          <div class="sub">${receiptMark}${e.date} · ${escapeHtml(payer)}先付 · ${count} 人分</div>
        </div>
        <div class="amount">${formatMoney(total)}${currencyTag(e.currency)}<span class="amount-sub">我的份 ${formatMoney(e.amount)}</span></div>
      </div>`;
    })
    .join("");
  return `<div class="card">${rows}</div>`;
}

function balanceHtml(acc) {
  const rows = acc.rows.filter((r) => r.paid || r.share);
  if (!rows.length) return "";
  const list = rows
    .map((r) => {
      const label =
        r.net > 0
          ? `<span class="over-label">要收回 ${formatMoney(r.net)}</span>`
          : r.net < 0
            ? `<span class="owe-label">要付出 ${formatMoney(-r.net)}</span>`
            : `<span style="color:var(--color-text-muted);">已平</span>`;
      return `<div class="balance-row">
        <span class="name"><span class="person-dot" style="background:${personColors.get(r.id)};"></span>${escapeHtml(r.name)}</span>
        <span class="sub">付了 ${formatMoney(r.paid)} · 該分 ${formatMoney(r.share)}</span>
        ${label}
      </div>`;
    })
    .join("");
  return `<div class="section-title">誰付了多少</div><div class="card">${list}</div>`;
}

function transferHtml(acc) {
  if (!acc.expenses.length) return "";
  if (!acc.transfers.length) {
    return `<div class="section-title">怎麼喬</div>
      <div class="card"><div class="settings-desc" style="margin:0;">大家的帳都平了，不用再轉了。</div></div>`;
  }
  const rows = acc.transfers
    .map(
      (t) => `<div class="transfer-row">
        <span class="transfer-text">
          <strong><span class="person-dot" style="background:${personColors.get(t.fromId)};"></span>${escapeHtml(acc.members.get(t.fromId).name)}</strong>
          ${icon("chevronRight", { size: 14 })}
          <strong><span class="person-dot" style="background:${personColors.get(t.toId)};"></span>${escapeHtml(acc.members.get(t.toId).name)}</strong>
          <span class="transfer-amount">${formatMoney(t.amount)}</span>
        </span>
        <button type="button" class="btn btn-ghost accent transfer-settle" data-from="${t.fromId}" data-to="${t.toId}" data-amount="${t.amount}">登記結清</button>
      </div>`
    )
    .join("");
  return `<div class="section-title">怎麼喬</div>
    <div class="card">${rows}
      <p class="settings-desc" style="margin:10px 0 0;">這是「最少轉幾次帳」的算法，可能會把 A 欠 B 的錢直接轉給 C。跟你有關的那幾筆登記後，「分帳總覽」也會跟著沖掉。</p>
    </div>`;
}

function settlementHtml(acc) {
  if (!acc.settlements.length) return "";
  const rows = acc.settlements
    .map(
      (s) => `<div class="balance-row">
        <span class="name"><span class="person-dot" style="background:${personColors.get(s.fromId)};"></span>${escapeHtml(acc.members.get(s.fromId).name)} → <span class="person-dot" style="background:${personColors.get(s.toId)};"></span>${escapeHtml(acc.members.get(s.toId).name)}</span>
        <span class="sub">${s.date}${s.note ? " · " + escapeHtml(s.note) : ""}</span>
        <span>${formatMoney(s.amount)}</span>
        <button type="button" class="icon-btn settle-delete" data-id="${s.id}" aria-label="刪除結清紀錄">${icon("close", { size: 16 })}</button>
      </div>`
    )
    .join("");
  return `<div class="section-title">結清紀錄</div><div class="card">${rows}</div>`;
}

async function renderMoney(acc) {
  const { moneyBody } = els();
  const [cats, withReceipt] = await Promise.all([categoryMap(), receiptIdSet()]);
  moneyBody.innerHTML =
    expenseListHtml(acc, cats, withReceipt) + balanceHtml(acc) + transferHtml(acc) + settlementHtml(acc);

  moneyBody.querySelectorAll(".trip-expense-row").forEach((row) => {
    row.addEventListener("click", () => {
      const expense = acc.expenses.find((e) => e.id === Number(row.dataset.id));
      if (expense) openTripExpenseModal(currentTrip, expense, render);
    });
  });

  moneyBody.querySelectorAll(".transfer-settle").forEach((btn) => {
    btn.addEventListener("click", () => {
      openTripSettleModal(
        currentTrip,
        {
          fromId: btn.dataset.from,
          toId: btn.dataset.to,
          amount: Number(btn.dataset.amount),
        },
        render
      );
    });
  });

  moneyBody.querySelectorAll(".settle-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("刪掉這筆結清紀錄？帳會變回沒結清的樣子。")) return;
      await deleteTripSettlement(Number(btn.dataset.id));
      showToast("已刪除結清紀錄");
      await render();
    });
  });
}

/* ---- 結清了就問要不要收起來 ---- */

/* 按過「先不要」的方案這次開著就別再問了。只記在記憶體裡：
   重開 App 又結清著，再問一次也合理。 */
const dismissed = new Set();

function renderSettledBanner(acc) {
  const { settledBanner } = els();
  const share = shareForTrip(currentTrip.id);
  const show =
    isTripSettled(acc) &&
    !currentTrip.archivedAt &&
    !dismissed.has(currentTrip.id) &&
    !(share && !share.myMemberId);
  settledBanner.hidden = !show;
  if (!show) return;

  settledBanner.innerHTML = `
    <div class="settled-text">
      ${icon("check", { size: 16 })}
      <span>這趟的帳都結清了。要把方案收起來嗎？收起來只是不顯示在列表上，資料都留著。</span>
    </div>
    <div class="settled-actions">
      <button type="button" class="btn btn-ghost" id="trip-settled-later">先不要</button>
      <button type="button" class="btn btn-primary" id="trip-settled-archive">收起來</button>
    </div>`;

  settledBanner.querySelector("#trip-settled-later").addEventListener("click", () => {
    dismissed.add(currentTrip.id);
    settledBanner.hidden = true;
  });

  settledBanner.querySelector("#trip-settled-archive").addEventListener("click", async () => {
    await setTripArchived(currentTrip.id, true);
    showToast("已收起來，在方案列表最下面找得到");
    navigate("/trips");
  });
}

/* 共享方案但還沒選「我是誰」：在算得出「我的份」之前，先擋在這裡問。 */
function renderClaimBanner(share) {
  const { claimBanner } = els();
  const show = Boolean(share && !share.myMemberId);
  claimBanner.hidden = !show;
  if (!show) return;

  claimBanner.innerHTML = `
    <div class="settled-text">
      ${icon("users", { size: 16 })}
      <span>這是共享方案。先選「你是名單上的哪一位」，你的份才算得出來。</span>
    </div>
    <div class="settled-actions">
      <button type="button" class="btn btn-primary" id="trip-claim-open">選一個</button>
    </div>`;

  claimBanner.querySelector("#trip-claim-open").addEventListener("click", () => {
    openShareModal(currentTripId, () => render());
  });
}

/* ---- 整頁 ---- */

async function render() {
  const trip = currentTripId ? await getTrip(currentTripId) : null;
  if (!trip) {
    currentTripId = null;
    currentTrip = null;
    navigate("/trips");
    return;
  }
  currentTrip = trip;

  const { name, dates, members: memberBox, statTotal, statMine, statNet, statNetLabel } = els();
  const titleEl = document.getElementById("app-title");
  if (titleEl) titleEl.textContent = trip.name;

  const [members, acc] = await Promise.all([
    tripMembers(trip),
    computeTripAccounts(trip.id, trip),
  ]);
  personColors = assignPersonColors(acc.rows.map((r) => r.id));

  name.textContent = trip.name;
  const range = formatTripDates(trip);
  dates.textContent = range;
  dates.hidden = !range;
  memberBox.innerHTML = members.options
    .map((p) => {
      const color = personColors.get(p.id);
      return `<span class="person-pill" style="background:${tint(color, 0.16)};color:${color};">${escapeHtml(p.name)}</span>`;
    })
    .join("");

  statTotal.textContent = formatMoney(acc.total);
  statMine.textContent = formatMoney(acc.myShare);
  statNet.textContent = formatMoney(Math.abs(acc.myNet));
  statNet.classList.toggle("over-label", acc.myNet > 0);
  statNetLabel.textContent =
    acc.myNet > 0 ? "別人要還我" : acc.myNet < 0 ? "我要還別人" : "已結清";

  const share = shareForTrip(trip.id);
  els().shareBtn.innerHTML = `${icon("users", { size: 16 })}<span>${share ? "共享中" : "共享"}</span>`;
  els().shareBtn.classList.toggle("accent", Boolean(share));

  renderPaneVisibility();
  renderClaimBanner(share);
  renderSettledBanner(acc);
  await renderPacking(members);
  await renderMoney(acc);
}

function renderPaneVisibility() {
  const { paneList, paneMoney } = els();
  paneList.hidden = pane !== "list";
  paneMoney.hidden = pane !== "money";
}

async function submitNewItem() {
  const { input, newItemCategory } = els();
  const value = input.value.trim();
  if (!value) return;
  try {
    /* 分類留在選單上不清掉：連續加同一類的東西時不用每次重選 */
    await addItem(currentTripId, value, newItemCategory.value);
    input.value = "";
    await render();
  } catch (err) {
    showToast(err.message);
  }
  input.focus();
}

function wire() {
  if (wired) return;
  wired = true;
  const {
    editBtn,
    shareBtn,
    addItemBtn,
    input,
    newItemCategory,
    packingEntry,
    entryIcon,
    entryArrow,
    backToMoney,
    groupSwitch,
    clearDoneBtn,
    uncheckAllBtn,
    addExpenseBtn,
  } = els();

  editBtn.innerHTML = `${icon("pencil", { size: 16 })}<span>編輯</span>`;
  addItemBtn.innerHTML = icon("plus", { size: 20 });
  addExpenseBtn.innerHTML = `${icon("plus", { size: 16 })}<span>新增花費</span>`;
  entryIcon.innerHTML = icon("list", { size: 18 });
  entryArrow.innerHTML = icon("chevronRight", { size: 16 });
  backToMoney.innerHTML = `${icon("chevronLeft", { size: 16 })}<span>回到算帳</span>`;

  shareBtn.addEventListener("click", () => {
    if (!currentTripId) return;
    openShareModal(currentTripId, (result) => {
      if (result?.gone) navigate("/trips");
      else render();
    });
  });

  editBtn.addEventListener("click", () => {
    if (!currentTrip) return;
    openTripEditor(currentTrip, (updated, opts) => {
      if (updated && !opts?.archived) render();
      else navigate("/trips");
    });
  });

  addItemBtn.addEventListener("click", submitNewItem);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") submitNewItem();
  });

  wireCategorySelect(newItemCategory);

  packingEntry.addEventListener("click", () => {
    pane = "list";
    renderPaneVisibility();
    window.scrollTo({ top: 0 });
  });

  backToMoney.addEventListener("click", () => {
    pane = "money";
    renderPaneVisibility();
    window.scrollTo({ top: 0 });
  });

  groupSwitch.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      groupMode = btn.dataset.group;
      groupSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("selected", b === btn));
      render();
    });
  });

  clearDoneBtn.addEventListener("click", async () => {
    if (!confirm("要把已勾選的項目刪掉嗎？")) return;
    const removed = await removeDone(currentTripId);
    showToast(`已清除 ${removed} 個項目`);
    await render();
  });

  uncheckAllBtn.addEventListener("click", async () => {
    if (!confirm("要把所有勾選取消嗎？（項目會留著，下次還能用）")) return;
    await uncheckAll(currentTripId);
    showToast("已全部取消勾選");
    await render();
  });

  addExpenseBtn.addEventListener("click", () => {
    if (!currentTrip) return;
    openTripExpenseModal(currentTrip, null, render);
  });
}

export async function onShow() {
  wire();
  await render();
}
