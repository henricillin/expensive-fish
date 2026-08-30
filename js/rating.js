/* Shared star-rating widget for food & drink records. */
import { icon } from "./icons.js";

export const RATING_LABELS = {
  0: "尚未評分",
  1: "不會再買",
  2: "普通",
  3: "還不錯",
  4: "很喜歡",
  5: "回訪必點",
};

/* Read-only row of stars, used inside lists. */
export function starsStatic(value, { size = 15 } = {}) {
  const v = Number(value) || 0;
  if (!v) return "";
  let html = `<span class="stars stars-static">`;
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= v ? "on" : ""}">${icon("star", { size, filled: i <= v })}</span>`;
  }
  html += `</span>`;
  return html;
}

/* Tappable stars. Container gets data-value; call wireStars() to make it live. */
export function starsInput(value, { size = 28 } = {}) {
  const v = Number(value) || 0;
  let html = `<div class="stars stars-input" data-value="${v}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<button type="button" class="star ${i <= v ? "on" : ""}" data-star="${i}" aria-label="${i} 分">${icon("star", { size, filled: i <= v })}</button>`;
  }
  html += `<button type="button" class="star-clear" ${v ? "" : "hidden"}>清除</button></div>`;
  return html;
}

export function wireStars(container, onChange) {
  if (!container) return;
  const apply = (v) => {
    container.dataset.value = String(v);
    container.querySelectorAll(".star").forEach((btn) => {
      const i = Number(btn.dataset.star);
      btn.classList.toggle("on", i <= v);
      btn.innerHTML = icon("star", { size: 28, filled: i <= v });
    });
    const clear = container.querySelector(".star-clear");
    if (clear) clear.hidden = !v;
    onChange && onChange(v);
  };
  container.querySelectorAll(".star").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.star);
      apply(getStars(container) === i ? i - 1 : i);
    });
  });
  const clear = container.querySelector(".star-clear");
  if (clear) clear.addEventListener("click", () => apply(0));
}

export function getStars(container) {
  return Number(container?.dataset.value) || 0;
}
