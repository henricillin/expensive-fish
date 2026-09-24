/* 共享方案的操作介面：開始共享、看邀請碼和成員、加位子、離開／解散。
   資料的搬運都在 trips.js（換 id、重推）和 shares.js（跟伺服器要名單）。 */
import { getTrip, updateTrip, shareTripLocally, unshareTripLocally, tripMembers } from "./trips.js";
import {
  claimSeat,
  claimedMemberIds,
  dissolveShare,
  joinShare,
  leaveShare,
  newMemberId,
  resyncMyShares,
  shareForTrip,
  startShare,
} from "./shares.js";
import { getConfig, isLinked } from "./syncApi.js";
import { syncNow } from "./sync.js";
import { openModal, closeModal, showToast, escapeHtml } from "./ui.js";
import { icon } from "./icons.js";

let currentTripId = null;
let onDoneCallback = null;
let busy = false;
let wired = false;

function els() {
  return {
    body: document.getElementById("share-modal-body"),
    close: document.getElementById("share-close"),
    joinCode: document.getElementById("join-share-code"),
    joinBtn: document.getElementById("join-share-submit"),
    joinCancel: document.getElementById("join-share-cancel"),
  };
}

/* 預設拿 Email 的前半段當名字，總比空白好填。 */
function defaultName() {
  const email = getConfig().email || "";
  return email.split("@")[0] || "我";
}

async function run(label, fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (err) {
    showToast(err.message || `${label}失敗`);
  } finally {
    busy = false;
  }
}

/* ---- 畫面 ---- */

function notLinkedHtml() {
  return `<p class="settings-desc" style="margin-top:0;">
    共享方案要先登入同步（「更多」頁最下面），大家才有各自的帳號可以對上。
  </p>`;
}

function inviteHtml(share) {
  return `<div class="share-code-box">
    <span class="share-code-label">邀請碼</span>
    <span class="share-code">${escapeHtml(share.code)}</span>
    <button type="button" class="btn btn-ghost accent" id="share-copy">複製</button>
  </div>
  <p class="settings-desc">把邀請碼給對方，他在「方案」頁按「加入共享方案」輸入就進得來。</p>`;
}

function rosterHtml(trip, share) {
  const claimed = claimedMemberIds(trip.id);
  const rows = (trip.roster || [])
    .map((m) => {
      const isMe = m.id === share.myMemberId;
      const tag = isMe
        ? `<span class="person-pill">我</span>`
        : claimed.has(m.id)
          ? `<span class="person-pill">已加入</span>`
          : `<span class="person-pill category-pill">還沒加入</span>`;
      return `<div class="balance-row"><span class="name">${escapeHtml(m.name)}</span>${tag}</div>`;
    })
    .join("");
  return `<div class="section-title">成員</div>
    <div class="card">${rows || '<div class="settings-desc" style="margin:0;">名單是空的。</div>'}</div>
    <button type="button" class="btn btn-ghost btn-block" id="share-add-seat" style="margin-top:8px;">加一個人</button>`;
}

/* 還沒選「我是誰」時，其他事都先別做——算不出我的份，記帳也會記錯人。 */
function claimHtml(trip) {
  const claimed = claimedMemberIds(trip.id);
  const free = (trip.roster || []).filter((m) => !claimed.has(m.id));
  const options = free
    .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`)
    .join("");
  return `<div class="section-title">你是這個方案裡的哪一位？</div>
    <div class="field">
      <select id="share-claim-select">
        ${options}
        <option value="__new__">我不在名單上…</option>
      </select>
    </div>
    <button type="button" class="btn btn-primary btn-block" id="share-claim">就是我</button>
    <p class="settings-desc">選好之後這個方案的「我的份」才算得出來。</p>`;
}

async function render() {
  const { body } = els();
  const trip = await getTrip(currentTripId);
  if (!trip) {
    closeModal("share-modal");
    return;
  }
  const share = shareForTrip(trip.id);

  if (!share) {
    body.innerHTML = `<p class="settings-desc" style="margin-top:0;">
        共享之後，這個方案的攜帶清單和帳目會同步給每一位成員：誰帶了什麼、誰付了錢，
        大家看到的是同一份。你其他的記帳不會被看到。
      </p>
      ${isLinked() ? `<button type="button" class="btn btn-primary btn-block" id="share-start">開始共享</button>` : notLinkedHtml()}`;
  } else if (!share.myMemberId) {
    body.innerHTML = claimHtml(trip);
  } else {
    body.innerHTML = `${inviteHtml(share)}
      ${rosterHtml(trip, share)}
      <div class="modal-actions" style="margin-top:14px;">
        ${
          share.isOwner
            ? `<button type="button" class="btn btn-danger" id="share-dissolve">解散共享</button>`
            : `<button type="button" class="btn btn-danger" id="share-leave">離開共享</button>`
        }
      </div>
      <p class="settings-desc">${
        share.isOwner
          ? "解散之後大家手上這個方案會消失，只有你這邊留著。"
          : "離開之後這個方案會從你的裝置上消失，其他人的不受影響。"
      }收據照片不會共享，只留在拍的人手機裡。</p>`;
  }

  wireBody(trip, share);
}

function wireBody(trip, share) {
  const { body } = els();
  const on = (id, fn) => body.querySelector(`#${id}`)?.addEventListener("click", fn);

  on("share-start", () =>
    run("開始共享", async () => {
      const name = (prompt("其他人會看到你叫什麼？", defaultName()) || "").trim();
      if (!name) return;
      const meId = newMemberId(name);
      await startShare(trip.id, meId);
      /* 先把「我」換成真正的成員 id 再推上去，對方收到的才不會是一堆 me */
      await shareTripLocally(trip, meId, name);
      await syncNow();
      showToast("已開始共享");
      onDoneCallback && onDoneCallback();
      await render();
    })
  );

  on("share-copy", async () => {
    try {
      await navigator.clipboard.writeText(share.code);
      showToast("邀請碼已複製");
    } catch {
      showToast("複製失敗，請手動選取");
    }
  });

  on("share-claim", () =>
    run("設定身分", async () => {
      const select = body.querySelector("#share-claim-select");
      let memberId = select?.value || "";
      if (!memberId) return;
      if (memberId === "__new__") {
        const name = (prompt("你的名字？", defaultName()) || "").trim();
        if (!name) return;
        memberId = newMemberId(name);
        await updateTrip(trip.id, { roster: [...(trip.roster || []), { id: memberId, name }] });
      }
      await claimSeat(share.id, memberId);
      await resyncMyShares(trip.id);
      await syncNow();
      showToast("設定好了");
      onDoneCallback && onDoneCallback();
      await render();
    })
  );

  on("share-add-seat", () =>
    run("新增成員", async () => {
      const name = (prompt("這個人叫什麼？", "") || "").trim();
      if (!name) return;
      const fresh = await getTrip(trip.id);
      await updateTrip(trip.id, {
        roster: [...(fresh.roster || []), { id: newMemberId(name), name }],
      });
      await syncNow();
      onDoneCallback && onDoneCallback();
      await render();
    })
  );

  on("share-leave", () =>
    run("離開", async () => {
      if (!confirm("離開之後這個方案會從你的裝置上消失，確定？")) return;
      await leaveShare(share.id);
      await syncNow();
      closeModal("share-modal");
      showToast("已離開共享");
      onDoneCallback && onDoneCallback({ gone: true });
    })
  );

  on("share-dissolve", () =>
    run("解散", async () => {
      if (!confirm("解散之後，其他人手上這個方案會消失（你這邊留著），確定？")) return;
      const meId = share.myMemberId;
      await dissolveShare(share.id);
      const fresh = await getTrip(trip.id);
      if (fresh) await unshareTripLocally(fresh, meId);
      await syncNow();
      showToast("已解散共享");
      onDoneCallback && onDoneCallback();
      await render();
    })
  );
}

function wire() {
  if (wired) return;
  wired = true;
  const { close, joinBtn, joinCancel } = els();
  close.addEventListener("click", () => closeModal("share-modal"));
  joinCancel.addEventListener("click", () => closeModal("join-share-modal"));
  joinBtn.addEventListener("click", submitJoin);
  els().joinCode.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") submitJoin();
  });
}

let onJoined = null;

function submitJoin() {
  return run("加入", async () => {
    const { joinCode } = els();
    const code = joinCode.value.trim();
    if (!code) return;
    const share = await joinShare(code);
    /* 資料要先拉下來，才看得到名單去選「我是誰」 */
    await syncNow();
    closeModal("join-share-modal");
    showToast("加入了，請選你是名單上的哪一位");
    onJoined && onJoined(share.tripUid);
  });
}

export function openShareModal(tripId, onDone) {
  wire();
  currentTripId = tripId;
  onDoneCallback = onDone;
  openModal("share-modal");
  return render();
}

export function openJoinShareModal(onDone) {
  wire();
  onJoined = onDone;
  const { joinCode } = els();
  joinCode.value = "";
  openModal("join-share-modal");
  joinCode.focus();
}
