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

-- 同步的最小單位。伺服器不理解 payload 的內容，只認 (collection, uid)
-- 這個 client 給的穩定身分，以及 updated_at 這個「誰比較新」的依據。
-- 刪除不真的刪，寫成 deleted = 1 的墓碑，不然離線的那台裝置會把它救回來。
CREATE TABLE IF NOT EXISTS records (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection TEXT    NOT NULL,
  uid        TEXT    NOT NULL,
  payload    TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  version    INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection, uid)
);

-- 增量拉取就吃這條索引：WHERE user_id = ? AND version > ? ORDER BY version
CREATE INDEX IF NOT EXISTS records_pull ON records(user_id, version);
