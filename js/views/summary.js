import { listCategories } from "../categories.js";
import {
  listExpensesByMonth,
  monthTotalsByCategory,
  recentMonthlyTotals,
  currentYearMonth,
  shiftYearMonth,
  formatYearMonthLabel,
} from "../expenses.js";
import { budgetsMap, budgetStatus, TOTAL_BUDGET_ID } from "../budgets.js";
import { formatMoney, escapeHtml } from "../ui.js";
import { renderCategoryPieChart, renderTrendChart, colorForIndex } from "../charts.js";
import { openExpenseEditor } from "../expenseModal.js";

export const elementId = "view-summary";

let viewedMonth = null;
let wired = false;

function els() {
  return {
    monthLabel: document.getElementById("summary-month-label"),
    prev: document.getElementById("summary-prev-month"),
    next: document.getElementById("summary-next-month"),
    totalAmount: document.getElementById("summary-total-amount"),
    totalBudgetRow: document.getElementById("summary-total-budget-row"),
    totalProgress: document.getElementById("summary-total-progress"),
    totalBudgetLabel: document.getElementById("summary-total-budget-label"),
    pieCanvas: document.getElementById("summary-pie"),
    legend: document.getElementById("summary-legend"),
    trendCanvas: document.getElementById("summary-trend"),
    budgetList: document.getElementById("summary-budget-list"),
    list: document.getElementById("summary-list"),
    tabDot: document.getElementById("summary-tab-dot"),
  };
}

function applyProgress(fillEl, status) {
  fillEl.style.width = `${Math.round(status.pct * 100)}%`;
  fillEl.classList.remove("warn", "over");
  if (status.tier === "warn") fillEl.classList.add("warn");
  if (status.tier === "over") fillEl.classList.add("over");
}

async function render() {
  const { monthLabel, totalAmount, totalBudgetRow, totalProgress, totalBudgetLabel, pieCanvas, legend, trendCanvas, budgetList, list, tabDot } = els();

  monthLabel.textContent = formatYearMonthLabel(viewedMonth);

  const [cats, byCategory, budgets, monthExpenses] = await Promise.all([
    listCategories(),
    monthTotalsByCategory(viewedMonth),
    budgetsMap(),
    listExpensesByMonth(viewedMonth),
  ]);
  const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);

  totalAmount.textContent = formatMoney(total);

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
    .map((c, i) => ({ id: c.id, name: c.name, icon: c.icon, amount: byCategory[c.id] || 0, color: colorForIndex(i) }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  renderCategoryPieChart(pieCanvas, entries);
  legend.innerHTML = entries.length
    ? entries
        .map(
          (e) =>
            `<div class="legend-row"><span class="legend-dot" style="background:${e.color}"></span><span>${e.icon} ${escapeHtml(e.name)}</span><span class="pct">${formatMoney(e.amount)} · ${total ? Math.round((e.amount / total) * 100) : 0}%</span></div>`
        )
        .join("")
    : `<div class="empty-state">這個月還沒有支出</div>`;

  const points = (await recentMonthlyTotals(6)).map((p) => ({
    label: p.yearMonth.slice(5) + " 月",
    total: p.total,
  }));
  renderTrendChart(trendCanvas, points);

  budgetList.innerHTML = cats
    .map((c, i) => {
      const spent = byCategory[c.id] || 0;
      const budget = budgets[c.id] || 0;
      const status = budgetStatus(spent, budget);
      if (status.tier === "over") anyOverBudget = true;
      return `<div class="budget-row">
        <div class="card-row">
          <span>${c.icon} ${escapeHtml(c.name)}</span>
          <span>${budget > 0 ? formatMoney(spent) + " / " + formatMoney(budget) : formatMoney(spent)}</span>
        </div>
        ${budget > 0 ? `<div class="progress-track"><div class="progress-fill ${status.tier === "over" ? "over" : status.tier === "warn" ? "warn" : ""}" style="width:${Math.round(status.pct * 100)}%"></div></div>` : `<input type="number" class="budget-input" data-cat="${c.id}" placeholder="設定預算" min="0" step="1" style="width:100%;border:1px solid var(--color-border);border-radius:10px;padding:6px 10px;font-size:13px;" />`}
      </div>`;
    })
    .join("");

  tabDot.classList.toggle("show", anyOverBudget);

  const sorted = [...monthExpenses];
  list.innerHTML = sorted.length
    ? sorted
        .map((e) => {
          const c = catMap[e.categoryId] || { icon: "🏷️", name: "未分類" };
          return `<div class="record-item" data-id="${e.id}">
            <div class="emoji">${c.icon}</div>
            <div class="meta">
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="sub">${e.date}${e.note ? " · " + escapeHtml(e.note) : ""}</div>
            </div>
            <div class="amount">${formatMoney(e.amount)}</div>
          </div>`;
        })
        .join("")
    : `<div class="empty-state">這個月還沒有明細</div>`;
  list.querySelectorAll(".record-item").forEach((row) => {
    row.addEventListener("click", () => {
      const id = Number(row.dataset.id);
      const expense = sorted.find((e) => e.id === id);
      openExpenseEditor(expense, render);
    });
  });

  const { setBudget } = await import("../budgets.js");
  budgetList.querySelectorAll(".budget-input").forEach((input) => {
    input.addEventListener("change", async () => {
      await setBudget(input.dataset.cat, input.value);
      render();
    });
  });
}

function wire() {
  if (wired) return;
  wired = true;
  const { prev, next } = els();
  prev.addEventListener("click", () => {
    viewedMonth = shiftYearMonth(viewedMonth, -1);
    render();
  });
  next.addEventListener("click", () => {
    viewedMonth = shiftYearMonth(viewedMonth, 1);
    render();
  });
}

export async function onShow() {
  if (!viewedMonth) viewedMonth = currentYearMonth();
  wire();
  await render();
}

export async function refreshBadgeOnly() {
  const total = await monthTotalsByCategory(currentYearMonth());
  const budgets = await budgetsMap();
  const spent = Object.values(total).reduce((s, v) => s + v, 0);
  const status = budgetStatus(spent, budgets[TOTAL_BUDGET_ID] || 0);
  const dot = document.getElementById("summary-tab-dot");
  if (dot) dot.classList.toggle("show", status.tier === "over");
}
