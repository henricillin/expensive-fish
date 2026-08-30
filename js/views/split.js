import { listPeople, ME } from "../people.js";
import { computeBalances } from "../settlements.js";
import { formatMoney, escapeHtml } from "../ui.js";
import { openPersonCreator, openPersonEditor } from "../personModal.js";
import { openSettleModal } from "../settleModal.js";
import { icon } from "../icons.js";

export const elementId = "view-split";
export const title = "分帳總覽";
export const back = "/more";

let wired = false;
let expandedId = null;

function els() {
  return {
    addBtn: document.getElementById("split-add-person"),
    list: document.getElementById("split-balance-list"),
  };
}

function balanceLabel(net) {
  if (net === 0) return { text: "已結清", cls: "" };
  if (net > 0) return { text: `他欠你 ${formatMoney(net)}`, cls: "over-label" };
  return { text: `你欠他 ${formatMoney(-net)}`, cls: "" };
}

async function render() {
  const { list } = els();
  const people = await listPeople();
  const balances = await computeBalances();

  if (!people.length) {
    list.innerHTML = `<div class="empty-state"><span class="empty-icon">${icon("users", { size: 24 })}</span><div>還沒有加入任何同伴，先新增一位吧！</div></div>`;
    return;
  }

  list.innerHTML = people
    .map((p) => {
      const b = balances.get(p.id) || { owedToMe: 0, owedByMe: 0, net: 0, related: [] };
      const label = balanceLabel(b.net);
      const expanded = expandedId === p.id;
      return `<div class="card" data-id="${p.id}" style="margin-bottom:10px;">
        <div class="card-row person-row" data-id="${p.id}" style="cursor:pointer;">
          <span>${escapeHtml(p.name)}</span>
          <span class="${label.cls}">${label.text}</span>
        </div>
        ${expanded ? renderDetail(p, b) : ""}
      </div>`;
    })
    .join("");

  list.querySelectorAll(".person-row").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      expandedId = expandedId === id ? null : id;
      render();
    });
  });

  list.querySelectorAll(".person-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const person = people.find((p) => p.id === btn.dataset.id);
      openPersonEditor(person, () => {
        expandedId = null;
        render();
      });
    });
  });

  list.querySelectorAll(".settle-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const person = people.find((p) => p.id === btn.dataset.id);
      const b = balances.get(person.id);
      openSettleModal(person, b, () => render());
    });
  });
}

function renderDetail(person, b) {
  const rows = b.related
    .slice(0, 8)
    .map(
      (r) =>
        `<div class="card-row" style="font-size:12px;color:var(--color-text-muted);padding:3px 0;">
          <span>${r.date}</span>
          <span>${r.role === "owesMe" ? "他欠你" : "你欠他"} ${formatMoney(r.amount)}</span>
        </div>`
    )
    .join("");
  return `<div style="margin-top:8px;border-top:1px solid var(--color-border);padding-top:8px;">
    ${rows || '<div style="font-size:12px;color:var(--color-text-muted);">還沒有分帳紀錄</div>'}
    <div class="modal-actions" style="margin-top:10px;">
      <button class="btn btn-ghost person-edit-btn" data-id="${person.id}">編輯同伴</button>
      <button class="btn btn-primary settle-btn" data-id="${person.id}" ${b.net === 0 ? "disabled" : ""}>登記結清</button>
    </div>
  </div>`;
}

function wire() {
  if (wired) return;
  wired = true;
  const { addBtn } = els();
  addBtn.innerHTML = `${icon("plus", { size: 16 })}<span>新增同伴</span>`;
  addBtn.addEventListener("click", () => {
    openPersonCreator(() => render());
  });
}

export async function onShow() {
  wire();
  await render();
}
