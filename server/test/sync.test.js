import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser, change, tombstone } from "./helpers.js";

const { api } = await startTestServer();

let seq = 0;
const nextEmail = () => `u${++seq}@example.com`;

const push = (token, changes) => api("POST", "/api/sync/push", { token, body: { changes } });
const pull = (token, since = 0, limit) =>
  api("GET", `/api/sync/pull?since=${since}${limit ? `&limit=${limit}` : ""}`, { token });

test("推上去的資料原封不動拉得回來", async () => {
  const token = await registerUser(api, nextEmail());
  const expense = { id: 7, amount: 120, categoryId: "food", date: "2026-09-01", note: "午餐" };

  const res = await push(token, [change("expenses", "uid-1", expense, 1000)]);
  assert.equal(res.status, 200);
  assert.equal(res.body.applied, 1);

  const got = await pull(token, 0);
  assert.equal(got.body.changes.length, 1);
  assert.deepEqual(got.body.changes[0].payload, expense);
  assert.equal(got.body.changes[0].deleted, false);
  assert.equal(got.body.hasMore, false);
});

test("拉過一次之後，用回傳的 cursor 只會拿到新的變更", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [change("categories", "food", { name: "食物" }, 1000)]);

  const first = await pull(token, 0);
  assert.equal(first.body.changes.length, 1);

  /* 同一個游標再拉一次應該是空的——沒有新東西 */
  const again = await pull(token, first.body.cursor);
  assert.equal(again.body.changes.length, 0);

  await push(token, [change("people", "amy", { name: "Amy" }, 2000)]);
  const third = await pull(token, first.body.cursor);
  assert.equal(third.body.changes.length, 1);
  assert.equal(third.body.changes[0].uid, "amy");
});

test("刪除會變成墓碑拉回來，不是憑空消失", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [change("expenses", "uid-1", { amount: 50 }, 1000)]);
  await push(token, [tombstone("expenses", "uid-1", 2000)]);

  const got = await pull(token, 0);
  assert.equal(got.body.changes.length, 1);
  assert.equal(got.body.changes[0].deleted, true);
  assert.equal(got.body.changes[0].payload, null);
});

test("舊的寫入蓋不掉新的，會被退回 stale 並附上贏的那份", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [change("expenses", "uid-1", { amount: 999 }, 5000)]);

  const late = await push(token, [change("expenses", "uid-1", { amount: 1 }, 4000)]);
  assert.equal(late.body.results[0].status, "stale");
  assert.deepEqual(late.body.results[0].server.payload, { amount: 999 });

  const got = await pull(token, 0);
  assert.deepEqual(got.body.changes[0].payload, { amount: 999 });
});

test("時間戳一樣但內容不同 → 伺服器那份說了算，兩台裝置才會收斂", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [change("expenses", "uid-1", { amount: 100 }, 5000)]);

  const tie = await push(token, [change("expenses", "uid-1", { amount: 200 }, 5000)]);
  assert.equal(tie.body.results[0].status, "stale");
  assert.deepEqual(tie.body.results[0].server.payload, { amount: 100 });
});

test("原封不動再推一次是 unchanged，不會多一個版本號", async () => {
  const token = await registerUser(api, nextEmail());
  const c = change("expenses", "uid-1", { amount: 100 }, 5000);
  const first = await push(token, [c]);
  const second = await push(token, [c]);

  assert.equal(second.body.results[0].status, "unchanged");
  assert.equal(second.body.cursor, first.body.cursor);
});

test("兩台裝置各改各的，同步完看到的是同一份", async () => {
  const email = nextEmail();
  const phone = await registerUser(api, email);
  const laptop = (await api("POST", "/api/auth/login", { body: { email, password: "hunter2hunter2" } })).body.token;

  await push(phone, [change("expenses", "e1", { amount: 100 }, 1000)]);
  await push(laptop, [change("expenses", "e2", { amount: 200 }, 1100)]);
  /* 筆電晚一步改了同一筆 e1，時間比較新 → 應該贏 */
  await push(laptop, [change("expenses", "e1", { amount: 150 }, 1200)]);

  const onPhone = await pull(phone, 0);
  const onLaptop = await pull(laptop, 0);
  const byUid = (r) => Object.fromEntries(r.body.changes.map((c) => [c.uid, c.payload]));

  assert.deepEqual(byUid(onPhone), byUid(onLaptop));
  assert.deepEqual(byUid(onPhone).e1, { amount: 150 });
  assert.deepEqual(byUid(onPhone).e2, { amount: 200 });
});

test("分頁：每筆一個版本號，接著拉不會漏掉同批的其他筆", async () => {
  const token = await registerUser(api, nextEmail());
  const batch = [];
  for (let i = 0; i < 25; i++) batch.push(change("expenses", `e${i}`, { amount: i }, 1000 + i));
  await push(token, batch);

  const seen = new Map();
  let cursor = 0;
  let pages = 0;
  for (;;) {
    const page = await pull(token, cursor, 10);
    for (const c of page.body.changes) seen.set(c.uid, c.payload);
    cursor = page.body.cursor;
    pages++;
    if (!page.body.hasMore) break;
    assert.ok(pages < 10, "分頁沒有結束");
  }
  assert.equal(seen.size, 25);
  assert.equal(pages, 3);
});

test("同一批裡同個 uid 出現兩次，留最後那筆", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [
    change("expenses", "e1", { amount: 1 }, 1000),
    change("expenses", "e1", { amount: 2 }, 2000),
  ]);
  const got = await pull(token, 0);
  assert.equal(got.body.changes.length, 1);
  assert.deepEqual(got.body.changes[0].payload, { amount: 2 });
});

test("不認得的資料表整批退回，一筆都不會寫進去", async () => {
  const token = await registerUser(api, nextEmail());
  const res = await push(token, [
    change("expenses", "ok", { amount: 1 }, 1000),
    change("receipts", "nope", { blob: "x" }, 1000),
  ]);
  assert.equal(res.status, 400);
  assert.equal((await pull(token, 0)).body.changes.length, 0);
});

test("updatedAt 不是時間戳、或超前太多，都會被擋", async () => {
  const token = await registerUser(api, nextEmail());
  assert.equal((await push(token, [change("expenses", "e", { a: 1 }, "昨天")])).status, 400);
  const future = Date.now() + 30 * 24 * 60 * 60 * 1000;
  assert.equal((await push(token, [change("expenses", "e", { a: 1 }, future)])).status, 400);
});

test("單筆 payload 太大會被擋", async () => {
  const token = await registerUser(api, nextEmail());
  const huge = { note: "x".repeat(300 * 1024) };
  const res = await push(token, [change("expenses", "big", huge, 1000)]);
  assert.equal(res.status, 400);
});

test("看不到別人的資料", async () => {
  const alice = await registerUser(api, nextEmail());
  const bob = await registerUser(api, nextEmail());
  await push(alice, [change("expenses", "secret", { amount: 42 }, 1000)]);
  assert.equal((await pull(bob, 0)).body.changes.length, 0);
});

test("status 會分資料表報數，墓碑另外算", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [
    change("expenses", "e1", { amount: 1 }, 1000),
    change("expenses", "e2", { amount: 2 }, 1000),
    change("trips", "t1", { name: "花蓮" }, 1000),
  ]);
  await push(token, [tombstone("expenses", "e2", 2000)]);

  const res = await api("GET", "/api/sync/status", { token });
  assert.equal(res.body.collections.expenses.live, 1);
  assert.equal(res.body.collections.expenses.tombstones, 1);
  assert.equal(res.body.collections.trips.live, 1);
  assert.equal(res.body.totals.live, 2);
});

test("清空雲端要帶 confirm，清完 cursor 不會倒退", async () => {
  const token = await registerUser(api, nextEmail());
  await push(token, [change("expenses", "e1", { amount: 1 }, 1000)]);
  const before = (await api("GET", "/api/sync/status", { token })).body.cursor;

  assert.equal((await api("DELETE", "/api/sync/data", { token })).status, 400);

  const res = await api("DELETE", "/api/sync/data?confirm=yes", { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.removed, 1);
  /* cursor 歸零的話，舊裝置會以為自己已經是最新的，永遠拉不到「東西被清掉了」 */
  assert.ok(res.body.cursor >= before);
  assert.equal((await api("GET", "/api/sync/status", { token })).body.totals.live, 0);
});

test("空的 changes 是合法的 no-op", async () => {
  const token = await registerUser(api, nextEmail());
  const res = await push(token, []);
  assert.equal(res.status, 200);
  assert.equal(res.body.results.length, 0);
});

test("changes 不是陣列會被擋", async () => {
  const token = await registerUser(api, nextEmail());
  const res = await api("POST", "/api/sync/push", { token, body: { changes: "nope" } });
  assert.equal(res.status, 400);
});

test("since 給負數會被擋", async () => {
  const token = await registerUser(api, nextEmail());
  assert.equal((await pull(token, -1)).status, 400);
});
