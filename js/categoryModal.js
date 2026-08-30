import { createCategory, updateCategory, deleteCategory } from "./categories.js";
import { openModal, closeModal, showToast } from "./ui.js";

const EMOJI_CHOICES = [
  "🍔", "🥤", "🧴", "🚌", "🍜", "☕", "🛒", "🏠",
  "💊", "🎮", "📚", "🎬", "✈️", "🐾", "🎁", "👕",
  "💇", "📱", "🏋️", "🚗", "🧾", "🍎", "🍺", "💰",
  "🎓", "🧻", "🛠️", "🌿",
];

let mode = "create";
let editingId = null;
let selectedEmoji = EMOJI_CHOICES[0];
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    title: document.getElementById("category-modal-title"),
    name: document.getElementById("cat-name"),
    picker: document.getElementById("cat-emoji-picker"),
    save: document.getElementById("cat-save"),
    del: document.getElementById("cat-delete"),
    cancel: document.getElementById("cat-cancel"),
  };
}

function renderPicker() {
  const { picker } = els();
  picker.innerHTML = EMOJI_CHOICES.map(
    (e) => `<button type="button" data-emoji="${e}" class="${e === selectedEmoji ? "selected" : ""}">${e}</button>`
  ).join("");
  picker.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEmoji = btn.dataset.emoji;
      renderPicker();
    });
  });
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel } = els();

  save.addEventListener("click", async () => {
    const { name } = els();
    const trimmed = name.value.trim();
    if (!trimmed) {
      showToast("請輸入分類名稱");
      return;
    }
    try {
      if (mode === "create") {
        await createCategory({ name: trimmed, icon: selectedEmoji });
      } else {
        await updateCategory(editingId, { name: trimmed, icon: selectedEmoji });
      }
      closeModal("category-modal");
      showToast("已儲存");
      onDoneCallback && onDoneCallback();
    } catch (err) {
      showToast(err.message);
    }
  });

  del.addEventListener("click", async () => {
    if (!confirm("刪除分類不會刪除已記錄的支出，但那些支出會保留原分類名稱顯示。確定刪除？")) return;
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
  const { title, name, del } = els();
  title.textContent = "新增分類";
  name.value = "";
  selectedEmoji = EMOJI_CHOICES[0];
  del.hidden = true;
  renderPicker();
  openModal("category-modal");
}

export function openCategoryEditor(category, onDone) {
  wire();
  mode = "edit";
  editingId = category.id;
  onDoneCallback = onDone;
  const { title, name, del } = els();
  title.textContent = "編輯分類";
  name.value = category.name;
  selectedEmoji = category.icon;
  del.hidden = false;
  renderPicker();
  openModal("category-modal");
}
