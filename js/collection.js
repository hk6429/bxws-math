import { store } from "./store.js";
import { addStardust } from "./daily.js";

// 咒卷集：前 8 件 id = 技能樹節點 id；tier 1 = 入庫、tier 2 = 導師蠟封
export const MANUSCRIPTS = [
  { id: "fraction-unlike-denom", sym: "½＋⅓", name: "通分之橋咒卷", hint: "完成「異分母分數」一輪作答即入庫", desc: "凡奇導師說：分母不同的兩座橋，得先架到同一個高度。" },
  { id: "fraction-mul", sym: "¾×⅔", name: "切割乾酪咒卷", hint: "完成「分數乘除」一輪作答即入庫", desc: "把一塊乾酪的四分之三再切三份——這就是分數相乘。" },
  { id: "decimal-mul", sym: "0.5", name: "小數點羅盤咒卷", hint: "完成「小數乘除」一輪作答即入庫", desc: "小數點是羅盤針，乘除時它往哪偏，全看位數。" },
  { id: "ratio-rate", sym: "a∶b", name: "黃金比例咒卷", hint: "完成「比與比值」一輪作答即入庫", desc: "凡奇導師畫人體前，先量比例——比是萬物的骨架。" },
  { id: "negative-number", sym: "−3", name: "零度以下咒卷", hint: "完成「負數」一輪作答即入庫", desc: "格思導師批註：數線往左走，世界並沒有結束。" },
  { id: "proportion-eq", sym: "a∶b＝c∶d", name: "等比天平咒卷", hint: "完成「比例式」一輪作答即入庫", desc: "內項相乘等於外項相乘——天平兩端就此平衡。" },
  { id: "algebra-symbol", sym: "𝑥", name: "未知數面具咒卷", hint: "完成「代數符號」一輪作答即入庫", desc: "格思導師說：給未知的東西戴上面具，它就聽你指揮。" },
  { id: "linear-eq-1var", sym: "𝑥＝?", name: "解方程金鑰咒卷", hint: "完成「一元一次方程式」一輪作答即入庫", desc: "移項是鑰匙轉動的聲音，等號兩邊同時開鎖。" },
  { id: "master-trial", sym: "∞", name: "雙導師聯名咒卷", hint: "賢者試煉正確率達九成，直接蠟封", desc: "凡奇執筆、格思驗算——星穹學院最珍貴的一卷。" },
];

// 導師徽記匣：奇遇魔法陣答對 5% 機率掉當前節點主題徽記（10 次未掉保底必掉）
export const RARE_STAMPS = [
  { id: "davinci-manuscript", sym: "🪶", name: "凡奇圖紋徽記", hint: "秘數塔的奇遇魔法陣裡等你" },
  { id: "gauss-signature", sym: "Σ", name: "格思雷紋徽記", hint: "符文塔的奇遇魔法陣裡等你" },
  { id: "stamp-fraction-unlike-denom", sym: "½", name: "通分之橋徽記", hint: "「異分母分數」的奇遇魔法陣裡等你" },
  { id: "stamp-fraction-mul", sym: "¾", name: "切割乾酪徽記", hint: "「分數乘除」的奇遇魔法陣裡等你" },
  { id: "stamp-decimal-mul", sym: "•", name: "小數羅盤徽記", hint: "「小數乘除」的奇遇魔法陣裡等你" },
  { id: "stamp-ratio-rate", sym: "∶", name: "黃金比例徽記", hint: "「比與比值」的奇遇魔法陣裡等你" },
  { id: "stamp-negative-number", sym: "−", name: "零下寒冰徽記", hint: "「負數」的奇遇魔法陣裡等你" },
  { id: "stamp-proportion-eq", sym: "⚖", name: "等比天平徽記", hint: "「比例式」的奇遇魔法陣裡等你" },
  { id: "stamp-algebra-symbol", sym: "𝑥", name: "未知數面具徽記", hint: "「代數符號」的奇遇魔法陣裡等你" },
  { id: "stamp-linear-eq-1var", sym: "🗝", name: "解方程金鑰徽記", hint: "「一元一次方程式」的奇遇魔法陣裡等你" },
];

// 該節點對應的節點徽記；賢者試煉／每週學院盃掉導師徽記
export function stampForNode(nodeId, mascot) {
  const nodeStamp = RARE_STAMPS.find((s) => s.id === `stamp-${nodeId}`);
  if (nodeStamp) return nodeStamp;
  return RARE_STAMPS.find((s) => s.id === (mascot === "gauss" ? "gauss-signature" : "davinci-manuscript"));
}

export function getRareStamps() {
  return store.read("rareStampBook", {});
}

export function ownRareStamp(stampId) {
  const book = getRareStamps();
  if (!book[stampId]) {
    book[stampId] = { at: Date.now() };
    store.write("rareStampBook", book);
  }
}

export function resolveEncounterReward(nodeId, mascot, random = Math.random) {
  store.write("encounterWins", store.read("encounterWins", 0) + 1);
  const owned = getRareStamps();
  if (RARE_STAMPS.every((stamp) => owned[stamp.id])) {
    addStardust(3);
    store.write("encounterPity", 0);
    return {
      type: "stardust",
      amount: 3,
      message: "徽記已全數集齊，這次的魔力化為 3 粒星屑注入你的瓶中",
    };
  }

  let pity = store.read("encounterPity", 0) + 1;
  const shouldDrop = random() < 0.05 || pity >= 10;
  if (!shouldDrop) {
    store.write("encounterPity", pity);
    return null;
  }

  let stamp = stampForNode(nodeId, mascot);
  if (owned[stamp.id]) stamp = RARE_STAMPS.find((item) => !owned[item.id]) ?? null;
  if (!stamp) {
    store.write("encounterPity", pity);
    return null;
  }
  pity = 0;
  ownRareStamp(stamp.id);
  store.write("encounterPity", pity);
  return { type: "stamp", stamp };
}

export function getCollection() {
  return store.read("collection", {});
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];

// 守護型 CD8：只改變顯示，不更動咒卷 tier 或 Leitner 資料。
export function manuscriptDustStatus(nodeId, collection, leitner, questionIds, careRecord, now = Date.now()) {
  if ((collection[nodeId]?.tier ?? 0) < 2) return { dusty: false, careCount: 0, dustSince: null };
  const dustThresholds = questionIds
    .map((id) => leitner[id])
    .filter(Boolean)
    .map((record) => record.lastSeen + (BOX_INTERVAL_DAYS[record.box - 1] ?? 0) * DAY_MS + 3 * DAY_MS)
    .filter((dustAt) => now >= dustAt);
  if (dustThresholds.length === 0) return { dusty: false, careCount: 0, dustSince: null };
  const dustSince = Math.max(...dustThresholds);
  const careEvents = (careRecord?.events ?? []).filter((at) => at >= dustSince && at <= now);
  const careCount = careEvents.length > 0
    ? Math.min(3, careEvents.length)
    : careRecord?.at >= dustSince ? Math.min(3, careRecord.count ?? 0) : 0;
  return { dusty: careCount < 3, careCount, dustSince };
}

export function addManuscriptCare(nodeId) {
  const all = store.read("manuscriptCare", {});
  const events = [...(all[nodeId]?.events ?? []), Date.now()].slice(-20);
  all[nodeId] = { events };
  store.write("manuscriptCare", all);
  return all[nodeId];
}

// 只升不降、冪等；同輪連跳兩階只回報最高階
export function evaluateCollection(nodeId, stats, ctx) {
  const col = getCollection();
  const drops = [];
  const upgrade = (id, tier) => {
    const current = col[id]?.tier ?? 0;
    if (tier > current) {
      col[id] = { tier, at: Date.now() };
      drops.push({ item: MANUSCRIPTS.find((m) => m.id === id), tier });
    }
  };

  if (ctx.masterTrialPassed) upgrade("master-trial", 2);
  const manuscript = MANUSCRIPTS.find((m) => m.id === nodeId);
  if (manuscript && nodeId !== "master-trial") {
    if (stats.totalAttempts > 0) upgrade(nodeId, 1);
    if (stats.masteryPct >= 0.8) upgrade(nodeId, 2);
  }

  if (drops.length > 0) store.write("collection", col);
  const highestById = {};
  drops.forEach((d) => { highestById[d.item.id] = d; });
  return Object.values(highestById);
}
