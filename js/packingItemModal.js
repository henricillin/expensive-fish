import { updateItem, deleteItem, UNASSIGNED } from "./packing.js";
import { tripMembers } from "./trips.js";
import { openTripEditor } from "./tripModal.js";
import { openModal, closeModal, showToast, escapeHtml } from "./ui.js";

let editingItem = null;
let currentTrip = null;
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    name: document.getElementById("packing-item-name"),
    person: document.getElementById("packing-item-person"),
    note: document.getElementById("packing-item-note"),
    addPerson: document.getElementById("packing-item-add-person"),
    save: document.getElementById("packing-item-save"),
    del: document.getElementById("packing-item-delete"),
    cancel: document.getElementById("packing-item-cancel"),
  };
}

async function renderPersonSelect(selectedId) {
  const { person } = els();
  const { options } = await tripMembers(currentTrip);
  person.innerHTML =
    `<option value="">${escapeHtml(UNASSIGNED.name)}</option>` +
    options.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  person.value = options.some((p) => p.id === selectedId) ? selectedId : "";
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel, addPerson } = els();

  save.addEventListener("click", async () => {
    const { name, person, note } = els();
    try {
      await updateItem(editingItem.id, {
        name: name.value,
        personId: person.value,
        note: note.value.trim(),
      });
      closeModal("packing-item-modal");
      showToast("已儲存");
      onDoneCallback && onDoneCallback();
    } catch (err) {
      showToast(err.message);
    }
  });

  /* 要指派給還沒在方案裡的人，就直接跳去編輯方案的成員。
     方案 modal 在 index.html 裡排在項目 modal 之後，會疊在上層（兩者 z-index 相同）。 */
  addPerson.addEventListener("click", () => {
    openTripEditor(currentTrip, async (updated) => {
      if (!updated) {
        closeModal("packing-item-modal");
        onDoneCallback && onDoneCallback();
        return;
      }
      currentTrip = updated;
      await renderPersonSelect(els().person.value);
    });
  });

  del.addEventListener("click", async () => {
    if (!confirm("確定刪除這個項目？")) return;
    await deleteItem(editingItem.id);
    closeModal("packing-item-modal");
    showToast("已刪除");
    onDoneCallback && onDoneCallback();
  });

  cancel.addEventListener("click", () => closeModal("packing-item-modal"));
}

export async function openPackingItemEditor(item, trip, onDone) {
  wire();
  editingItem = item;
  currentTrip = trip;
  onDoneCallback = onDone;
  const { name, note } = els();
  name.value = item.name;
  note.value = item.note || "";
  await renderPersonSelect(item.personId || "");
  openModal("packing-item-modal");
}
