/* 方案（trip）— 一次出遊／一個計畫，底下掛著攜帶清單和這趟的帳。 */
import {
  STORE_TRIPS,
  STORE_TRIP_SETTLEMENTS,
  STORE_EXPENSES,
  getAll,
  getById,
  put,
  add,
  remove,
  getAllByIndex,
} from "./db.js";
import { listPeople, ME } from "./people.js";
import { listExpenses, updateExpense } from "./expenses.js";
import { listItems, deleteItem } from "./packing.js";

function slugify(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "trip") + "-" + Math.random().toString(36).slice(2, 7);
}

function normalize(trip) {
  return {
    startDate: "",
    endDate: "",
    note: "",
    /* v5 之前的方案沒有這個欄位，沒有就是還沒收起來 */
    archivedAt: null,
    ...trip,
    memberIds: Array.isArray(trip.memberIds) ? trip.memberIds : [],
  };
}

/* ---- 方案 ---- */

/* 預設只給沒收起來的。archived: true 拿收起來的（照封存時間新的在前）。 */
export async function listTrips({ archived = false } = {}) {
  const all = await getAll(STORE_TRIPS);
  const wanted = all.map(normalize).filter((t) => Boolean(t.archivedAt) === archived);
  if (archived) return wanted.sort((a, b) => b.archivedAt - a.archivedAt);
  return wanted.sort(
    (a, b) =>
      (b.startDate || "").localeCompare(a.startDate || "") ||
      b.createdAt - a.createdAt
  );
}

export async function getTrip(id) {
  const trip = await getById(STORE_TRIPS, id);
  return trip ? normalize(trip) : null;
}

export async function createTrip({ name, startDate, endDate, memberIds, note }) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("請輸入方案名稱");
  const trip = normalize({
    id: slugify(trimmed),
    name: trimmed,
    startDate: startDate || "",
    endDate: endDate || "",
    memberIds: memberIds || [],
    note: (note || "").trim(),
    createdAt: Date.now(),
  });
  await add(STORE_TRIPS, trip);
  return trip;
}

export async function updateTrip(id, changes) {
  const existing = await getTrip(id);
  if (!existing) throw new Error("找不到這個方案");
  if (typeof changes.name === "string") {
    const trimmed = changes.name.trim();
    if (!trimmed) throw new Error("請輸入方案名稱");
    changes = { ...changes, name: trimmed };
  }
  const updated = normalize({ ...existing, ...changes });
  await put(STORE_TRIPS, updated);
  return updated;
}

/* 收起來只是加個時間戳，資料一個都不動——比刪除安全，隨時可以再打開。 */
export async function setTripArchived(id, archived) {
  return updateTrip(id, { archivedAt: archived ? Date.now() : null });
}

/* 有花過錢、而且沒有人還要轉帳給誰，才算「這趟結清了」。 */
export function isTripSettled(acc) {
  return acc.expenses.length > 0 && acc.transfers.length === 0;
}

/* 刪方案會帶走清單項目和這趟的結清紀錄；花費留著（只是不再屬於任何方案）。 */
export async function deleteTrip(id) {
  for (const item of await listItems(id)) await deleteItem(item.id);
  for (const st of await listTripSettlements(id)) {
    await remove(STORE_TRIP_SETTLEMENTS, st.id);
  }
  for (const e of await listTripExpenses(id)) {
    const { tripId, ...rest } = e;
    await put(STORE_EXPENSES, rest);
  }
  await remove(STORE_TRIPS, id);
}

/* 成員：我 + 被加進這個方案的同伴。名字查詢會退回全部同伴，
   這樣就算某人後來被移出方案，舊帳上的名字還是看得到。 */
export async function tripMembers(trip) {
  const people = await listPeople();
  const memberIds = trip?.memberIds || [];
  const options = [ME, ...people.filter((p) => memberIds.includes(p.id))];
  const all = Object.fromEntries([ME, ...people].map((p) => [p.id, p]));
  return {
    options,
    all,
    ids: options.map((p) => p.id),
    get: (id) => all[id] || { id, name: "（已刪除）" },
  };
}

/* ---- 這趟的花費 ---- */

export async function listTripExpenses(tripId) {
  const all = await listExpenses();
  return all.filter((e) => e.tripId === tripId);
}

export async function setExpenseTrip(expenseId, tripId) {
  return updateExpense(expenseId, { tripId });
}

/* ---- 這趟的結清 ---- */

export async function listTripSettlements(tripId) {
  const all = await getAllByIndex(STORE_TRIP_SETTLEMENTS, "tripId", tripId);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export async function addTripSettlement({ tripId, fromId, toId, amount, date, note }) {
  if (fromId === toId) throw new Error("付款人和收款人不能是同一個人");
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error("請輸入有效金額");
  const record = {
    tripId,
    fromId,
    toId,
    amount: amt,
    date,
    note: (note || "").trim(),
    createdAt: Date.now(),
  };
  const id = await add(STORE_TRIP_SETTLEMENTS, record);
  return { ...record, id };
}

export async function deleteTripSettlement(id) {
  await remove(STORE_TRIP_SETTLEMENTS, id);
}

/* ---- 算帳 ---- */

/* 每筆花費都帶 split（誰先付、誰分多少）。淨額 = 這個人付出去的 − 這個人該分的，
   正數代表別人要還他，負數代表他要還別人。登記過的結清也算進「付出去」。 */
export async function computeTripAccounts(tripId, trip) {
  const [expenses, settlements, members] = await Promise.all([
    listTripExpenses(tripId),
    listTripSettlements(tripId),
    tripMembers(trip),
  ]);

  const paid = new Map();
  const owed = new Map();
  const bump = (map, id, amount) => map.set(id, (map.get(id) || 0) + amount);

  let total = 0;
  for (const e of expenses) {
    const split = e.split || {
      totalAmount: e.amount,
      payerId: ME.id,
      shares: [{ personId: ME.id, amount: e.amount }],
    };
    total += split.totalAmount;
    bump(paid, split.payerId, split.totalAmount);
    for (const s of split.shares) bump(owed, s.personId, s.amount);
  }

  for (const s of settlements) {
    bump(paid, s.fromId, s.amount);
    bump(paid, s.toId, -s.amount);
  }

  const ids = [...new Set([...members.ids, ...paid.keys(), ...owed.keys()])];
  const rows = ids.map((id) => ({
    id,
    name: members.get(id).name,
    paid: paid.get(id) || 0,
    share: owed.get(id) || 0,
    net: Math.round((paid.get(id) || 0) - (owed.get(id) || 0)),
  }));

  return {
    expenses,
    settlements,
    members,
    total,
    myShare: owed.get(ME.id) || 0,
    myPaid: paid.get(ME.id) || 0,
    rows,
    myNet: rows.find((r) => r.id === ME.id)?.net || 0,
    transfers: suggestTransfers(rows),
  };
}

/* 誰付給誰最少次數就能結清：欠最多的先還給被欠最多的。 */
export function suggestTransfers(rows) {
  const debtors = rows.filter((r) => r.net < 0).map((r) => ({ id: r.id, left: -r.net }));
  const creditors = rows.filter((r) => r.net > 0).map((r) => ({ id: r.id, left: r.net }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount > 0) {
      transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amount });
      debtors[i].left -= amount;
      creditors[j].left -= amount;
    }
    if (debtors[i].left <= 0) i++;
    if (creditors[j].left <= 0) j++;
  }
  return transfers;
}

export function formatTripDates(trip) {
  const { startDate, endDate } = trip;
  if (startDate && endDate) {
    return startDate === endDate ? startDate : `${startDate} → ${endDate}`;
  }
  return startDate || endDate || "";
}
