/* 收據照片。一筆支出最多一張，存在自己的 store 裡（key 就是 expenseId）。

   存進去之前一定會壓縮：手機直出的照片動輒 3～5MB，原樣塞進 IndexedDB
   幾十張就把配額吃光，而收據只要看得清楚字就夠了。 */
import { STORE_RECEIPTS, getById, put, remove, getAllKeys, countStore } from "./db.js";

const MAX_EDGE = 1400;
const QUALITY = 0.75;

/* 壓到長邊 MAX_EDGE 以內的 JPEG。原圖本來就夠小就不動它，
   免得把已經很小的圖再壓一次反而變糊。 */
export async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("只能選圖片檔");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 400 * 1024) {
    bitmap.close();
    return { blob: file, width: bitmap.width, height: bitmap.height };
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("圖片處理失敗，換一張試試");
  return { blob, width, height };
}

export async function putReceipt(expenseId, file) {
  return saveReceiptBlob(expenseId, await compressImage(file));
}

/* 已經壓過的圖走這條，不要再丟回 putReceipt——JPEG 壓第二次只會更糊。 */
export async function saveReceiptBlob(expenseId, { blob, width, height }) {
  const record = {
    expenseId,
    blob,
    type: blob.type,
    size: blob.size,
    width,
    height,
    createdAt: Date.now(),
  };
  await put(STORE_RECEIPTS, record);
  return record;
}

export async function getReceipt(expenseId) {
  return getById(STORE_RECEIPTS, expenseId);
}

export async function deleteReceipt(expenseId) {
  await remove(STORE_RECEIPTS, expenseId);
}

/* 列表要標「這筆有收據」時用。一次把 key 全撈出來，比一筆一筆問快得多，
   而且 key 很小（就是一串 id），不會把照片本身讀進來。 */
export async function receiptIdSet() {
  return new Set(await getAllKeys(STORE_RECEIPTS));
}

export async function countReceipts() {
  return countStore(STORE_RECEIPTS);
}

/* 呼叫端負責在用完後 revoke，不然這個 URL 會一直咬著整張圖不放。 */
export function receiptObjectURL(record) {
  return URL.createObjectURL(record.blob);
}
