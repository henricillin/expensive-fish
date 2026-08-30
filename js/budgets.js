import { STORE_BUDGETS, getAll, getById, put } from "./db.js";

export const TOTAL_BUDGET_ID = "total";

export async function listBudgets() {
  return getAll(STORE_BUDGETS);
}

export async function getBudget(id) {
  const b = await getById(STORE_BUDGETS, id);
  return b ? b.amount : 0;
}

export async function setBudget(id, amount) {
  const value = Number(amount) || 0;
  if (value <= 0) {
    await put(STORE_BUDGETS, { id, amount: 0, updatedAt: Date.now() });
    return;
  }
  await put(STORE_BUDGETS, { id, amount: value, updatedAt: Date.now() });
}

export async function budgetsMap() {
  const all = await listBudgets();
  const map = {};
  for (const b of all) map[b.id] = b.amount;
  return map;
}

export function budgetStatus(spent, budget) {
  if (!budget || budget <= 0) {
    return { hasBudget: false, pct: 0, tier: "safe", over: 0 };
  }
  const pct = spent / budget;
  let tier = "safe";
  if (pct > 1) tier = "over";
  else if (pct >= 0.8) tier = "warn";
  return {
    hasBudget: true,
    pct: Math.min(pct, 1),
    rawPct: pct,
    tier,
    over: pct > 1 ? spent - budget : 0,
  };
}
