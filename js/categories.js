import { STORE_CATEGORIES, getAll, getById, put, add, remove, countStore } from "./db.js";
import { normalizeIconName, FOOD_DRINK_ICONS } from "./icons.js";

export const CATEGORY_COLORS = [
  "#ff6b35", "#f5a524", "#2ec4b6", "#3a86ff",
  "#8338ec", "#e63946", "#06d6a0", "#118ab2",
  "#fb8500", "#f15bb5", "#7f8c5c", "#9c6644",
];

export const DEFAULT_CATEGORIES = [
  { id: "food", name: "食物", icon: "utensils", color: "#ff6b35", ratable: true, isDefault: true, order: 0 },
  { id: "drinks", name: "飲料", icon: "cup", color: "#f5a524", ratable: true, isDefault: true, order: 1 },
  { id: "daily", name: "生活用品", icon: "bottle", color: "#2ec4b6", ratable: false, isDefault: true, order: 2 },
  { id: "transport", name: "交通", icon: "bus", color: "#3a86ff", ratable: false, isDefault: true, order: 3 },
];

export const FALLBACK_CATEGORY = { name: "未分類", icon: "tag", color: "#9a9086", ratable: false };

export async function seedDefaultCategoriesIfEmpty() {
  const count = await countStore(STORE_CATEGORIES);
  if (count > 0) return;
  for (const cat of DEFAULT_CATEGORIES) {
    await add(STORE_CATEGORIES, { ...cat, createdAt: Date.now() });
  }
}

/* Older data stored emoji icons and had no colour / rating flag — fill those in once. */
export async function migrateCategories() {
  const all = await getAll(STORE_CATEGORIES);
  const sorted = all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (let i = 0; i < sorted.length; i++) {
    const cat = sorted[i];
    const iconName = normalizeIconName(cat.icon);
    const needsIcon = cat.icon !== iconName;
    const needsColor = !cat.color;
    const needsRatable = typeof cat.ratable !== "boolean";
    if (!needsIcon && !needsColor && !needsRatable) continue;
    await put(STORE_CATEGORIES, {
      ...cat,
      icon: iconName,
      color: cat.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      ratable: typeof cat.ratable === "boolean" ? cat.ratable : FOOD_DRINK_ICONS.has(iconName),
    });
  }
}

export async function listCategories() {
  const all = await getAll(STORE_CATEGORIES);
  return all
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c, i) => ({
      ...c,
      icon: normalizeIconName(c.icon),
      color: c.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      ratable: Boolean(c.ratable),
    }));
}

/* id -> category, with a safe fallback for expenses whose category was deleted. */
export async function categoryMap() {
  const cats = await listCategories();
  const map = Object.fromEntries(cats.map((c) => [c.id, c]));
  return { cats, map, get: (id) => map[id] || { id, ...FALLBACK_CATEGORY } };
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

export async function createCategory({ name, icon, color, ratable }) {
  const all = await listCategories();
  const maxOrder = all.reduce((m, c) => Math.max(m, c.order ?? 0), -1);
  const category = {
    id: slugify(name),
    name: name.trim(),
    icon: normalizeIconName(icon),
    color: color || CATEGORY_COLORS[all.length % CATEGORY_COLORS.length],
    ratable: Boolean(ratable),
    isDefault: false,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };
  await add(STORE_CATEGORIES, category);
  return category;
}

/* 共享方案裡別人用的分類，本機沒有就照著補一份（id 沿用對方的）。
   不補的話那些花費在這裡全都會變成「未分類」，月結算也歸不了類。
   已經有同一個 id 就不動——本機自己改過的名字和顏色比較重要。 */
export async function createCategoryFrom(id, meta) {
  if (!id || (await getCategory(id))) return null;
  const all = await listCategories();
  const maxOrder = all.reduce((m, c) => Math.max(m, c.order ?? 0), -1);
  const category = {
    id,
    name: (meta?.name || "共享分類").slice(0, 20),
    icon: normalizeIconName(meta?.icon),
    color: meta?.color || CATEGORY_COLORS[all.length % CATEGORY_COLORS.length],
    ratable: Boolean(meta?.ratable),
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
  if (changes.icon) updated.icon = normalizeIconName(changes.icon);
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
