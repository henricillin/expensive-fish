/* 共享方案。

   一個方案（trip）配一個 share，成員各自用自己的帳號登入、同步同一份資料。
   伺服器只多懂兩件事：

   1. **哪些資料屬於哪個方案。** 靠 SHARED_COLLECTIONS 去 payload 裡撈 tripId／listId
      （方案本身則是 uid 就等於方案 id）。這是伺服器唯一會去看 payload 內容的地方。
   2. **誰在這個 share 裡。** 推上來的資料如果屬於某個 share，就複製給每一位成員
      （每人一列，各自帶自己的 version，不然增量拉取會對不起來）。

   「誰是誰」（member_id）純粹是給 client 用的：每台裝置要知道「我在這個方案裡是哪一位」
   才算得出「我的份」。伺服器只負責不讓兩個人認領同一個位子。 */
import crypto from "node:crypto";
import { SHARED_COLLECTIONS, SHARE_CODE_ALPHABET, SHARE_CODE_LENGTH } from "./config.js";
import { transaction } from "./db.js";

export class ShareError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ShareError";
    this.status = status;
    this.code = code;
  }
}

export function newShareCode() {
  const bytes = crypto.randomBytes(SHARE_CODE_LENGTH);
  let out = "";
  for (const b of bytes) out += SHARE_CODE_ALPHABET[b % SHARE_CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* 這筆變更屬於哪個方案？回傳方案的 uid，不屬於任何方案就 null。
   刪除（payload 是 null）查不出來——那時要看資料庫裡原本那列的 share_id。 */
export function tripUidOf(collection, uid, payload) {
  if (!(collection in SHARED_COLLECTIONS)) return null;
  const field = SHARED_COLLECTIONS[collection];
  if (field === null) return uid;
  const value = payload?.[field];
  return typeof value === "string" && value ? value : null;
}

export function createShareStore(db) {
  const stmt = {
    byId: db.prepare(`SELECT * FROM shares WHERE id = ?`),
    byTrip: db.prepare(`SELECT * FROM shares WHERE trip_uid = ?`),
    byCode: db.prepare(`SELECT * FROM shares WHERE code = ?`),
    insertShare: db.prepare(
      `INSERT INTO shares (trip_uid, owner_id, code, created_at) VALUES (?, ?, ?, ?)`
    ),
    deleteShare: db.prepare(`DELETE FROM shares WHERE id = ?`),
    addMember: db.prepare(
      `INSERT INTO share_members (share_id, user_id, member_id, joined_at) VALUES (?, ?, ?, ?)`
    ),
    setMemberId: db.prepare(`UPDATE share_members SET member_id = ? WHERE share_id = ? AND user_id = ?`),
    removeMember: db.prepare(`DELETE FROM share_members WHERE share_id = ? AND user_id = ?`),
    membership: db.prepare(`SELECT * FROM share_members WHERE share_id = ? AND user_id = ?`),
    members: db.prepare(
      `SELECT m.user_id AS userId, m.member_id AS memberId, m.joined_at AS joinedAt, u.email
         FROM share_members m JOIN users u ON u.id = m.user_id
        WHERE m.share_id = ? ORDER BY m.joined_at`
    ),
    memberUserIds: db.prepare(`SELECT user_id AS userId FROM share_members WHERE share_id = ?`),
    claimedBy: db.prepare(
      `SELECT user_id AS userId FROM share_members WHERE share_id = ? AND member_id = ?`
    ),
    sharesOfUser: db.prepare(
      `SELECT s.* FROM shares s JOIN share_members m ON m.share_id = s.id
        WHERE m.user_id = ? ORDER BY s.created_at`
    ),
  };

  function membersOf(shareId) {
    return stmt.members.all(shareId);
  }

  function memberUserIds(shareId) {
    return stmt.memberUserIds.all(shareId).map((r) => r.userId);
  }

  function isMember(shareId, userId) {
    return Boolean(stmt.membership.get(shareId, userId));
  }

  function resolveByTrip(tripUid) {
    return tripUid ? stmt.byTrip.get(tripUid) || null : null;
  }

  /* client 看到的樣子。member_id 只有自己那份是「我」，其他人的拿來標
     「這個位子已經被認領了」。 */
  function present(share, userId) {
    const members = membersOf(share.id);
    const mine = members.find((m) => m.userId === userId);
    return {
      id: share.id,
      tripUid: share.trip_uid,
      code: share.code,
      isOwner: share.owner_id === userId,
      myMemberId: mine?.memberId ?? null,
      createdAt: share.created_at,
      members: members.map((m) => ({
        memberId: m.memberId,
        email: m.email,
        isMe: m.userId === userId,
        isOwner: share.owner_id === m.userId,
        joinedAt: m.joinedAt,
      })),
    };
  }

  function listForUser(userId) {
    return stmt.sharesOfUser.all(userId).map((s) => present(s, userId));
  }

  function getForUser(shareId, userId) {
    const share = stmt.byId.get(shareId);
    if (!share || !isMember(share.id, userId)) {
      throw new ShareError(404, "share_not_found", "找不到這個共享方案");
    }
    return share;
  }

  function claimSeat(shareId, userId, memberId) {
    const value = memberId === null || memberId === undefined ? null : String(memberId).trim();
    if (value !== null) {
      if (!value || value.length > 200) {
        throw new ShareError(400, "invalid_member_id", "成員身分不正確");
      }
      const taken = stmt.claimedBy.get(shareId, value);
      if (taken && taken.userId !== userId) {
        throw new ShareError(409, "member_taken", "這個位子已經有人認領了，請選別的");
      }
    }
    stmt.setMemberId.run(value, shareId, userId);
  }

  /* 開始共享。方案本身和它底下的資料要等 client 重新推一次才會標上 share_id——
     client 在建立共享之後會把整個方案的資料重新蓋一次時間戳送上來。 */
  const create = transaction(db, (userId, { tripUid, memberId }) => {
    const uid = String(tripUid || "").trim();
    if (!uid || uid.length > 200) throw new ShareError(400, "invalid_trip", "方案 id 不正確");
    const existing = stmt.byTrip.get(uid);
    if (existing) {
      if (existing.owner_id === userId || isMember(existing.id, userId)) {
        return present(existing, userId);
      }
      throw new ShareError(409, "already_shared", "這個方案已經被別人共享了");
    }

    let code = newShareCode();
    for (let i = 0; i < 5 && stmt.byCode.get(code); i++) code = newShareCode();
    if (stmt.byCode.get(code)) throw new ShareError(500, "code_collision", "產生邀請碼失敗，請再試一次");

    const info = stmt.insertShare.run(uid, userId, code, Date.now());
    const shareId = Number(info.lastInsertRowid);
    stmt.addMember.run(shareId, userId, null, Date.now());
    claimSeat(shareId, userId, memberId ?? null);
    return present(stmt.byId.get(shareId), userId);
  });

  /* 用邀請碼加入。加入時還不知道自己是方案裡的哪一位——資料要先同步下來，
     使用者看得到名單才選得了，所以 member_id 先留白。 */
  const join = transaction(db, (userId, { code }) => {
    const share = stmt.byCode.get(normalizeCode(code));
    if (!share) throw new ShareError(404, "invalid_code", "邀請碼不對，或這個共享已經解散了");
    if (!isMember(share.id, userId)) {
      stmt.addMember.run(share.id, userId, null, Date.now());
    }
    return present(share, userId);
  });

  const claim = transaction(db, (userId, shareId, memberId) => {
    const share = getForUser(shareId, userId);
    claimSeat(share.id, userId, memberId);
    return present(share, userId);
  });

  return {
    membersOf,
    memberUserIds,
    isMember,
    resolveByTrip,
    listForUser,
    getForUser,
    present,
    create,
    join,
    claim,
    stmt,
  };
}
