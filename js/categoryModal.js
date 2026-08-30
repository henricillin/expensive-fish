import { createCategory, updateCategory, deleteCategory, CATEGORY_COLORS } from "./categories.js";
import { openModal, closeModal, showToast } from "./ui.js";
import { icon, CATEGORY_ICON_CHOICES, FOOD_DRINK_ICONS } from "./icons.js";

let mode = "create";
let editingId = null;
let selectedIcon = CATEGORY_ICON_CHOICES[0];
let selectedColor = CATEGORY_COLORS[0];
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    title: document.getElementById("category-modal-title"),
    name: document.getElementById("cat-name"),
    iconPicker: document.getElementById("cat-icon-picker"),
    colorPicker: document.getElementById("cat-color-picker"),
    ratable: document.getElementById("cat-ratable"),
    save: document.getElementById("cat-save"),
    del: document.getElementById("cat-delete"),
    cancel: document.getElementById("cat-cancel"),
  };
}

function renderPickers() {
  const { iconPicker, colorPicker } = els();

  iconPicker.innerHTML = CATEGORY_ICON_CHOICES.map(
    (name) =>
      `<button type="button" data-icon="${name}" class="${name === selectedIcon ? "selected" : ""}" ${name === selectedIcon ? `style="color:${selectedColor};border-color:${selectedColor}"` : ""}>${icon(name, { size: 22 })}</button>`
  ).join("");
  iconPicker.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const previous = selectedIcon;
      selectedIcon = btn.dataset.icon;
      // Switching to a food/drink icon suggests turning rating on, but never forces it off.
      if (FOOD_DRINK_ICONS.has(selectedIcon) && !FOOD_DRINK_ICONS.has(previous) && mode === "create") {
        els().ratable.checked = true;
      }
      renderPickers();
    });
  });

  colorPicker.innerHTML = CATEGORY_COLORS.map(
    (c) => `<button type="button" data-color="${c}" class="${c === selectedColor ? "selected" : ""}" style="background:${c}" aria-label="${c}"></button>`
  ).join("");
  colorPicker.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColor = btn.dataset.color;
      renderPickers();
    });
  });
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel } = els();

  save.addEventListener("click", async () => {
    const { name, ratable } = els();
    const trimmed = name.value.trim();
    if (!trimmed) {
      showToast("請輸入分類名稱");
      return;
    }
    const payload = { name: trimmed, icon: selectedIcon, color: selectedColor, ratable: ratable.checked };
    try {
      if (mode === "create") {
        await createCategory(payload);
      } else {
        await updateCategory(editingId, payload);
      }
      closeModal("category-modal");
      showToast("已儲存");
      onDoneCallback && onDoneCallback();
    } catch (err) {
      showToast(err.message);
    }
  });

  del.addEventListener("click", async () => {
    if (!confirm("刪除分類不會刪除已記錄的支出，但那些支出會顯示為未分類。確定刪除？")) return;
    try {
      await deleteCategory(editingId);
      closeModal("category-modal");
      showToast("已刪除");
      onDoneCallback && onDoneCallback();
    } catch (err) {
      showToast(err.message);
    }
  });

  cancel.addEventListener("click", () => closeModal("category-modal"));
}

export function openCategoryCreator(onDone) {
  wire();
  mode = "create";
  editingId = null;
  onDoneCallback = onDone;
  const { title, name, del, ratable } = els();
  title.textContent = "新增分類";
  name.value = "";
  selectedIcon = CATEGORY_ICON_CHOICES[0];
  selectedColor = CATEGORY_COLORS[0];
  ratable.checked = FOOD_DRINK_ICONS.has(selectedIcon);
  del.hidden = true;
  renderPickers();
  openModal("category-modal");
}

export function openCategoryEditor(category, onDone) {
  wire();
  mode = "edit";
  editingId = category.id;
  onDoneCallback = onDone;
  const { title, name, del, ratable } = els();
  title.textContent = "編輯分類";
  name.value = category.name;
  selectedIcon = category.icon;
  selectedColor = category.color || CATEGORY_COLORS[0];
  ratable.checked = Boolean(category.ratable);
  del.hidden = false;
  renderPickers();
  openModal("category-modal");
}
