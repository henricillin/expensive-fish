/* 共享方案：一個方案幾個人一起用，各自登入自己的帳號。

   資料本身走一般的同步管線（伺服器會把屬於這個方案的東西複製給每一位成員），
   這支只管兩件事：

   1. **哪些方案是共享的**，以及「我在這個方案裡是哪一位」。這份名單不走同步，
      是每輪同步跟伺服器問一次、存在 syncMeta 裡（離線也讀得到）。
   2. **「我」怎麼對應。** 共享資料裡不能出現 `me`——每台裝置的 `me` 都是同一個字，
      同步過去就變成對方。所以共享方案裡的「我」是一個真的成員 id（memberId），
      名字則寫在方案自己的 `roster` 欄位裡跟著同步。

   還沒認領位子（myMemberId 是 null）時，方案照樣看得到，只是算不出「我的份」，
   畫面上會請使用者先選自己是誰。 */
import { STORE_EXPENSES, getMeta, setMeta, getAll, rawPut } from "./db.js";
import { api } from "./syncApi.js";

const META_SHARES = "shares";

/* 記憶體裡的一份，畫面到處都要同步地問「這個方案是不是共享的」。 */
let cache = [];

export async function loadShares() {
  cache = (await getMeta(META_SHARES, [])) || [];
  return cache;
}

export function getShares() {
  return cache;
}

export function shareForTrip(tripUid) {
  return cache.find((s) => s.tripUid === tripUid) || null;
}

export function isSharedTrip(tripUid) {
  return Boolean(tripUid && shareForTrip(tripUid));
}

/* 我在這個方案裡是哪一位。不是共享方案、或還沒認領位子都回 null。 */
export function myMemberId(tripUid) {
  return shareForTrip(tripUid)?.myMemberId || null;
}

/* 已經被人認領的位子（含我自己）。挑「我是誰」時要把這些擋掉。 */
export function claimedMemberIds(tripUid) {
  const share = shareForTrip(tripUid);
  if (!share) return new Set();
  return new Set(share.members.map((m) => m.memberId).filter(Boolean));
}

async function store(shares) {
  cache = shares;
  await setMeta(META_SHARES, shares);
  return cache;
}

export async function clearShares() {
  return store([]);
}

/* 每輪同步問一次。名單很短（一個人的共享方案不會有幾百個），
   而且走這條路才不會被 last-write-wins 影響到成員資格。 */
export async function refreshShares() {
  const data = await api("GET", "/api/shares");
  return store(data.shares || []);
}

export async function startShare(tripUid, memberId) {
  const data = await api("POST", "/api/shares", { body: { tripUid, memberId } });
  await refreshShares();
  return data.share;
}

export async function joinShare(code) {
  const data = await api("POST", "/api/shares/join", { body: { code } });
  await refreshShares();
  return data.share;
}

export async function claimSeat(shareId, memberId) {
  const data = await api("POST", `/api/shares/${shareId}/claim`, { body: { memberId } });
  await refreshShares();
  return data.share;
}

export async function leaveShare(shareId) {
  const result = await api("POST", `/api/shares/${shareId}/leave`);
  await refreshShares();
  return result;
}

export async function dissolveShare(shareId) {
  const result = await api("DELETE", `/api/shares/${shareId}`);
  await refreshShares();
  return result;
}

/* ---- 「我的份」 ---- */

/* 支出的 amount 存的是「我的份」，每個人的答案都不一樣，所以它是一份
   本機的投影，不是共享的內容：從共享下來的 split 裡挑出自己那一份算出來。 */
export function myShareOf(split, meId) {
  if (!split || !meId) return 0;
  const mine = split.shares?.find((s) => s.personId === meId);
  return mine ? Number(mine.amount) || 0 : 0;
}

/* 剛認領完位子（或換了位子）時，這個方案的花費要重算一次「我的份」。
   走 rawPut：這是本機投影，不該再推回伺服器。 */
export async function resyncMyShares(tripUid) {
  const meId = myMemberId(tripUid);
  if (!meId) return 0;
  const all = await getAll(STORE_EXPENSES);
  let changed = 0;
  for (const e of all) {
    if (e.tripId !== tripUid || !e.split) continue;
    const amount = myShareOf(e.split, meId);
    if (amount !== e.amount) {
      await rawPut(STORE_EXPENSES, { ...e, amount });
      changed++;
    }
  }
  return changed;
}

/* 產生一個新的成員 id。跟同伴的 id 同一個長相（slug + 亂碼），
   共享資料裡看到的就是這種字串。 */
export function newMemberId(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "m") + "-" + Math.random().toString(36).slice(2, 7);
}
