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
import { listItems, deleteItem, updateItem as updatePackingItem } from "./packing.js";
import { isSharedTrip, shareForTrip } from "./shares.js";

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

/* ---- 共享 ---- */

/* 共享資料裡不能出現 `me`：每台裝置的 `me` 都是同一個字，同步過去就變成對方。
   開始共享時，把這個方案裡所有指向「我」的地方換成一個真的成員 id；
   解散共享時再換回來。順便每一筆都重新蓋一次時間戳——伺服器要靠這次推送
   才知道這些資料屬於哪個共享方案。 */
function swapId(id, from, to) {
  return id === from ? to : id;
}

function rewriteSplit(split, from, to) {
  if (!split) return split;
  const next = {
    ...split,
    payerId: swapId(split.payerId, from, to),
    shares: (split.shares || []).map((s) => ({ ...s, personId: swapId(s.personId, from, to) })),
  };
  if (split.weights) {
    next.weights = Object.fromEntries(
      Object.entries(split.weights).map(([id, w]) => [swapId(id, from, to), w])
    );
  }
  return next;
}

/* amount 不用動：它存的是「我的份」，只是那個「我」換了個名字。 */
async function retagTrip(trip, from, to, tripChanges) {
  for (const e of await listTripExpenses(trip.id)) {
    await updateExpense(e.id, { split: rewriteSplit(e.split, from, to) });
  }
  for (const item of await listItems(trip.id)) {
    await updatePackingItem(item.id, item.personId === from ? { personId: to } : {});
  }
  for (const st of await listTripSettlements(trip.id)) {
    await put(STORE_TRIP_SETTLEMENTS, {
      ...st,
      fromId: swapId(st.fromId, from, to),
      toId: swapId(st.toId, from, to),
    });
  }
  /* 每一筆都重推一次，伺服器才標得上 share_id；trip 自己也一樣（updateTrip 會 put）。 */
  return updateTrip(trip.id, tripChanges);
}

/* 開始共享：名單 = 我 + 這個方案原本的同伴，之後就以 roster 為準。 */
export async function shareTripLocally(trip, meId, myName) {
  const people = await listPeople();
  const roster = [
    { id: meId, name: (myName || "我").trim().slice(0, 20) },
    ...people
      .filter((p) => (trip.memberIds || []).includes(p.id))
      .map((p) => ({ id: p.id, name: p.name })),
  ];
  return retagTrip(trip, ME.id, meId, { roster });
}

/* 解散共享（或被解散）之後，方案變回一個人的東西，「我」也換回 me。 */
export async function unshareTripLocally(trip, meId) {
  return retagTrip(trip, meId, ME.id, { roster: [] });
}

/* 刪方案會帶走清單項目和這趟的結清紀錄；花費留著（只是不再屬於任何方案）。 */
export async function deleteTrip(id) {
  if (isSharedTrip(id)) {
    throw new Error("這是共享方案，要先解散共享或離開，才能刪掉");
  }
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
   這樣就算某人後來被移出方案，舊帳上的名字還是看得到。

   共享方案不一樣：成員來自方案自己的 roster（跟著資料同步，每台裝置一樣），
   而「我」不是 `me` 而是自己認領的那個成員 id——每台裝置的 `me` 都是同一個字，
   共享資料裡放 `me` 的話同步過去就變成對方了。meId 是 null 代表還沒認領位子。 */
export async function tripMembers(trip) {
  const share = trip ? shareForTrip(trip.id) : null;
  if (share) {
    const meId = share.myMemberId;
    const roster = (trip.roster || []).map((m) =>
      m.id === meId ? { id: m.id, name: "我" } : { id: m.id, name: m.name }
    );
    const all = Object.fromEntries(roster.map((m) => [m.id, m]));
    return {
      options: roster,
      all,
      ids: roster.map((m) => m.id),
      meId,
      share,
      get: (id) => all[id] || { id, name: "（已離開）" },
    };
  }

  const people = await listPeople();
  const memberIds = trip?.memberIds || [];
  const options = [ME, ...people.filter((p) => memberIds.includes(p.id))];
  const all = Object.fromEntries([ME, ...people].map((p) => [p.id, p]));
  return {
    options,
    all,
    ids: options.map((p) => p.id),
    meId: ME.id,
    share: null,
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
  /* 共享方案裡「我」是自己認領的成員 id；還沒認領就沒有「我的份」可算。 */
  const meId = members.meId;

  let total = 0;
  for (const e of expenses) {
    const split = e.split || {
      totalAmount: e.amount,
      payerId: meId || ME.id,
      shares: [{ personId: meId || ME.id, amount: e.amount }],
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
    myShare: (meId && owed.get(meId)) || 0,
    myPaid: (meId && paid.get(meId)) || 0,
    rows,
    myNet: (meId && rows.find((r) => r.id === meId)?.net) || 0,
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
