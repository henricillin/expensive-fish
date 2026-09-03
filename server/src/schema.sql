-- 一個使用者一份資料。cursor 是這個使用者的變更流水號：
-- 每套用一筆變更就 +1，client 靠它做增量拉取（拉 version > 上次拿到的 cursor）。
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  cursor        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- token 本身不落地，只存 sha256，資料庫被看到也登不進來。
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name  TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

-- 共享方案：一個方案（trip）配一個 share，成員各自用自己的帳號同步同一份資料。
-- 伺服器只認「哪些資料屬於哪個 share」和「誰在裡面」，內容一樣不看。
CREATE TABLE IF NOT EXISTS shares (
  id         INTEGER PRIMARY KEY,
  trip_uid   TEXT    NOT NULL UNIQUE,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT    NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- member_id 是「這個帳號在方案裡是哪一位」，值就是 client 那邊的 personId。
-- 剛加入還沒認領的人是 NULL；同一個位子不能兩個人認領，不然兩台裝置
-- 都會把同一個人當成「我」，分帳就錯了。
CREATE TABLE IF NOT EXISTS share_members (
  share_id  INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (share_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS share_members_claim
  ON share_members(share_id, member_id) WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS share_members_user ON share_members(user_id);

-- 同步的最小單位。伺服器不理解 payload 的內容，只認 (collection, uid)
-- 這個 client 給的穩定身分，以及 updated_at 這個「誰比較新」的依據。
-- 刪除不真的刪，寫成 deleted = 1 的墓碑，不然離線的那台裝置會把它救回來。
--
-- share_id 不是 NULL 就代表這筆屬於一個共享方案。每個成員各有一列自己的複本
-- （version 是每個人自己的流水號，共用一列的話拉取就對不起來），內容保持一致。
CREATE TABLE IF NOT EXISTS records (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection TEXT    NOT NULL,
  uid        TEXT    NOT NULL,
  payload    TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  version    INTEGER NOT NULL,
  share_id   INTEGER REFERENCES shares(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, collection, uid)
);

-- 增量拉取就吃這條索引：WHERE user_id = ? AND version > ? ORDER BY version
CREATE INDEX IF NOT EXISTS records_pull ON records(user_id, version);

-- 共享那份的「定案」要查得快：同一個 (share, collection, uid) 每個成員各一列，
-- 取 updated_at 最大的那列當基準，A 推一筆舊的才不會把 B 剛改好的蓋掉。
CREATE INDEX IF NOT EXISTS records_share ON records(share_id, collection, uid);
