/* 新增／編輯方案：名稱、日期、同行成員。 */
import { createTrip, updateTrip, deleteTrip } from "./trips.js";
import { listPeople } from "./people.js";
import { openPersonCreator } from "./personModal.js";
import { openModal, closeModal, showToast, escapeHtml } from "./ui.js";

let mode = "create";
let editingId = null;
let selectedMembers = new Set();
let onDoneCallback = null;
let wired = false;

function els() {
  return {
    title: document.getElementById("trip-modal-title"),
    name: document.getElementById("trip-name"),
    start: document.getElementById("trip-start"),
    end: document.getElementById("trip-end"),
    members: document.getElementById("trip-members"),
    addPerson: document.getElementById("trip-add-person"),
    save: document.getElementById("trip-save"),
    del: document.getElementById("trip-delete"),
    cancel: document.getElementById("trip-cancel"),
  };
}

async function renderMembers() {
  const { members } = els();
  const people = await listPeople();
  if (!people.length) {
    members.innerHTML = `<div class="settings-desc" style="margin:0;">還沒有同伴，先新增一位再勾選。</div>`;
    return;
  }
  members.innerHTML = people
    .map(
      (p) => `<button type="button" class="chip-toggle${selectedMembers.has(p.id) ? " selected" : ""}" data-id="${p.id}">
        ${escapeHtml(p.name)}
      </button>`
    )
    .join("");
  members.querySelectorAll(".chip-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (selectedMembers.has(id)) selectedMembers.delete(id);
      else selectedMembers.add(id);
      btn.classList.toggle("selected", selectedMembers.has(id));
    });
  });
}

function wire() {
  if (wired) return;
  wired = true;
  const { save, del, cancel, name, addPerson } = els();

  save.addEventListener("click", async () => {
    const { name: nameEl, start, end } = els();
    const payload = {
      name: nameEl.value,
      startDate: start.value,
      endDate: end.value,
      memberIds: [...selectedMembers],
    };
    if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
      showToast("結束日期不能早於開始日期");
      return;
    }
    try {
      const trip =
        mode === "create" ? await createTrip(payload) : await updateTrip(editingId, payload);
      closeModal("trip-modal");
      showToast(mode === "create" ? "已新增方案" : "已儲存");
      onDoneCallback && onDoneCallback(trip);
    } catch (err) {
      showToast(err.message);
    }
  });

  name.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") save.click();
  });

  addPerson.addEventListener("click", () => {
    openPersonCreator(async (person) => {
      if (person) selectedMembers.add(person.id);
      await renderMembers();
    });
  });

  del.addEventListener("click", async () => {
    if (!confirm("刪除方案會連同攜帶清單和結清紀錄一起刪掉（花費會留在明細裡），確定刪除？")) return;
    await deleteTrip(editingId);
    closeModal("trip-modal");
    showToast("已刪除方案");
    onDoneCallback && onDoneCallback(null);
  });

  cancel.addEventListener("click", () => closeModal("trip-modal"));
}

export async function openTripCreator(onDone) {
  wire();
  mode = "create";
  editingId = null;
  onDoneCallback = onDone;
  selectedMembers = new Set();
  const { title, name, start, end, del } = els();
  title.textContent = "新增方案";
  name.value = "";
  start.value = "";
  end.value = "";
  del.hidden = true;
  await renderMembers();
  openModal("trip-modal");
  name.focus();
}

export async function openTripEditor(trip, onDone) {
  wire();
  mode = "edit";
  editingId = trip.id;
  onDoneCallback = onDone;
  selectedMembers = new Set(trip.memberIds || []);
  const { title, name, start, end, del } = els();
  title.textContent = "編輯方案";
  name.value = trip.name;
  start.value = trip.startDate || "";
  end.value = trip.endDate || "";
  del.hidden = false;
  await renderMembers();
  openModal("trip-modal");
}
