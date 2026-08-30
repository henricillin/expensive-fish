import { STORE_CATEGORIES, getAll, getById, put, add, remove, countStore } from "./db.js";

export const DEFAULT_CATEGORIES = [
  { id: "food", name: "食物", icon: "🍔", isDefault: true, order: 0 },
  { id: "drinks", name: "飲料", icon: "🥤", isDefault: true, order: 1 },
  { id: "daily", name: "生活用品", icon: "🧴", isDefault: true, order: 2 },
  { id: "transport", name: "交通", icon: "🚌", isDefault: true, order: 3 },
];

export async function seedDefaultCategoriesIfEmpty() {
  const count = await countStore(STORE_CATEGORIES);
  if (count > 0) return;
  for (const cat of DEFAULT_CATEGORIES) {
    await add(STORE_CATEGORIES, { ...cat, createdAt: Date.now() });
  }
}

export async function listCategories() {
  const all = await getAll(STORE_CATEGORIES);
  return all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getCategory(id) {
  return getById(STORE_CATEGORIES, id);
}

function slugify(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "cat") + "-" + Math.random().toString(36).slice(2, 7);
}

export async function createCategory({ name, icon }) {
  const all = await listCategories();
  const maxOrder = all.reduce((m, c) => Math.max(m, c.order ?? 0), -1);
  const category = {
    id: slugify(name),
    name: name.trim(),
    icon: icon || "🏷️",
    isDefault: false,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };
  await add(STORE_CATEGORIES, category);
  return category;
}

export async function updateCategory(id, changes) {
  const existing = await getCategory(id);
  if (!existing) throw new Error("Category not found");
  const updated = { ...existing, ...changes };
  await put(STORE_CATEGORIES, updated);
  return updated;
}

export async function deleteCategory(id) {
  const all = await listCategories();
  if (all.length <= 1) {
    throw new Error("至少要保留一個分類");
  }
  await remove(STORE_CATEGORIES, id);
}
