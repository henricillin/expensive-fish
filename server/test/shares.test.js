import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser, change, tombstone } from "./helpers.js";

const { api } = await startTestServer();

let seq = 0;
const nextEmail = () => `s${++seq}@example.com`;

const push = (token, changes) => api("POST", "/api/sync/push", { token, body: { changes } });
const pull = (token, since = 0) => api("GET", `/api/sync/pull?since=${since}`, { token });

/* 一個已經共享出去的方案，裡面有一筆花費和一個攜帶清單項目。
   回傳發起人的 token、share，以及方便測試用的 uid。 */
async function sharedTrip({ tripUid = "trip-1", at = 1000 } = {}) {
  const owner = await registerUser(api, nextEmail());
  const created = await api("POST", "/api/shares", {
    token: owner,
    body: { tripUid, memberId: "owner-seat" },
  });
  assert.equal(created.status, 201);

  await push(owner, [
    change("trips", tripUid, { id: tripUid, name: "沖繩", roster: [] }, at),
    change("expenses", "exp-1", { tripId: tripUid, amount: 100, date: "2026-09-01" }, at),
    change("packingItems", "item-1", { listId: tripUid, name: "牙刷" }, at),
    /* 不屬於方案的東西不會跟著共享 */
    change("expenses", "exp-private", { amount: 50, date: "2026-09-01" }, at),
  ]);

  return { owner, share: created.body.share, tripUid };
}

async function joinAs(code) {
  const token = await registerUser(api, nextEmail());
  const res = await api("POST", "/api/shares/join", { token, body: { code } });
  assert.equal(res.status, 200);
  return { token, share: res.body.share, backfilled: res.body.backfilled };
}

test("用邀請碼加入之後，方案裡已經有的東西整批拿得到", async () => {
  const { share } = await sharedTrip({ tripUid: "trip-join" });
  const guest = await joinAs(share.code);

  const got = await pull(guest.token);
  const uids = got.body.changes.map((c) => c.uid).sort();
  assert.deepEqual(uids, ["exp-1", "item-1", "trip-join"]);
  /* 發起人不屬於方案的那筆花費不能外流 */
  assert.equal(uids.includes("exp-private"), false);
});

test("加入的人記一筆，發起人也收得到", async () => {
  const { owner, share, tripUid } = await sharedTrip({ tripUid: "trip-two-way" });
  const ownerCursor = (await pull(owner)).body.cursor;
  const guest = await joinAs(share.code);

  const res = await push(guest.token, [
    change("expenses", "exp-guest", { tripId: tripUid, amount: 80, date: "2026-09-02" }, 2000),
  ]);
  assert.equal(res.body.applied, 1);

  const ownerSaw = await pull(owner, ownerCursor);
  assert.deepEqual(
    ownerSaw.body.changes.map((c) => c.uid),
    ["exp-guest"]
  );
  assert.equal(ownerSaw.body.changes[0].payload.amount, 80);
});

test("不是成員就寫不進別人的共享方案", async () => {
  const { tripUid } = await sharedTrip({ tripUid: "trip-guarded" });
  const outsider = await registerUser(api, nextEmail());

  const res = await push(outsider, [
    change("expenses", "exp-evil", { tripId: tripUid, amount: 9999, date: "2026-09-03" }, 3000),
  ]);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "not_a_member");

  /* 整批退回：同一批裡合法的那筆也不該留下來 */
  const own = await pull(outsider);
  assert.equal(own.body.changes.length, 0);
});

test("同一個位子只能一個人認領", async () => {
  const { share } = await sharedTrip({ tripUid: "trip-seats" });
  const a = await joinAs(share.code);
  const b = await joinAs(share.code);

  const first = await api("POST", `/api/shares/${share.id}/claim`, {
    token: a.token,
    body: { memberId: "amy" },
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.share.myMemberId, "amy");

  const second = await api("POST", `/api/shares/${share.id}/claim`, {
    token: b.token,
    body: { memberId: "amy" },
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "member_taken");

  /* 發起人已經佔走的位子也一樣不能認領 */
  const taken = await api("POST", `/api/shares/${share.id}/claim`, {
    token: b.token,
    body: { memberId: "owner-seat" },
  });
  assert.equal(taken.status, 409);
});

test("共享中的資料，舊的推不贏別人剛改好的", async () => {
  const { owner, share, tripUid } = await sharedTrip({ tripUid: "trip-lww", at: 1000 });
  const guest = await joinAs(share.code);
  await pull(guest.token);

  /* 發起人先改成 500 */
  await push(owner, [change("expenses", "exp-1", { tripId: tripUid, amount: 500 }, 5000)]);

  /* 還沒同步到的裝置拿舊時間推上來 → 退回，並附上贏的那份 */
  const res = await push(guest.token, [
    change("expenses", "exp-1", { tripId: tripUid, amount: 300 }, 4000),
  ]);
  assert.equal(res.body.stale, 1);
  assert.equal(res.body.results[0].server.payload.amount, 500);
});

test("把花費移出方案，其他成員手上那份會收到墓碑", async () => {
  const { owner, share, tripUid } = await sharedTrip({ tripUid: "trip-move-out" });
  const guest = await joinAs(share.code);
  const guestCursor = (await pull(guest.token)).body.cursor;

  /* 沒有 tripId 了 = 這筆變回發起人自己的私人花費 */
  await push(owner, [change("expenses", "exp-1", { amount: 100, date: "2026-09-01" }, 6000)]);

  const got = await pull(guest.token, guestCursor);
  const exp = got.body.changes.find((c) => c.uid === "exp-1");
  assert.equal(exp.deleted, true);

  /* 發起人自己那筆還在，只是不再屬於方案 */
  const ownerSide = await pull(owner);
  const ownerExp = ownerSide.body.changes.find((c) => c.uid === "exp-1");
  assert.equal(ownerExp.deleted, false);
  assert.equal(ownerExp.payload.tripId, undefined);
});

test("離開共享：自己這邊清掉，別人的不動", async () => {
  const { owner, share } = await sharedTrip({ tripUid: "trip-leave" });
  const guest = await joinAs(share.code);
  const guestCursor = (await pull(guest.token)).body.cursor;
  const ownerCursor = (await pull(owner)).body.cursor;

  const res = await api("POST", `/api/shares/${share.id}/leave`, { token: guest.token });
  assert.equal(res.status, 200);

  const guestSaw = await pull(guest.token, guestCursor);
  assert.equal(guestSaw.body.changes.length, 3);
  assert.ok(guestSaw.body.changes.every((c) => c.deleted));

  /* 發起人那邊什麼都沒發生 */
  const ownerSaw = await pull(owner, ownerCursor);
  assert.equal(ownerSaw.body.changes.length, 0);

  /* 離開之後就不在名單上了 */
  const list = await api("GET", "/api/shares", { token: guest.token });
  assert.equal(list.body.shares.length, 0);
});

test("發起人不能離開，只能解散", async () => {
  const { owner, share } = await sharedTrip({ tripUid: "trip-owner-leave" });
  const res = await api("POST", `/api/shares/${share.id}/leave`, { token: owner });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "owner_cannot_leave");
});

test("解散共享：成員那邊清掉，發起人的資料變回私人的", async () => {
  const { owner, share, tripUid } = await sharedTrip({ tripUid: "trip-dissolve" });
  const guest = await joinAs(share.code);
  const guestCursor = (await pull(guest.token)).body.cursor;
  const ownerCursor = (await pull(owner)).body.cursor;

  const res = await api("DELETE", `/api/shares/${share.id}`, { token: owner });
  assert.equal(res.status, 200);

  const guestSaw = await pull(guest.token, guestCursor);
  assert.ok(guestSaw.body.changes.length > 0);
  assert.ok(guestSaw.body.changes.every((c) => c.deleted));

  /* 發起人一筆都沒動 */
  assert.equal((await pull(owner, ownerCursor)).body.changes.length, 0);

  /* share 不見了，同一個方案可以重新開一次共享 */
  assert.equal((await api("GET", "/api/shares", { token: owner })).body.shares.length, 0);
  const again = await api("POST", "/api/shares", { token: owner, body: { tripUid } });
  assert.equal(again.status, 201);
});

test("成員不能解散別人的共享", async () => {
  const { share } = await sharedTrip({ tripUid: "trip-not-owner" });
  const guest = await joinAs(share.code);
  const res = await api("DELETE", `/api/shares/${share.id}`, { token: guest.token });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, "not_owner");
});

test("邀請碼不對就加不進去", async () => {
  const token = await registerUser(api, nextEmail());
  const res = await api("POST", "/api/shares/join", { token, body: { code: "ZZZZZZZZ" } });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "invalid_code");
});

test("別人已經共享的方案，不能再被拿去共享一次", async () => {
  const { tripUid } = await sharedTrip({ tripUid: "trip-dup" });
  const other = await registerUser(api, nextEmail());
  const res = await api("POST", "/api/shares", { token: other, body: { tripUid } });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "already_shared");
});

test("同一個方案自己重複開共享，拿到的是同一個", async () => {
  const { owner, share, tripUid } = await sharedTrip({ tripUid: "trip-idempotent" });
  const again = await api("POST", "/api/shares", { token: owner, body: { tripUid } });
  assert.equal(again.status, 201);
  assert.equal(again.body.share.id, share.id);
  assert.equal(again.body.share.code, share.code);
});

test("刪掉共享方案裡的東西，每個人都會收到墓碑", async () => {
  const { owner, share } = await sharedTrip({ tripUid: "trip-delete" });
  const guest = await joinAs(share.code);
  const guestCursor = (await pull(guest.token)).body.cursor;

  await push(owner, [tombstone("packingItems", "item-1", 7000)]);

  const got = await pull(guest.token, guestCursor);
  assert.deepEqual(
    got.body.changes.map((c) => [c.uid, c.deleted]),
    [["item-1", true]]
  );
});

test("成員名單看得到誰認領了哪個位子", async () => {
  const { owner, share } = await sharedTrip({ tripUid: "trip-roster" });
  const guest = await joinAs(share.code);
  await api("POST", `/api/shares/${share.id}/claim`, {
    token: guest.token,
    body: { memberId: "amy" },
  });

  const list = await api("GET", "/api/shares", { token: owner });
  const seen = list.body.shares[0];
  assert.equal(seen.isOwner, true);
  assert.equal(seen.myMemberId, "owner-seat");
  assert.deepEqual(seen.members.map((m) => m.memberId).sort(), ["amy", "owner-seat"]);
  assert.equal(seen.members.filter((m) => m.isMe).length, 1);
});
