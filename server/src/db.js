/* 資料庫用 Node 內建的 node:sqlite（22.5+），不裝 better-sqlite3。
   原因很實際：better-sqlite3 是原生模組，Node 版本一跳就要重編，
   Windows 上沒裝 Visual Studio 直接掛掉。內建的這顆不用編、跟著 Node 走。 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const SCHEMA_PATH = new URL("./schema.sql", import.meta.url);

export function openDatabase(dbPath = config.dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);

  /* WAL 讓「一邊寫一邊讀」不互卡；foreign_keys 預設是關的，
     不打開的話刪掉帳號不會連帶清掉 records 和 sessions。 */
  if (dbPath !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

/* node:sqlite 沒有 better-sqlite3 那種 db.transaction()，自己包一個。
   巢狀時用 SAVEPOINT，這樣裡層失敗不會把外層整筆吞掉。 */
const depth = new WeakMap();

export function transaction(db, fn) {
  return (...args) => {
    const level = depth.get(db) || 0;
    const name = `sp_${level}`;
    db.exec(level === 0 ? "BEGIN" : `SAVEPOINT ${name}`);
    depth.set(db, level + 1);
    try {
      const result = fn(...args);
      db.exec(level === 0 ? "COMMIT" : `RELEASE ${name}`);
      return result;
    } catch (err) {
      try {
        db.exec(level === 0 ? "ROLLBACK" : `ROLLBACK TO ${name}`);
        if (level > 0) db.exec(`RELEASE ${name}`);
      } catch {
        /* rollback 也失敗就只能讓原本的錯誤上去，蓋掉它沒有幫助 */
      }
      throw err;
    } finally {
      depth.set(db, level);
    }
  };
}

export function userVersion(db) {
  return db.prepare("PRAGMA user_version").get().user_version;
}

/* 之後改 schema 就往這裡加一個 function，user_version 記住做到哪。
   （第一版沒有東西要搬，先留著位置。） */
const MIGRATIONS = [];

export function migrate(db) {
  for (let i = userVersion(db); i < MIGRATIONS.length; i++) {
    transaction(db, () => {
      MIGRATIONS[i](db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    })();
  }
  return MIGRATIONS.length;
}
