/* 方案總覽 — 每次出遊／每個計畫一張卡，看得到清單進度和這趟還沒喬完的錢。 */
import { listTrips, computeTripAccounts, formatTripDates, tripMembers } from "../trips.js";
import { listItems, progressOf } from "../packing.js";
import { escapeHtml, formatMoney } from "../ui.js";
import { icon } from "../icons.js";
import { openTripCreator } from "../tripModal.js";
import { navigate } from "../router.js";
import { setCurrentTrip } from "./trip.js";

export const elementId = "view-trips";
export const title = "方案";

let wired = false;

function els() {
  return {
    addBtn: document.getElementById("trips-add"),
    list: document.getElementById("trips-container"),
  };
}

function netLabel(net) {
  if (net > 0) return `<span class="over-label">還有 ${formatMoney(net)} 要收</span>`;
  if (net < 0) return `<span>還有 ${formatMoney(-net)} 要付</span>`;
  return `<span style="color:var(--color-text-muted);">帳已結清</span>`;
}

async function render() {
  const { list } = els();
  const trips = await listTrips();

  if (!trips.length) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-icon">${icon("plane", { size: 24 })}</span>
      <div>還沒有方案。<br />出門前先開一個，帶什麼、誰付了什麼都放在裡面。</div>
    </div>`;
    return;
  }

  const cards = await Promise.all(
    trips.map(async (trip) => {
      const [items, acc, members] = await Promise.all([
        listItems(trip.id),
        computeTripAccounts(trip.id, trip),
        tripMembers(trip),
      ]);
      const { total, done } = progressOf(items);
      const pct = total ? Math.round((done / total) * 100) : 0;
      const dates = formatTripDates(trip);
      return `<div class="card trip-card" data-id="${trip.id}">
        <div class="card-row">
          <span class="packing-card-name">${escapeHtml(trip.name)}</span>
          <span class="packing-card-count">${dates || `${members.options.length} 人`}</span>
        </div>
        <div class="pill-row">
          ${members.options.map((p) => `<span class="person-pill">${escapeHtml(p.name)}</span>`).join("")}
        </div>
        <div class="progress-track" style="margin-top:10px;">
          <div class="progress-fill${total && done === total ? " done" : ""}" style="width:${pct}%;"></div>
        </div>
        <div class="card-row" style="margin-top:8px;font-size:13px;">
          <span style="color:var(--color-text-muted);">${total ? `清單 ${done}/${total}` : "清單還沒東西"}</span>
          <span>${acc.total ? `花了 ${formatMoney(acc.total)}` : "還沒記帳"}</span>
        </div>
        <div class="card-row" style="margin-top:4px;font-size:13px;">
          <span style="color:var(--color-text-muted);">我的份 ${formatMoney(acc.myShare)}</span>
          ${netLabel(acc.myNet)}
        </div>
      </div>`;
    })
  );

  list.innerHTML = cards.join("");

  list.querySelectorAll(".trip-card").forEach((card) => {
    card.addEventListener("click", () => {
      setCurrentTrip(card.dataset.id);
      navigate("/trip");
    });
  });
}

function wire() {
  if (wired) return;
  wired = true;
  const { addBtn } = els();
  addBtn.innerHTML = `${icon("plus", { size: 16 })}<span>新增方案</span>`;
  addBtn.addEventListener("click", () => {
    openTripCreator((created) => {
      if (created) {
        setCurrentTrip(created.id);
        navigate("/trip");
      } else {
        render();
      }
    });
  });
}

export async function onShow() {
  wire();
  await render();
}
