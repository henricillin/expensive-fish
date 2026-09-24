/* 攜帶清單的分類下拉選單，快速新增那一列和項目編輯 modal 共用。
   選單最後一項是「＋ 新增分類…」，選到它就問名字，加完直接選起來。 */
import { listPackingCategories, rememberCategory, normalizeCategory, NO_CATEGORY } from "./packing.js";
import { escapeHtml } from "./ui.js";

const NEW_CATEGORY = "__new__";

export async function fillCategorySelect(select, selected) {
  const names = await listPackingCategories();
  const value = normalizeCategory(selected);
  select.innerHTML =
    `<option value="">${escapeHtml(NO_CATEGORY.name)}</option>` +
    names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("") +
    `<option value="${NEW_CATEGORY}">＋ 新增分類…</option>`;
  select.value = names.includes(value) ? value : "";
  /* 記在元素上，選了「＋ 新增分類…」又取消時才退得回來——
     每次重填選單都會蓋掉，wire 當下抓的那個值早就過期了。 */
  select.dataset.prev = select.value;
  return select.value;
}

/* 選到「＋ 新增分類…」時問名字。取消或留白就退回原本選的那個——
   不退回的話選單會停在那個假選項上，看起來像分類真的叫「＋ 新增分類…」。 */
export function wireCategorySelect(select, onChange) {
  select.addEventListener("change", async () => {
    if (select.value !== NEW_CATEGORY) {
      select.dataset.prev = select.value;
      onChange && onChange(select.value);
      return;
    }
    const name = rememberCategory(prompt("新分類的名字？", "") || "");
    if (!name) {
      select.value = select.dataset.prev || "";
      return;
    }
    await fillCategorySelect(select, name);
    onChange && onChange(select.value);
  });
}
