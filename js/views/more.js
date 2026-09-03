import { listCategories } from "../categories.js";
import { getBudget, setBudget, TOTAL_BUDGET_ID } from "../budgets.js";
import { exportJSON, exportCSV, importJSON } from "../exportImport.js";
import { countReceipts } from "../receipts.js";
import { showToast, escapeHtml } from "../ui.js";
import { openCategoryCreator, openCategoryEditor } from "../categoryModal.js";
import { icon, iconBadge } from "../icons.js";
import * as sync from "../sync.js";
import { getShares } from "../shares.js";

export const elementId = "view-more";
export const title = "更多";

let wired = false;

function els() {
  return {
    addCategoryBtn: document.getElementById("more-add-category"),
    categoryList: document.getElementById("more-category-list"),
    splitLink: document.getElementById("more-split-link"),
    totalBudget: document.getElementById("more-total-budget"),
    exportJsonBtn: document.getElementById("more-export-json"),
    exportCsvBtn: document.getElementById("more-export-csv"),
    receiptNote: document.getElementById("more-receipt-note"),
    importFile: document.getElementById("more-import-file"),
    syncSignedOut: document.getElementById("sync-signed-out"),
    syncSignedIn: document.getElementById("sync-signed-in"),
    syncUrl: document.getElementById("sync-url"),
    syncEmail: document.getElementById("sync-email"),
    syncPassword: document.getElementById("sync-password"),
    syncLogin: document.getElementById("sync-login"),
    syncRegister: document.getElementById("sync-register"),
    syncNowBtn: document.getElementById("sync-now"),
    syncLogout: document.getElementById("sync-logout"),
    syncWipe: document.getElementById("sync-wipe"),
    syncDot: document.getElementById("sync-dot"),
    syncAccount: document.getElementById("sync-account"),
    syncDetail: document.getElementById("sync-detail"),
    syncReceiptNote: document.getElementById("sync-receipt-note"),
  };
}

/* 同步狀態這一段完全由 sync.js 推的事件驅動，不自己去問狀態。 */
function renderSync(state) {
  const e = els();
  if (!e.syncSignedIn) return;

  e.syncSignedOut.hidden = state.linked;
  e.syncSignedIn.hidden = !state.linked;
  if (!state.linked) return;

  e.syncAccount.textContent = state.email || "已登入";

  let detail;
  let dot;
  if (state.lastError) {
    detail = state.lastError;
    dot = "error";
  } else if (state.syncing) {
    detail = "同步中…";
    dot = "busy";
  } else if (state.pending > 0) {
    detail = `${state.pending} 筆還沒上傳 · ${sync.formatSyncTime(state.lastSyncAt)}`;
    dot = "pending";
  } else {
    detail = sync.formatSyncTime(state.lastSyncAt);
    dot = "ok";
  }
  e.syncDetail.textContent = detail;
  e.syncDetail.classList.toggle("error", Boolean(state.lastError));
  e.syncDot.className = `sync-dot ${dot}`;
  e.syncNowBtn.disabled = state.syncing;
}

async function wireSync() {
  const e = els();
  if (!e.syncLogin) return;

  const config = sync.getConfig();
  e.syncUrl.value = config.baseUrl || sync.DEFAULT_BASE_URL;
  e.syncEmail.value = config.email || "";

  const signIn = async (register) => {
    const buttons = [e.syncLogin, e.syncRegister];
    buttons.forEach((b) => (b.disabled = true));
    try {
      await sync.link({
        baseUrl: e.syncUrl.value,
        email: e.syncEmail.value,
        password: e.syncPassword.value,
        register,
      });
      e.syncPassword.value = "";
      showToast(register ? "帳號建好了，開始同步" : "登入成功，開始同步");
    } catch (err) {
      showToast(err.message || "登入失敗");
    } finally {
      buttons.forEach((b) => (b.disabled = false));
      renderSync(sync.getState());
    }
  };

  e.syncLogin.addEventListener("click", () => signIn(false));
  e.syncRegister.addEventListener("click", () => signIn(true));

  e.syncNowBtn.addEventListener("click", async () => {
    try {
      const result = await sync.syncNow();
      showToast(`同步完成（上傳 ${result.pushed || 0}、下載 ${result.pulled || 0}）`);
    } catch (err) {
      showToast(err.message || "同步失敗");
    }
  });

  /* 登出只清這台裝置的登入狀態：本機資料留著，雲端那份也留著。 */
  e.syncLogout.addEventListener("click", async () => {
    if (!confirm("要在這台裝置登出嗎？記帳資料會留在這台手機上，雲端那份也不會刪掉。")) return;
    await sync.unlink();
    showToast("已登出");
    renderSync(sync.getState());
  });

  /* 只砍雲端那一份，這台手機上的資料一筆都不動。問兩次是因為砍掉就沒了，
     而且別台裝置下次同步時會把它們當成「還沒上傳」再推一次。 */
  e.syncWipe.addEventListener("click", async () => {
    if (!confirm("這會刪掉伺服器上的所有記帳資料，這台手機上的資料會留著。確定嗎？")) return;
    if (!confirm("再確認一次：雲端資料刪掉之後救不回來。")) return;
    try {
      const result = await sync.wipeCloud();
      await sync.unlink();
      showToast(`已刪掉雲端 ${result.removed} 筆資料並登出`);
    } catch (err) {
      showToast(err.message || "刪除失敗");
    }
    renderSync(sync.getState());
  });

  sync.onSyncChange(renderSync);
  await sync.refreshPending();
  renderSync(sync.getState());
}

/* 收據照片不進同步，跟不進備份是同一個原因（Blob 太大）。 */
async function renderSyncReceiptNote() {
  const { syncReceiptNote } = els();
  if (!syncReceiptNote) return;
  const n = await countReceipts();
  syncReceiptNote.hidden = n === 0;
  if (n) {
    syncReceiptNote.textContent = `注意：${n} 張收據照片不會同步到雲端（照片太大），換裝置的話收據不會跟著過去。`;
  }
}

async function renderCategoryList() {
  const { categoryList } = els();
  const cats = await listCategories();
  categoryList.innerHTML = cats
    .map(
      (c) => `<div class="list-item" data-id="${c.id}" style="cursor:pointer;">
        ${iconBadge(c.icon, c.color, { size: 34, iconSize: 19 })}
        <span class="name">${escapeHtml(c.name)}</span>
        ${c.ratable ? `<span class="tag-pill">可評分</span>` : ""}
        <span class="icon-btn">${icon("chevronRight", { size: 18 })}</span>
      </div>`
    )
    .join("");
  categoryList.querySelectorAll(".list-item").forEach((row) => {
    row.addEventListener("click", () => {
      const cat = cats.find((c) => c.id === row.dataset.id);
      openCategoryEditor(cat, refresh);
    });
  });
}

function renderStaticBits() {
  const { splitLink, addCategoryBtn, exportJsonBtn, exportCsvBtn } = els();
  splitLink.innerHTML = `<span style="display:flex;align-items:center;gap:10px;">${icon("users", { size: 20 })}<span>分帳總覽</span></span>${icon("chevronRight", { size: 18 })}`;
  addCategoryBtn.innerHTML = `${icon("plus", { size: 16 })}<span>新增分類</span>`;
  exportJsonBtn.innerHTML = `${icon("download", { size: 18 })}<span>匯出 JSON 備份</span>`;
  exportCsvBtn.innerHTML = `${icon("sheet", { size: 18 })}<span>匯出 CSV（試算表用）</span>`;
  const importLabel = document.querySelector('label[for="more-import-file"]');
  if (importLabel) importLabel.innerHTML = `${icon("upload", { size: 18 })}<span>匯入 JSON 備份還原</span>`;
}

async function refresh() {
  await renderCategoryList();
}

function wire() {
  if (wired) return;
  wired = true;
  const { addCategoryBtn, totalBudget, exportJsonBtn, exportCsvBtn, importFile } = els();
  renderStaticBits();
  wireSync();

  addCategoryBtn.addEventListener("click", () => openCategoryCreator(refresh));

  totalBudget.addEventListener("change", async () => {
    await setBudget(TOTAL_BUDGET_ID, totalBudget.value);
    showToast("已更新總預算");
  });

  exportJsonBtn.addEventListener("click", async () => {
    await exportJSON();
    showToast("已匯出 JSON 備份");
  });

  exportCsvBtn.addEventListener("click", async () => {
    await exportCSV();
    showToast("已匯出 CSV");
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    if (!file) return;
    /* 有共享方案時要多講一句：匯入是「用備份取代現在的資料」，
       備份裡沒有的那些會被當成刪掉，而刪掉會同步到其他成員的手機上。 */
    const shared = getShares().length;
    const warning = shared
      ? `匯入將會取代目前手機上所有的記帳資料。你有 ${shared} 個共享方案，備份檔裡沒有的東西會從其他成員的手機上一起消失。確定要繼續嗎？`
      : "匯入將會取代目前手機上所有的記帳資料，確定要繼續嗎？";
    if (!confirm(warning)) {
      importFile.value = "";
      return;
    }
    try {
      const result = await importJSON(file);
      showToast(`已匯入 ${result.expenses} 筆支出`);
      await refresh();
      const b = await getBudget(TOTAL_BUDGET_ID);
      totalBudget.value = b || "";
    } catch (err) {
      showToast(err.message);
    } finally {
      importFile.value = "";
    }
  });
}

/* 收據沒進備份，有存照片的人一定要知道這件事，不然還原完會以為照片被吃掉了。 */
async function renderReceiptNote() {
  const { receiptNote } = els();
  const n = await countReceipts();
  receiptNote.hidden = n === 0;
  if (n) {
    receiptNote.textContent = `注意：${n} 張收據照片不會進備份檔（照片太大，會讓備份從幾十 KB 變成幾十 MB）。換手機的話收據不會跟著過去。`;
  }
}

export async function onShow() {
  wire();
  const { totalBudget } = els();
  const b = await getBudget(TOTAL_BUDGET_ID);
  totalBudget.value = b || "";
  await refresh();
  await renderReceiptNote();
  await renderSyncReceiptNote();
  await sync.refreshPending();
}
