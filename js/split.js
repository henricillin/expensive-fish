/* 分帳算錢的地方。splitModal（一般記帳的分帳）和 tripExpenseModal（方案裡的花費）
   都用這一份，以前兩支各自抄了一份 equalShares。 */

/* 按權重把 total 分給 ids。用最大餘額法：先每人取整數下限，剩下的餘額
   依小數部分由大到小補 1，相同時照 ids 原本的順序——所以權重全部一樣時，
   結果就是「前幾個人各多 1 元」，跟原本的平均分攤一字不差。 */
export function weightedShares(total, ids, weights) {
  if (!ids.length) return {};
  const w = ids.map((id) => Math.max(0, Number(weights?.[id]) || 0));
  const totalWeight = w.reduce((s, x) => s + x, 0);
  /* 全部 0 份會除以零，退回平均分 */
  if (totalWeight <= 0) return weightedShares(total, ids, Object.fromEntries(ids.map((id) => [id, 1])));

  const exact = ids.map((_, i) => (total * w[i]) / totalWeight);
  const shares = {};
  ids.forEach((id, i) => {
    shares[id] = Math.floor(exact[i]);
  });

  let remainder = Math.round(total - ids.reduce((s, id) => s + shares[id], 0));
  const order = ids
    .map((id, i) => ({ id, i, frac: exact[i] - Math.floor(exact[i]) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    shares[order[k].id] += 1;
  }
  return shares;
}

export function equalShares(total, ids) {
  return weightedShares(total, ids, Object.fromEntries(ids.map((id) => [id, 1])));
}

/* 三種分帳方式共用的入口。custom 是使用者自己打的金額，不做任何調整——
   加總對不對由呼叫端檢查後擋下來。 */
export function sharesFor({ method, total, ids, customAmounts, weights }) {
  if (method === "custom") {
    return Object.fromEntries(ids.map((id) => [id, Number(customAmounts?.[id]) || 0]));
  }
  /* 沒填過的人在 weights 裡是 undefined，一定要先過 weightOf 補成 1 份，
     不然 weightedShares 會把他們當 0 份，錢全灌到有填的那個人身上。 */
  if (method === "shares") {
    return weightedShares(total, ids, Object.fromEntries(ids.map((id) => [id, weightOf(weights, id)])));
  }
  return equalShares(total, ids);
}

export function sumShares(shares, ids) {
  return ids.reduce((s, id) => s + (shares[id] || 0), 0);
}

/* 沒填就當 1 份，這樣切到「份數」時每個人預設是平均分，不會全部變 0。 */
export function weightOf(weights, id) {
  const raw = weights?.[id];
  if (raw === undefined || raw === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}
