import { STORE_PEOPLE, getAll, getById, put, add, remove } from "./db.js";

export const ME = { id: "me", name: "我" };

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
