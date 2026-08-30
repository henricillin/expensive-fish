import { listCategories } from "../categories.js";
import { getBudget, setBudget, TOTAL_BUDGET_ID } from "../budgets.js";
import { exportJSON, exportCSV, importJSON } from "../exportImport.js";
import { showToast, escapeHtml } from "../ui.js";
import { openCategoryCreator, openCategoryEditor } from "../categoryModal.js";

export const elementId = "view-more";

let wired = false;

function els() {
  return {
    addCategoryBtn: document.getElementById("more-add-category"),
    categoryList: document.getElementById("more-category-list"),
    totalBudget: document.getElementById("more-total-budget"),
    exportJsonBtn: document.getElementById("more-export-json"),
    exportCsvBtn: document.getElementById("more-export-csv"),
    importFile: document.getElementById("more-import-file"),
  };
}

async function renderCategoryList() {
  const { categoryList } = els();
  const cats = await listCategories();
  categoryList.innerHTML = cats
    .map(
      (c) => `<div class="list-item" data-id="${c.id}" style="cursor:pointer;">
        <span class="emoji">${c.icon}</span>
        <span class="name">${escapeHtml(c.name)}</span>
        <span class="icon-btn">›</span>
      </div>`
    )
    .join("");
  categoryList.querySelectorAll(".list-item").forEach((row) => {
    row.addEventListener("click", async () => {
      const cat = cats.find((c) => c.id === row.dataset.id);
      openCategoryEditor(cat, refresh);
    });
  });
}

async function refresh() {
  await renderCategoryList();
}

function wire() {
  if (wired) return;
  wired = true;
  const { addCategoryBtn, totalBudget, exportJsonBtn, exportCsvBtn, importFile } = els();

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
    if (!confirm("匯入將會取代目前手機上所有的記帳資料，確定要繼續嗎？")) {
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

export async function onShow() {
  wire();
  const { totalBudget } = els();
  const b = await getBudget(TOTAL_BUDGET_ID);
  totalBudget.value = b || "";
  await refresh();
}
