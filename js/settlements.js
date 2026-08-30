import { STORE_SETTLEMENTS, getAll, add, remove } from "./db.js";
import { listExpenses } from "./expenses.js";
import { ME } from "./people.js";

export async function listSettlements() {
  return getAll(STORE_SETTLEMENTS);
}

export async function addSettlement({ personId, amount, type, date, note }) {
  const record = {
    personId,
    amount: Number(amount),
    type, // "receive" = 對方還我錢, "pay" = 我還對方錢
    date,
    note: note ? note.trim() : "",
    createdAt: Date.now(),
  };
  await add(STORE_SETTLEMENTS, record);
  return record;
}

export async function deleteSettlement(id) {
  await remove(STORE_SETTLEMENTS, id);
}

export async function computeBalances() {
  const [expenses, settlements] = await Promise.all([listExpenses(), listSettlements()]);
  const balances = new Map();

  function ensure(personId) {
    if (!balances.has(personId)) {
      balances.set(personId, { owedToMe: 0, owedByMe: 0, related: [] });
    }
    return balances.get(personId);
  }

  for (const e of expenses) {
    if (!e.split) continue;
    const { payerId, shares } = e.split;
    if (payerId === ME.id) {
      for (const s of shares) {
        if (s.personId === ME.id) continue;
        const b = ensure(s.personId);
        b.owedToMe += s.amount;
        b.related.push({ expenseId: e.id, date: e.date, amount: s.amount, role: "owesMe" });
      }
    } else {
      const mine = shares.find((s) => s.personId === ME.id);
      if (mine) {
        const b = ensure(payerId);
        b.owedByMe += mine.amount;
        b.related.push({ expenseId: e.id, date: e.date, amount: mine.amount, role: "iOwe" });
      }
    }
  }

  for (const s of settlements) {
    const b = ensure(s.personId);
    if (s.type === "receive") b.owedToMe -= s.amount;
    else b.owedByMe -= s.amount;
  }

  for (const b of balances.values()) {
    b.net = b.owedToMe - b.owedByMe;
    b.related.sort((a, c) => c.date.localeCompare(a.date));
  }

  return balances;
}
