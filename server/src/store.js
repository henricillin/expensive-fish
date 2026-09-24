/* 同步的核心。伺服器不看懂 payload 裡面是什麼，只管三件事：
   1. (collection, uid) 是一筆資料的身分——uid 由 client 產生、跨裝置不變
   2. updated_at 決定誰比較新（last-write-wins）
   3. version 是這個使用者的變更流水號，client 靠它只拉新的

   version 一筆一號（不是一批一號）。這樣分頁才安全：拉了 500 筆之後
   用「最後一筆的 version」當游標接著拉，不會漏掉同批但沒拉到的那些。

   共享方案是唯一的例外：屬於某個 share 的資料，寫進來時會複製給每一位成員
   （每人一列、各自的 version，不然增量拉取會對不起來），內容則保持一致。
   判斷「這筆屬於哪個方案」在 shares.js，那也是伺服器唯一會看 payload 內容的地方。 */
import { COLLECTION_SET, config } from "./config.js";
import { transaction } from "./db.js";
import { ShareError, tripUidOf } from "./shares.js";

/* 時鐘歪掉的裝置若送出 3000 年的 updated_at，那筆資料就再也蓋不掉了。
   給一天的寬容度，超過直接退回去。 */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

function rowToChange(row) {
  return {
    collection: row.collection,
    uid: row.uid,
    deleted: Boolean(row.deleted),
    updatedAt: row.updated_at,
    version: row.version,
    payload: row.deleted ? null : JSON.parse(row.payload),
  };
}

export function validateChange(change, index) {
  const at = (msg) => new ValidationError(msg, { index, change: change?.uid });

  if (!change || typeof change !== "object") throw at("變更格式錯誤");
  if (!COLLECTION_SET.has(change.collection)) throw at(`不認得的資料表：${change.collection}`);
  if (typeof change.uid !== "string" || !change.uid || change.uid.length > 200) {
    throw at("uid 必須是 1–200 字的字串");
  }
  const updatedAt = Number(change.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || !Number.isSafeInteger(updatedAt)) {
    throw at("updatedAt 必須是毫秒時間戳");
  }
  if (updatedAt > Date.now() + MAX_CLOCK_SKEW_MS) {
    throw at("updatedAt 超前太多，請檢查裝置時間");
  }

  const deleted = Boolean(change.deleted);
  let payload = null;
  let data = null;
  if (!deleted) {
    if (!change.payload || typeof change.payload !== "object" || Array.isArray(change.payload)) {
      throw at("payload 必須是物件");
    }
    data = change.payload;
    payload = JSON.stringify(change.payload);
    if (Buffer.byteLength(payload, "utf8") > config.maxPayloadBytes) {
      throw at(`單筆資料太大（上限 ${Math.round(config.maxPayloadBytes / 1024)} KB）`);
    }
  }

  return { collection: change.collection, uid: change.uid, updatedAt, deleted, payload, data };
}

export function createStore(db, shares) {
  const stmt = {
    getRecord: db.prepare(
      `SELECT collection, uid, payload, updated_at, deleted, version, share_id
         FROM records WHERE user_id = ? AND collection = ? AND uid = ?`
    ),
    /* 共享那份的定案：同一個 (share, collection, uid) 取 updated_at 最大的那列。
       SQLite 保證 GROUP BY 配 MAX() 時，其他欄位來自同一列；這裡沒有 GROUP BY，
       整個查詢就是一組，沒有資料時 updated_at 會是 NULL。 */
    newestInShare: db.prepare(
      `SELECT collection, uid, payload, MAX(updated_at) AS updated_at, deleted, version, share_id
         FROM records WHERE share_id = ? AND collection = ? AND uid = ?`
    ),
    shareRecords: db.prepare(
      `SELECT collection, uid, payload, MAX(updated_at) AS updated_at, deleted
         FROM records WHERE share_id = ? GROUP BY collection, uid`
    ),
    ownRecordsInShare: db.prepare(
      `SELECT collection, uid FROM records WHERE user_id = ? AND share_id = ?`
    ),
    upsert: db.prepare(
      `INSERT INTO records (user_id, collection, uid, payload, updated_at, deleted, version, share_id)
            VALUES (@userId, @collection, @uid, @payload, @updatedAt, @deleted, @version, @shareId)
       ON CONFLICT(user_id, collection, uid) DO UPDATE SET
            payload    = excluded.payload,
            updated_at = excluded.updated_at,
            deleted    = excluded.deleted,
            version    = excluded.version,
            share_id   = excluded.share_id`
    ),
    detachShare: db.prepare(`UPDATE records SET share_id = NULL WHERE share_id = ?`),
    getCursor: db.prepare(`SELECT cursor FROM users WHERE id = ?`),
    setCursor: db.prepare(`UPDATE users SET cursor = ? WHERE id = ?`),
    pull: db.prepare(
      `SELECT collection, uid, payload, updated_at, deleted, version
         FROM records
        WHERE user_id = ? AND version > ?
        ORDER BY version
        LIMIT ?`
    ),
    counts: db.prepare(
      `SELECT collection,
              SUM(CASE WHEN deleted = 0 THEN 1 ELSE 0 END) AS live,
              SUM(CASE WHEN deleted = 1 THEN 1 ELSE 0 END) AS tombstones
         FROM records WHERE user_id = ? GROUP BY collection`
    ),
    wipe: db.prepare(`DELETE FROM records WHERE user_id = ?`),
    maxVersion: db.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM records WHERE user_id = ?`),
  };

  function cursorOf(userId) {
    return stmt.getCursor.get(userId)?.cursor ?? 0;
  }

  /* 一批寫入裡每個被寫到的使用者各自往前跑自己的號碼，最後一次寫回 users.cursor。 */
  function makeCursors() {
    const cache = new Map();
    return {
      next(userId) {
        const value = (cache.has(userId) ? cache.get(userId) : cursorOf(userId)) + 1;
        cache.set(userId, value);
        return value;
      },
      get(userId) {
        return cache.has(userId) ? cache.get(userId) : cursorOf(userId);
      },
      flush() {
        for (const [userId, value] of cache) stmt.setCursor.run(value, userId);
      },
    };
  }

  /* 拉 version 比 since 大的變更。多回一筆來判斷還有沒有下一頁，
     省掉一次 COUNT(*)。 */
  function pull(userId, since, limit) {
    const size = Math.min(Math.max(1, limit || config.defaultPullLimit), config.maxPullLimit);
    const rows = stmt.pull.all(userId, since, size + 1);
    const hasMore = rows.length > size;
    const page = hasMore ? rows.slice(0, size) : rows;
    const changes = page.map(rowToChange);
    return {
      changes,
      /* 沒有下一頁時直接跳到使用者目前的 cursor，
         這樣 client 記下的游標才不會停在最後一筆資料的號碼上。 */
      cursor: hasMore ? page[page.length - 1].version : cursorOf(userId),
      hasMore,
    };
  }

  /* 這筆變更屬於哪個共享方案。刪除沒有 payload 查不出來，看原本那列的 share_id。 */
  function shareIdFor(userId, change, ownRow) {
    if (change.deleted) return ownRow?.share_id ?? null;
    const share = shares.resolveByTrip(tripUidOf(change.collection, change.uid, change.data));
    if (!share) return null;
    if (!shares.isMember(share.id, userId)) {
      throw new ShareError(403, "not_a_member", "你不在這個共享方案裡");
    }
    return share.id;
  }

  /* 一批變更一個 transaction：要嘛全進去，要嘛一筆都不進去。
     中途壞掉留下半套資料，比整批失敗難處理得多。 */
  const applyBatch = transaction(db, (userId, changes) => {
    const cursors = makeCursors();
    const results = [];

    const write = (targetId, change, shareId) => {
      stmt.upsert.run({
        userId: targetId,
        collection: change.collection,
        uid: change.uid,
        payload: change.deleted ? null : change.payload,
        updatedAt: change.updatedAt,
        deleted: change.deleted ? 1 : 0,
        version: cursors.next(targetId),
        shareId: shareId ?? null,
      });
    };

    for (const change of changes) {
      const own = stmt.getRecord.get(userId, change.collection, change.uid);
      const previousShareId = own?.share_id ?? null;
      const shareId = shareIdFor(userId, change, own);

      /* 共享的資料以「這個 share 裡最新的那列」當基準，不是自己那列——
         別人剛改好的東西，不能被一台還沒同步到的裝置拿舊資料蓋掉。 */
      const newest = shareId
        ? stmt.newestInShare.get(shareId, change.collection, change.uid)
        : null;
      const base = newest && newest.updated_at !== null ? newest : own;

      if (base) {
        /* 伺服器上比較新 → 退回去，順便把贏的那份給 client 蓋回去。
           時間一樣但內容不同也算 stale：由伺服器這份當定案，
           兩台裝置各拉一次就會收斂到同一個值。 */
        const serverNewer =
          base.updated_at > change.updatedAt ||
          (base.updated_at === change.updatedAt &&
            (Boolean(base.deleted) !== change.deleted || base.payload !== change.payload));
        if (serverNewer) {
          results.push({
            collection: change.collection,
            uid: change.uid,
            status: "stale",
            server: rowToChange(base),
          });
          continue;
        }
      }

      /* 內容一樣、share 歸屬也一樣，才真的沒動過。剛開始共享的那一輪內容確實沒變，
         但 share_id 要補上去，那種就得照寫。 */
      if (
        own &&
        own.updated_at === change.updatedAt &&
        Boolean(own.deleted) === change.deleted &&
        own.payload === change.payload &&
        (own.share_id ?? null) === shareId
      ) {
        results.push({ collection: change.collection, uid: change.uid, status: "unchanged" });
        continue;
      }

      const targets = shareId ? shares.memberUserIds(shareId) : [userId];
      for (const targetId of targets) write(targetId, change, shareId);

      /* 從共享方案搬出去了（例如把一筆花費移出方案）：其他成員手上那份要收到墓碑，
         不然那筆會永遠留在他們裝置上，而且再也不會更新。 */
      if (previousShareId && previousShareId !== shareId) {
        const tombstone = { ...change, deleted: true, payload: null };
        for (const targetId of shares.memberUserIds(previousShareId)) {
          if (targetId !== userId) write(targetId, tombstone, null);
        }
      }

      results.push({
        collection: change.collection,
        uid: change.uid,
        status: "applied",
        version: cursors.get(userId),
      });
    }

    cursors.flush();
    return { cursor: cursors.get(userId), results };
  });

  function push(userId, rawChanges) {
    if (!Array.isArray(rawChanges)) throw new ValidationError("changes 必須是陣列");
    if (rawChanges.length > config.maxPushRecords) {
      throw new ValidationError(`一次最多 ${config.maxPushRecords} 筆，請分批上傳`);
    }
    if (rawChanges.length === 0) return { cursor: cursorOf(userId), results: [] };

    /* 先全部驗完再進 transaction：一筆格式壞掉就整批退回，
       不會有「前半段寫進去了、後半段沒有」這種狀態。 */
    const changes = rawChanges.map(validateChange);

    /* 同一批出現同一個 uid 兩次（client 沒去重）→ 留最後那筆。 */
    const seen = new Map();
    for (const c of changes) seen.set(`${c.collection}|${c.uid}`, c);

    return applyBatch(userId, [...seen.values()]);
  }

  /* ---- 共享方案的資料搬運 ---- */

  /* 剛加入的人要拿到這個方案已經有的東西：現有的複製一份給他，
     帶他自己的 version，下一次 pull 就整批下來了。 */
  const backfillShare = transaction(db, (shareId, userId) => {
    const cursors = makeCursors();
    const rows = stmt.shareRecords.all(shareId);
    for (const row of rows) {
      stmt.upsert.run({
        userId,
        collection: row.collection,
        uid: row.uid,
        payload: row.deleted ? null : row.payload,
        updatedAt: row.updated_at,
        deleted: row.deleted ? 1 : 0,
        version: cursors.next(userId),
        shareId,
      });
    }
    cursors.flush();
    return rows.length;
  });

  /* 有人離開（或共享被解散）：他手上那份轉成墓碑，裝置下次同步就會把方案收掉。
     資料本身不會消失——其他成員各有自己的複本。 */
  const detachMember = transaction(db, (shareId, userId) => {
    const cursors = makeCursors();
    const rows = stmt.ownRecordsInShare.all(userId, shareId);
    const now = Date.now();
    for (const row of rows) {
      stmt.upsert.run({
        userId,
        collection: row.collection,
        uid: row.uid,
        payload: null,
        updatedAt: now,
        deleted: 1,
        version: cursors.next(userId),
        shareId: null,
      });
    }
    cursors.flush();
    return rows.length;
  });

  /* 解散共享：留下來的那個人（擁有者）資料照舊，只是不再屬於任何 share。 */
  function releaseShare(shareId) {
    return stmt.detachShare.run(shareId).changes;
  }

  function status(userId) {
    const collections = {};
    let live = 0;
    let tombstones = 0;
    for (const row of stmt.counts.all(userId)) {
      collections[row.collection] = { live: row.live, tombstones: row.tombstones };
      live += row.live;
      tombstones += row.tombstones;
    }
    return { cursor: cursorOf(userId), totals: { live, tombstones }, collections };
  }

  /* 清空雲端。cursor 不歸零——歸零的話舊裝置會以為自己已經同步到最新，
     再也拉不到「東西被清掉了」這件事。 */
  function wipe(userId) {
    const removed = transaction(db, () => {
      const n = stmt.wipe.run(userId).changes;
      const cursor = Math.max(cursorOf(userId), stmt.maxVersion.get(userId).v);
      stmt.setCursor.run(cursor, userId);
      return n;
    })();
    return { removed, cursor: cursorOf(userId) };
  }

  return { pull, push, status, wipe, cursorOf, backfillShare, detachMember, releaseShare };
}
