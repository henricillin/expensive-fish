/* 分帳那一排人的畫面，splitModal 和 tripExpenseModal 共用。
   算錢的部分在 split.js，這支只管長相和存進 split 物件的欄位。 */
import { escapeHtml, formatMoney } from "./ui.js";
import { weightOf } from "./split.js";

/* 一個人一列：勾選框 + 名字，右邊看方式決定放什麼。
   份數模式同時給輸入框和換算出來的金額，才知道 2 份到底是多少錢。 */
export function participantRow(person, checked, method, shares, customAmounts, weights) {
  let right;
  if (method === "custom") {
    right = `<input type="number" inputmode="decimal" min="0" step="1" class="share-input"
      data-id="${person.id}" value="${customAmounts[person.id] ?? ""}" placeholder="0"
      ${checked ? "" : "disabled"} />`;
  } else if (method === "shares") {
    right = `<span class="share-weight-wrap">
      <input type="number" inputmode="numeric" min="0" step="1" class="share-weight"
        data-id="${person.id}" value="${weightOf(weights, person.id)}"
        aria-label="${escapeHtml(person.name)}的份數" ${checked ? "" : "disabled"} />
      <span class="share-weight-unit">份</span>
      <span class="share-amount" data-id="${person.id}">${checked ? formatMoney(shares[person.id] || 0) : ""}</span>
    </span>`;
  } else {
    right = `<span class="share-amount" data-id="${person.id}">${checked ? formatMoney(shares[person.id] || 0) : ""}</span>`;
  }

  return `<div class="share-row">
    <label class="share-person">
      <input type="checkbox" class="share-check" data-id="${person.id}" ${checked ? "checked" : ""} />
      <span>${escapeHtml(person.name)}</span>
    </label>
    ${right}
  </div>`;
}

/* 改份數只會動到金額，不用整排重畫——重畫會把使用者正在打字的輸入框換掉，
   而 <input type="number"> 連 setSelectionRange 都不支援，救不回游標。 */
export function updateShareAmounts(container, shares, selectedIds) {
  container.querySelectorAll(".share-amount").forEach((el) => {
    const id = el.dataset.id;
    el.textContent = selectedIds.has(id) ? formatMoney(shares[id] || 0) : "";
  });
}

/* 只有「份數」需要存下來——平均和自訂從 shares 的金額就還原得回來，
   但份數不行（1:2 和 100:200 存出來的金額一樣，份數卻是使用者的意圖）。 */
export function splitMethodFields(method, selectedIds, weights) {
  if (method !== "shares") return {};
  return {
    method: "shares",
    weights: Object.fromEntries([...selectedIds].map((id) => [id, weightOf(weights, id)])),
  };
}

/* 開既有的分帳時用。沒存份數的（舊資料、平均、自訂）一律回到自訂金額，
   跟以前的行為一樣——金額照原樣帶出來，不會被重算。 */
export function restoreSplitMethod(split) {
  if (split?.method === "shares" && split.weights) {
    return { method: "shares", weights: { ...split.weights } };
  }
  return { method: "custom", weights: {} };
}
