import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer, registerUser } from "./helpers.js";

const { api } = await startTestServer();

test("健康檢查會列出支援的資料表", async () => {
  const res = await api("GET", "/api/health");
  assert.equal(res.status, 200);
  assert.ok(res.body.collections.includes("expenses"));
});

test("註冊成功會直接拿到 token", async () => {
  const res = await api("POST", "/api/auth/register", {
    body: { email: "New@Example.com ", password: "hunter2hunter2", deviceName: "iPhone" },
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  /* Email 一律轉小寫去空白，不然同一個人會註冊出兩個帳號 */
  assert.equal(res.body.user.email, "new@example.com");
});

test("同一個 Email 不能註冊兩次", async () => {
  await api("POST", "/api/auth/register", { body: { email: "dup@example.com", password: "hunter2hunter2" } });
  const res = await api("POST", "/api/auth/register", {
    body: { email: "dup@example.com", password: "hunter2hunter2" },
  });
  assert.equal(res.status, 409);
});

test("密碼太短會被擋下來", async () => {
  const res = await api("POST", "/api/auth/register", { body: { email: "s@example.com", password: "123" } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "weak_password");
});

test("Email 格式不對會被擋下來", async () => {
  const res = await api("POST", "/api/auth/register", { body: { email: "nope", password: "hunter2hunter2" } });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "invalid_email");
});

test("密碼錯與帳號不存在回一樣的錯，不洩漏哪個 Email 註冊過", async () => {
  await api("POST", "/api/auth/register", { body: { email: "real@example.com", password: "hunter2hunter2" } });
  const wrongPassword = await api("POST", "/api/auth/login", {
    body: { email: "real@example.com", password: "totally-wrong" },
  });
  const noSuchUser = await api("POST", "/api/auth/login", {
    body: { email: "ghost@example.com", password: "totally-wrong" },
  });
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(wrongPassword.body, noSuchUser.body);
});

test("登入拿到的 token 可以問到自己是誰", async () => {
  await api("POST", "/api/auth/register", { body: { email: "me@example.com", password: "hunter2hunter2" } });
  const login = await api("POST", "/api/auth/login", {
    body: { email: "me@example.com", password: "hunter2hunter2", deviceName: "Pixel" },
  });
  const me = await api("GET", "/api/auth/me", { token: login.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "me@example.com");
  assert.ok(me.body.devices.some((d) => d.name === "Pixel"));
});

test("沒有 token 或 token 亂打都是 401", async () => {
  assert.equal((await api("GET", "/api/sync/status")).status, 401);
  assert.equal((await api("GET", "/api/sync/status", { token: "garbage" })).status, 401);
});

test("登出之後 token 就失效", async () => {
  const token = await registerUser(api, "bye@example.com");
  assert.equal((await api("POST", "/api/auth/logout", { token })).status, 200);
  assert.equal((await api("GET", "/api/sync/status", { token })).status, 401);
});

test("改密碼會把其他裝置踢掉，只留下改密碼的這台", async () => {
  await api("POST", "/api/auth/register", { body: { email: "pw@example.com", password: "hunter2hunter2" } });
  const phone = (await api("POST", "/api/auth/login", { body: { email: "pw@example.com", password: "hunter2hunter2" } })).body.token;
  const laptop = (await api("POST", "/api/auth/login", { body: { email: "pw@example.com", password: "hunter2hunter2" } })).body.token;

  const res = await api("POST", "/api/auth/password", {
    token: laptop,
    body: { currentPassword: "hunter2hunter2", newPassword: "correct-horse-battery" },
  });
  assert.equal(res.status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: laptop })).status, 200);
  assert.equal((await api("GET", "/api/auth/me", { token: phone })).status, 401);
});

test("目前密碼打錯就不能改密碼", async () => {
  const token = await registerUser(api, "pw2@example.com");
  const res = await api("POST", "/api/auth/password", {
    token,
    body: { currentPassword: "wrong", newPassword: "correct-horse-battery" },
  });
  assert.equal(res.status, 401);
});
