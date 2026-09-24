import { STORE_PEOPLE, getAll, getById, put, add, remove } from "./db.js";

export const ME = { id: "me", name: "我" };

export const PERSON_COLORS = [
  "#3a86ff", "#ff6b35", "#2ec4b6", "#f5a524",
  "#8338ec", "#e63946", "#06d6a0", "#118ab2",
  "#fb8500", "#f15bb5", "#7f8c5c", "#9c6644",
];

/* 給一份人員 id 名單，照順序配色——同一個方案裡的人一定拿到不同顏色。
   用 id 算雜湊來配色的話，人一多就很容易撞色，反而更難分辨。 */
export function assignPersonColors(ids) {
  const map = new Map();
  let i = 0;
  for (const id of ids) {
    if (map.has(id)) continue;
    map.set(id, PERSON_COLORS[i % PERSON_COLORS.length]);
    i++;
  }
  return map;
}

function slugify(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "p") + "-" + Math.random().toString(36).slice(2, 7);
}

export async function listPeople() {
  const all = await getAll(STORE_PEOPLE);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getPerson(id) {
  if (id === ME.id) return ME;
  return getById(STORE_PEOPLE, id);
}

export async function createPerson(name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("請輸入名字");
  const person = { id: slugify(trimmed), name: trimmed, createdAt: Date.now() };
  await add(STORE_PEOPLE, person);
  return person;
}

export async function updatePerson(id, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("請輸入名字");
  const existing = await getPerson(id);
  const updated = { ...existing, name: trimmed };
  await put(STORE_PEOPLE, updated);
  return updated;
}

export async function deletePerson(id) {
  await remove(STORE_PEOPLE, id);
}
