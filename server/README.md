# 記帳小幫手 — 同步後端

給上層那個記帳 PWA 用的同步伺服器。有帳號、多裝置同步、離線改完再上傳。

資料庫是 Node 內建的 `node:sqlite`，整包只有一個外部相依（Express）。不用編譯、沒有原生模組，`npm install` 之後 `npm start` 就跑得起來。

## 跑起來

```bash
cd server && npm install && npm start
```

預設聽 `http://localhost:8787`，資料庫寫在 `server/data/sync.db`。要改設定就把 `.env.example` 複製成 `.env`：

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PORT` | `8787` | 監聽埠號 |
| `DB_PATH` | `./data/sync.db` | SQLite 檔案位置（相對於 `server/`） |
| `CORS_ORIGINS` | `localhost:8123` / `:8124` | 允許的前端來源，逗號分隔；`*` 代表不限制 |
| `SESSION_DAYS` | `180` | 登入權杖有效天數 |
| `DISABLE_REGISTRATION` | `0` | 設 `1` 之後不能再註冊新帳號（自己註冊完就關掉） |

測試：

```bash
cd server && npm test
```

## 同步是怎麼運作的

伺服器不理解記帳資料的內容，它只認三件事：

1. **`(collection, uid)` 是一筆資料的身分。** `uid` 由 client 產生、跨裝置不變。分類／同伴／方案這種主鍵本來就是字串的，`uid` 就是它的 `id`；支出這種主鍵是自動編號整數的，client 另外存一個 UUID 當 `uid`——每台手機編出來的號碼不一樣，拿 `id` 當身分會對不起來。
2. **`updatedAt` 決定誰比較新。** 同一筆資料兩台裝置都改過，時間新的贏（last-write-wins）。時間一樣但內容不同時，以伺服器上那份為準，兩台裝置各拉一次就會收斂到同一個值。
3. **刪除送的是墓碑，不是「什麼都不送」。** 刪掉的資料在 `records` 裡留下 `deleted = 1` 的紀錄；沒有這個，離線那台裝置下次同步會把它救回來。

`version` 是每個使用者自己的變更流水號，**一筆一號**（不是一批一號）。client 記住上次拿到的號碼，下次只拉比它大的。一筆一號是為了分頁安全：拉了 300 筆之後拿最後一筆的號碼接著拉，不會漏掉同一批但沒拉到的那些。

一輪同步固定是「先推再拉」。推上去的每一筆會拿到 `applied` / `stale` / `unchanged`；`stale` 代表伺服器上那份比較新，回應會附上贏的那份讓 client 直接蓋回去。

### 共享方案

一個方案（trip）配一個 share，成員各自用自己的帳號同步同一份資料。伺服器為此多懂兩件事：

1. **哪些資料屬於哪個方案。** 靠 `SHARED_COLLECTIONS`（`src/config.js`）去 payload 裡撈 `tripId` / `listId`，方案本身則是 uid 就等於方案 id。這是伺服器唯一會看 payload 內容的地方。
2. **誰在這個 share 裡。** 屬於某個 share 的資料寫進來時會**複製給每一位成員**——每人一列、各自的 `version`。共用一列做不到：`version` 是每個使用者自己的流水號，共用的話增量拉取就對不起來。所以 client 端的 pull / push 完全不用改。

幾個細節：

- **定案是「這個 share 裡 `updated_at` 最大的那一列」**，不是推的人自己那一列。不然一台還沒同步到的裝置拿舊資料推上來，就會把別人剛改好的蓋掉。
- **推一筆屬於別人 share 的資料會整批退 403**（`not_a_member`），不能靠猜 `tripId` 寫進別人的資料。
- **從方案搬出去也要處理。** 一筆花費的 `tripId` 被拿掉時，推的人那份留著（變回私人的），其他成員那份會收到墓碑——不然那筆會永遠留在他們裝置上而且再也不會更新。
- **member_id 只是「這個帳號在方案裡是哪一位」**（值就是 client 的 personId），伺服器只負責不讓兩個人認領同一個位子。名字不在這裡，跟著方案的 payload 走。

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/shares` | 我在哪些共享方案裡、我在裡面是誰、還有誰 |
| `POST` | `/api/shares` | `{ tripUid, memberId }` 開始共享，回邀請碼。之後 client 要把整個方案重推一次（蓋新的 `updatedAt`），伺服器才標得上 `share_id` |
| `POST` | `/api/shares/join` | `{ code }` 加入，並把方案現有的資料整批複製給他 |
| `POST` | `/api/shares/:id/claim` | `{ memberId }` 認領「我是哪一位」，重複認領回 409 |
| `POST` | `/api/shares/:id/leave` | 離開；自己那份轉成墓碑，其他人不動。發起人不能離開 |
| `DELETE` | `/api/shares/:id` | 解散（限發起人）；其他成員那份轉成墓碑，發起人的留著變回私人方案 |

**收據照片不同步**（`receipts` 不在 `COLLECTIONS` 名單上）。那是 Blob，走 JSON 同步會讓每次請求從幾十 KB 變成幾十 MB。要加的話得另外做二進位上傳的端點，不能塞進現在這條路。

## API

除了 `/api/health` 和註冊／登入以外，全部都要帶 `Authorization: Bearer <token>`。

### 帳號

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | `{ email, password, deviceName }` → `{ token, expiresAt, user, cursor }` |
| `POST` | `/api/auth/login` | 同上 |
| `GET` | `/api/auth/me` | 帳號資訊 + 目前登入中的裝置清單 |
| `POST` | `/api/auth/logout` | 只登出這個 token |
| `POST` | `/api/auth/logout-all` | 把所有裝置踢掉（手機掉了用這個） |
| `POST` | `/api/auth/password` | `{ currentPassword, newPassword }`，改完會把其他裝置踢掉 |

密碼用 scrypt（Node 內建）雜湊；token 是 32 bytes 亂數，資料庫只存 sha256，所以 DB 被看到也登不進來。登入失敗時，帳號不存在跟密碼打錯回一模一樣的東西，不從回應猜得出哪個 Email 註冊過。註冊／登入／改密碼有節流（每 15 分鐘 20 次）。

### 同步

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/sync/pull?since=N&limit=M` | → `{ changes, cursor, hasMore }`。`hasMore` 為 true 就把 `cursor` 當下一次的 `since` 繼續拉 |
| `POST` | `/api/sync/push` | `{ changes: [...] }` → `{ cursor, applied, stale, results }` |
| `GET` | `/api/sync/status` | 每個 collection 有幾筆、幾個墓碑 |
| `DELETE` | `/api/sync/data?confirm=yes` | 清空這個帳號的雲端資料（裝置上的不動） |

一筆 change 長這樣：

```json
{
  "collection": "expenses",
  "uid": "66693c4c-52cf-44b2-b022-19c7ee9d2e20",
  "deleted": false,
  "updatedAt": 1788361902477,
  "payload": { "amount": 250, "categoryId": "food", "date": "2026-09-02" }
}
```

一批 push 是一個 transaction：**先全部驗完才開始寫**，一筆格式壞掉就整批退回 400，不會留下寫一半的狀態。

上限（`src/config.js` 可調）：一次 push 2000 筆、單筆 payload 256 KB、一次 pull 最多 1000 筆。`updatedAt` 超前現在超過一天會被拒絕——時鐘歪掉的裝置送出 3000 年的時間戳，那筆資料就再也蓋不掉了。

## 檔案

```
src/
  config.js        設定 + .env 讀取 + 可同步／可共享的 collection 白名單
  db.js            開資料庫、transaction 包裝、migration
  schema.sql       users / sessions / shares / share_members / records
  auth.js          scrypt 密碼、token、requireAuth middleware、節流
  shares.js        共享方案：邀請碼、成員、「這筆屬於哪個方案」
  store.js         同步核心：push / pull / status / wipe + 共享的扇出複製
  routes/auth.js   帳號端點
  routes/shares.js 共享方案端點
  routes/sync.js   同步端點
  app.js           Express app、CORS、錯誤處理
  server.js        進入點
test/              node:test，跑在記憶體資料庫上
```

## 部署

沒有建置步驟，把整個資料夾丟上去 `npm ci --omit=dev && npm start` 就好。放在 Nginx／Caddy 之類的反向代理後面時記得：

- **一定要用 HTTPS。** 密碼和 token 是明文走 HTTP 的。
- `CORS_ORIGINS` 設成前端真正的網址。
- 註冊完就把 `DISABLE_REGISTRATION=1` 打開。
- 備份 `data/sync.db`（WAL 模式，連 `-wal`、`-shm` 一起複製，或先停服務再複製）。
