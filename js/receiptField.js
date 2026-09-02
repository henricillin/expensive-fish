/* 「收據」那一格：加照片、看照片、移除照片。

   新增支出時還沒有 id，所以這個元件不會自己寫資料庫——它先把壓好的照片
   收在手上，等呼叫端存完支出拿到 id，再 commit() 一次寫進去。 */
import { icon } from "./icons.js";
import { showToast } from "./ui.js";
import { compressImage, getReceipt, saveReceiptBlob, deleteReceipt } from "./receipts.js";
import { openReceiptViewer } from "./receiptViewer.js";

export function mountReceiptField(container) {
  container.innerHTML = `
    <div class="lb">收據</div>
    <div class="receipt-field">
      <button type="button" class="receipt-thumb" hidden aria-label="看大圖"></button>
      <label class="btn btn-ghost accent receipt-pick">
        ${icon("camera", { size: 18 })}<span class="receipt-pick-text">加一張收據</span>
        <input type="file" accept="image/*" hidden />
      </label>
      <button type="button" class="btn btn-ghost receipt-remove" hidden>移除</button>
    </div>`;

  const thumb = container.querySelector(".receipt-thumb");
  const pickText = container.querySelector(".receipt-pick-text");
  const input = container.querySelector('input[type="file"]');
  const removeBtn = container.querySelector(".receipt-remove");

  /* saved：資料庫裡已經有的那張。pending：這次選了還沒存的。
     removed：按過移除，commit 時要真的刪掉。 */
  let saved = null;
  let pending = null;
  let removed = false;
  let previewURL = null;

  function releasePreview() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  }

  function currentBlob() {
    if (pending) return pending.blob;
    if (saved && !removed) return saved.blob;
    return null;
  }

  function render() {
    releasePreview();
    const blob = currentBlob();
    pickText.textContent = blob ? "換一張" : "加一張收據";
    thumb.hidden = !blob;
    removeBtn.hidden = !blob;
    if (blob) {
      previewURL = URL.createObjectURL(blob);
      thumb.innerHTML = `<img src="${previewURL}" alt="收據縮圖" />`;
    } else {
      thumb.innerHTML = "";
    }
  }

  input.addEventListener("change", async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    /* 清掉 value，不然選同一個檔案第二次不會觸發 change */
    ev.target.value = "";
    if (!file) return;
    try {
      pending = await compressImage(file);
      removed = false;
      render();
    } catch (err) {
      showToast(err.message || "這張圖讀不進來");
    }
  });

  thumb.addEventListener("click", () => {
    const blob = currentBlob();
    if (blob) openReceiptViewer(blob);
  });

  removeBtn.addEventListener("click", () => {
    pending = null;
    removed = true;
    render();
  });

  return {
    async load(expenseId) {
      saved = expenseId ? (await getReceipt(expenseId)) || null : null;
      pending = null;
      removed = false;
      render();
    },

    /* 支出存好、拿到 id 之後呼叫。沒動過照片就什麼都不做。 */
    async commit(expenseId) {
      if (!expenseId) return;
      if (pending) {
        await saveReceiptBlob(expenseId, pending);
      } else if (removed && saved) {
        await deleteReceipt(expenseId);
      }
      pending = null;
      removed = false;
      releasePreview();
    },
  };
}
