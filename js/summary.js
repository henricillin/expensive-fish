/* Month summary panel — lives on the Home screen, right under the quick-add card. */
import { listCategories } from "./categories.js";
import {
  listExpensesByMonth,
  monthTotalsByCategory,
  recentMonthlyTotals,
  currentYearMonth,
  shiftYearMonth,
  formatYearMonthLabel,
} from "./expenses.js";
import { budgetsMap, budgetStatus, setBudget, TOTAL_BUDGET_ID } from "./budgets.js";
import { formatMoney, escapeHtml } from "./ui.js";
import { renderCategoryPieChart, renderTrendChart } from "./charts.js";
import { icon } from "./icons.js";

let viewedMonth = null;
let wired = false;

function els() {
  return {
    monthLabel: document.getElementById("summary-month-label"),
    prev: document.getElementById("summary-prev-month"),
    next: document.getElementById("summary-next-month"),
    countLabel: document.getElementById("summary-count-label"),
    totalAmount: document.getElementById("summary-total-amount"),
    totalBudgetRow: document.getElementById("summary-total-budget-row"),
    totalProgress: document.getElementById("summary-total-progress"),
    totalBudgetLabel: document.getElementById("summary-total-budget-label"),
    pieCanvas: document.getElementById("summary-pie"),
    legend: document.getElementById("summary-legend"),
    trendCanvas: document.getElementById("summary-trend"),
    budgetList: document.getElementById("summary-budget-list"),
    tabDot: document.getElementById("summary-tab-dot"),
  };
}

function applyProgress(fillEl, status) {
  fillEl.style.width = `${Math.round(status.pct * 100)}%`;
  fillEl.classList.remove("warn", "over");
  if (status.tier === "warn") fillEl.classList.add("warn");
  if (status.tier === "over") fillEl.classList.add("over");
}

export async function renderSummary() {
  const {
    monthLabel, countLabel, totalAmount, totalBudgetRow, totalProgress,
    totalBudgetLabel, pieCanvas, legend, trendCanvas, budgetList, tabDot,
  } = els();

  if (!viewedMonth) viewedMonth = currentYearMonth();
  monthLabel.textContent = formatYearMonthLabel(viewedMonth);

  const [cats, byCategory, budgets, monthExpenses] = await Promise.all([
    listCategories(),
    monthTotalsByCategory(viewedMonth),
    budgetsMap(),
    listExpensesByMonth(viewedMonth),
  ]);
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);

  totalAmount.textContent = formatMoney(total);
  countLabel.textContent = monthExpenses.length ? `${monthExpenses.length} 筆` : "";

  const totalBudget = budgets[TOTAL_BUDGET_ID] || 0;
  let anyOverBudget = false;
  if (totalBudget > 0) {
    const status = budgetStatus(total, totalBudget);
    totalBudgetRow.hidden = false;
    applyProgress(totalProgress, status);
    totalBudgetLabel.innerHTML = status.tier === "over"
      ? `<span class="over-label">已超支 ${formatMoney(status.over)}</span><span>預算 ${formatMoney(totalBudget)}</span>`
      : `<span>${formatMoney(total)} / ${formatMoney(totalBudget)}</span><span>${Math.round(status.pct * 100)}%</span>`;
    if (status.tier === "over") anyOverBudget = true;
  } else {
    totalBudgetRow.hidden = true;
  }

  const entries = cats
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, amount: byCategory[c.id] || 0 }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  renderCategoryPieChart(pieCanvas, entries);
  legend.innerHTML = entries.length
    ? entries
        .map(
          (e) =>
            `<div class="legend-row">
              <span class="legend-dot" style="background:${e.color}"></span>
              <span>${escapeHtml(e.name)}</span>
              <span class="pct">${formatMoney(e.amount)} · ${total ? Math.round((e.amount / total) * 100) : 0}%</span>
            </div>`
        )
        .join("")
    : `<div class="empty-state">這個月還沒有支出</div>`;

  const points = (await recentMonthlyTotals(6)).map((p) => ({
    label: p.yearMonth.slice(5) + " 月",
    total: p.total,
  }));
  renderTrendChart(trendCanvas, points);

  budgetList.innerHTML = cats
    .map((c) => {
      const spent = byCategory[c.id] || 0;
      const budget = budgets[c.id] || 0;
      const status = budgetStatus(spent, budget);
      if (status.tier === "over") anyOverBudget = true;
      const tierClass = status.tier === "over" ? "over" : status.tier === "warn" ? "warn" : "";
      return `<div class="budget-row">
        <div class="card-row">
          <span class="label-with-icon" style="color:${c.color}">${icon(c.icon, { size: 17 })}<span style="color:var(--color-text)">${escapeHtml(c.name)}</span></span>
          <span>${budget > 0 ? formatMoney(spent) + " / " + formatMoney(budget) : formatMoney(spent)}</span>
        </div>
        ${budget > 0
          ? `<div class="progress-track"><div class="progress-fill ${tierClass}" style="width:${Math.round(status.pct * 100)}%"></div></div>`
          : `<input type="number" class="budget-input" data-cat="${c.id}" placeholder="設定預算" min="0" step="1" />`}
      </div>`;
    })
    .join("");

  if (tabDot) tabDot.classList.toggle("show", anyOverBudget);

  budgetList.querySelectorAll(".budget-input").forEach((input) => {
    input.addEventListener("change", async () => {
      await setBudget(input.dataset.cat, input.value);
      renderSummary();
    });
  });
}

export function initSummary() {
  if (wired) return;
  wired = true;
  const { prev, next } = els();
  prev.innerHTML = icon("chevronLeft", { size: 20 });
  next.innerHTML = icon("chevronRight", { size: 20 });
  prev.addEventListener("click", () => {
    viewedMonth = shiftYearMonth(viewedMonth || currentYearMonth(), -1);
    renderSummary();
  });
  next.addEventListener("click", () => {
    viewedMonth = shiftYearMonth(viewedMonth || currentYearMonth(), 1);
    renderSummary();
  });
}

export async function refreshBadgeOnly() {
  const byCategory = await monthTotalsByCategory(currentYearMonth());
  const budgets = await budgetsMap();
  const spent = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const status = budgetStatus(spent, budgets[TOTAL_BUDGET_ID] || 0);
  const dot = document.getElementById("summary-tab-dot");
  if (dot) dot.classList.toggle("show", status.tier === "over");
}
