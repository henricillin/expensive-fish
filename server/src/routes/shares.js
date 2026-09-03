/* 共享方案的端點。資料本身還是走 /api/sync，這裡只管「誰跟誰共享哪個方案」。 */
import express from "express";
import { requireAuth } from "../auth.js";
import { ShareError, createShareStore } from "../shares.js";
import { createStore } from "../store.js";

const a = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function shareRoutes(db) {
  const router = express.Router();
  const auth = requireAuth(db);
  const shares = createShareStore(db);
  const store = createStore(db, shares);

  router.use(auth);

  /* client 每輪同步都會問一次：我在哪些共享方案裡、我在裡面是誰。
     這份名單不走同步資料流，所以不會有 last-write-wins 的問題。 */
  router.get(
    "/",
    a(async (req, res) => {
      res.json({ shares: shares.listForUser(req.user.id) });
    })
  );

  /* 開始共享一個方案。回來之後 client 要把整個方案的資料重新推一次
     （蓋上新的 updatedAt），伺服器才會把它們標成這個 share 的。 */
  router.post(
    "/",
    a(async (req, res) => {
      const share = shares.create(req.user.id, {
        tripUid: req.body?.tripUid,
        memberId: req.body?.memberId ?? null,
      });
      res.status(201).json({ share });
    })
  );

  /* 用邀請碼加入。加入時還不知道自己是方案裡的哪一位——名單要等資料同步下來
     才看得到，所以先進去，之後再 claim。 */
  router.post(
    "/join",
    a(async (req, res) => {
      const share = shares.join(req.user.id, { code: req.body?.code });
      const backfilled = store.backfillShare(share.id, req.user.id);
      res.json({ share: shares.present(shares.getForUser(share.id, req.user.id), req.user.id), backfilled });
    })
  );

  /* 認領「我是方案裡的哪一位」。同一個位子只能有一個人。 */
  router.post(
    "/:id/claim",
    a(async (req, res) => {
      const share = shares.claim(req.user.id, Number(req.params.id), req.body?.memberId ?? null);
      res.json({ share });
    })
  );

  /* 離開共享。自己這邊的資料會收到墓碑（裝置上的方案會消失），
     其他成員的不動。擁有者不能離開，只能解散。 */
  router.post(
    "/:id/leave",
    a(async (req, res) => {
      const share = shares.getForUser(Number(req.params.id), req.user.id);
      if (share.owner_id === req.user.id) {
        throw new ShareError(400, "owner_cannot_leave", "你是發起人，請改用「解散共享」");
      }
      const removed = store.detachMember(share.id, req.user.id);
      shares.stmt.removeMember.run(share.id, req.user.id);
      res.json({ ok: true, removed });
    })
  );

  /* 解散共享（只有發起人能做）。其他成員的資料會收到墓碑，
     發起人自己的留著，變回一個普通的私人方案。 */
  router.delete(
    "/:id",
    a(async (req, res) => {
      const share = shares.getForUser(Number(req.params.id), req.user.id);
      if (share.owner_id !== req.user.id) {
        throw new ShareError(403, "not_owner", "只有發起人可以解散共享");
      }
      let removed = 0;
      for (const member of shares.membersOf(share.id)) {
        if (member.userId === req.user.id) continue;
        removed += store.detachMember(share.id, member.userId);
      }
      store.releaseShare(share.id);
      shares.stmt.deleteShare.run(share.id);
      res.json({ ok: true, removed });
    })
  );

  router.use((err, req, res, next) => {
    if (err instanceof ShareError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  });

  return router;
}
