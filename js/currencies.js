/* 幣別只是花費上的一個標籤，不做匯率換算——金額欄位一律是使用者自己換算好的台幣，
   選了外幣只是提醒「這筆原本是付外幣」，月結算、預算、分帳都照 amount（台幣）算。 */
export const DEFAULT_CURRENCY = "TWD";

export const CURRENCIES = [
  { code: "TWD", label: "TWD 新台幣" },
  { code: "USD", label: "USD 美金" },
  { code: "JPY", label: "JPY 日圓" },
  { code: "GBP", label: "GBP 英鎊" },
  { code: "EUR", label: "EUR 歐元" },
  { code: "KRW", label: "KRW 韓元" },
  { code: "CNY", label: "CNY 人民幣" },
  { code: "HKD", label: "HKD 港幣" },
  { code: "THB", label: "THB 泰銖" },
  { code: "VND", label: "VND 越南盾" },
  { code: "SGD", label: "SGD 新加坡幣" },
  { code: "MYR", label: "MYR 馬來幣" },
  { code: "AUD", label: "AUD 澳幣" },
  { code: "CAD", label: "CAD 加拿大幣" },
];

export function currencyOptionsHtml(selected) {
  const value = selected || DEFAULT_CURRENCY;
  return CURRENCIES.map(
    (c) => `<option value="${c.code}"${c.code === value ? " selected" : ""}>${c.label}</option>`
  ).join("");
}

export function currencyTag(currency) {
  if (!currency || currency === DEFAULT_CURRENCY) return "";
  return `<span class="currency-tag">${currency}</span>`;
}
