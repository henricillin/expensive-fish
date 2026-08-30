import { createPerson, updatePerson, deletePerson } from "./people.js";
import { openModal, closeModal, showToast } from "./ui.js";

let mode = "create";
let editingId = null;
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    title: document.getElementById("person-modal-title"),
    name: document.getElementById("person-name"),
    save: document.getElementById("person-save"),
    del: document.getElementById("person-delete"),
    cancel: document.getElementById("person-cancel"),
  };
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel } = els();

  save.addEventListener("click", async () => {
    const { name } = els();
    try {
      if (mode === "create") {
        const person = await createPerson(name.value);
        closeModal("person-modal");
        showToast("已新增");
        onDoneCallback && onDoneCallback(person);
      } else {
        await updatePerson(editingId, name.value);
        closeModal("person-modal");
        showToast("已儲存");
        onDoneCallback && onDoneCallback();
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  del.addEventListener("click", async () => {
    if (!confirm("刪除同伴不會刪除已記錄的分帳記錄，確定刪除？")) return;
    await deletePerson(editingId);
    closeModal("person-modal");
    showToast("已刪除");
    onDoneCallback && onDoneCallback();
  });

  cancel.addEventListener("click", () => closeModal("person-modal"));
}

export function openPersonCreator(onDone) {
  wire();
  mode = "create";
  editingId = null;
  onDoneCallback = onDone;
  const { title, name, del } = els();
  title.textContent = "新增同伴";
  name.value = "";
  del.hidden = true;
  openModal("person-modal");
}

export function openPersonEditor(person, onDone) {
  wire();
  mode = "edit";
  editingId = person.id;
  onDoneCallback = onDone;
  const { title, name, del } = els();
  title.textContent = "編輯同伴";
  name.value = person.name;
  del.hidden = false;
  openModal("person-modal");
}
