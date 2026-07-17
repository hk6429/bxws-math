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

export const STAMP_RARITIES = {
  "普通": { dropRate: 0.12, pity: 5 },
  "稀有": { dropRate: 0.05, pity: 15 },
  "傳說": { dropRate: 0.02, pity: 30 },
};

// 五塔各 6 枚：3 普通、2 稀有、1 傳說。所有主題都來自現有節點與五導師世界觀。
export const RARE_STAMPS = [
  { id: "stamp-fraction-unlike-denom", sym: "½", name: "通分之橋徽記", hint: "異分母分數奇遇", rarity: "普通", mentor: "凡奇", workshop: true },
  { id: "stamp-fraction-mul", sym: "¾", name: "切割乾酪徽記", hint: "分數乘除奇遇", rarity: "普通", mentor: "凡奇", workshop: true },
  { id: "stamp-decimal-mul", sym: "•", name: "小數羅盤徽記", hint: "小數乘除奇遇", rarity: "普通", mentor: "凡奇", workshop: true },
  { id: "stamp-ratio-rate", sym: "∶", name: "黃金比例徽記", hint: "比與比值奇遇", rarity: "稀有", mentor: "凡奇", workshop: true },
  { id: "davinci-manuscript", sym: "🪶", name: "凡奇圖紋徽記", hint: "秘數塔奇遇", rarity: "稀有", mentor: "凡奇" },
  { id: "num-tower-legend", sym: "⚖", name: "秘數塔心衡徽記", hint: "秘數塔傳說奇遇", rarity: "傳說", mentor: "凡奇" },
  { id: "stamp-negative-number", sym: "−", name: "零下寒冰徽記", hint: "負數奇遇", rarity: "普通", mentor: "格思", workshop: true },
  { id: "stamp-algebra-symbol", sym: "𝑥", name: "未知數面具徽記", hint: "代數符號奇遇", rarity: "普通", mentor: "格思", workshop: true },
  { id: "stamp-linear-eq-1var", sym: "🗝", name: "解方程金鑰徽記", hint: "一元一次方程式奇遇", rarity: "普通", mentor: "格思", workshop: true },
  { id: "stamp-proportion-eq", sym: "⚖", name: "等比天平徽記", hint: "比例式奇遇", rarity: "稀有", mentor: "格思", workshop: true },
  { id: "gauss-signature", sym: "Σ", name: "格思雷紋徽記", hint: "符文塔奇遇", rarity: "稀有", mentor: "格思" },
  { id: "algebra-tower-legend", sym: "✦", name: "符文塔真名徽記", hint: "符文塔傳說奇遇", rarity: "傳說", mentor: "格思" },
  { id: "stamp-angle-degree", sym: "∠", name: "量角星光徽記", hint: "量角器與度奇遇", rarity: "普通", mentor: "幾德" },
  { id: "stamp-circle-parts", sym: "◉", name: "圓心光輪徽記", hint: "圓的認識奇遇", rarity: "普通", mentor: "幾德" },
  { id: "stamp-plane-area-formula", sym: "▱", name: "面積拼圖徽記", hint: "平面面積公式奇遇", rarity: "普通", mentor: "幾德" },
  { id: "stamp-perp-parallel", sym: "⊥", name: "垂平雙光徽記", hint: "垂直與平行奇遇", rarity: "稀有", mentor: "幾德" },
  { id: "stamp-solids-nets", sym: "⬡", name: "展開圖水晶徽記", hint: "立體展開圖奇遇", rarity: "稀有", mentor: "幾德" },
  { id: "space-tower-legend", sym: "◇", name: "稜光塔公理徽記", hint: "稜光塔傳說奇遇", rarity: "傳說", mentor: "幾德" },
  { id: "stamp-repeat-pattern", sym: "↻", name: "重複藤節徽記", hint: "重複規律奇遇", rarity: "普通", mentor: "斐蘿" },
  { id: "stamp-growing-pattern", sym: "↗", name: "遞增星藤徽記", hint: "遞增規律奇遇", rarity: "普通", mentor: "斐蘿" },
  { id: "stamp-input-output-table", sym: "↦", name: "輸入輸出葉徽記", hint: "輸入輸出表奇遇", rarity: "普通", mentor: "斐蘿" },
  { id: "stamp-pattern-rule", sym: "n", name: "第 n 項藤紋徽記", hint: "規律通則奇遇", rarity: "稀有", mentor: "斐蘿" },
  { id: "stamp-function-relation", sym: "f", name: "函數藤心徽記", hint: "函數關係奇遇", rarity: "稀有", mentor: "斐蘿" },
  { id: "relation-tower-legend", sym: "🌿", name: "藤紋塔生長徽記", hint: "藤紋塔傳說奇遇", rarity: "傳說", mentor: "斐蘿" },
  { id: "stamp-bar-chart-reading", sym: "▆", name: "長條星象徽記", hint: "長條圖奇遇", rarity: "普通", mentor: "帕嵐" },
  { id: "stamp-line-chart-reading", sym: "⌁", name: "折線星跡徽記", hint: "折線圖奇遇", rarity: "普通", mentor: "帕嵐" },
  { id: "stamp-mean-basic", sym: "x̄", name: "平均星秤徽記", hint: "平均數奇遇", rarity: "普通", mentor: "帕嵐" },
  { id: "stamp-probability-basic", sym: "P", name: "機率星骰徽記", hint: "基礎機率奇遇", rarity: "稀有", mentor: "帕嵐" },
  { id: "stamp-chance-sample-space", sym: "Ω", name: "樣本空間徽記", hint: "樣本空間奇遇", rarity: "稀有", mentor: "帕嵐" },
  { id: "data-tower-legend", sym: "✧", name: "星卜塔全覽徽記", hint: "星卜塔傳說奇遇", rarity: "傳說", mentor: "帕嵐" },
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
    store.write("encounterPityByRarity", { "普通": 0, "稀有": 0, "傳說": 0 });
    return {
      type: "stardust",
      amount: 3,
      message: "徽記已全數集齊，這次的魔力化為 3 粒星屑注入你的瓶中",
    };
  }

  const savedPity = store.read("encounterPityByRarity", {});
  const pity = Object.fromEntries(Object.keys(STAMP_RARITIES).map((rarity) => [rarity, (savedPity[rarity] ?? 0) + 1]));
  const roll = random();
  const rarity = ["傳說", "稀有", "普通"].find((candidate) => {
    const config = STAMP_RARITIES[candidate];
    return RARE_STAMPS.some((stamp) => stamp.rarity === candidate && !owned[stamp.id])
      && (pity[candidate] >= config.pity || roll < config.dropRate);
  });
  if (!rarity) {
    store.write("encounterPityByRarity", pity);
    return null;
  }

  const preferred = stampForNode(nodeId, mascot);
  const stamp = preferred?.rarity === rarity && !owned[preferred.id]
    ? preferred
    : RARE_STAMPS.find((item) => item.rarity === rarity && !owned[item.id]) ?? null;
  if (!stamp) return null;
  pity[rarity] = 0;
  ownRareStamp(stamp.id);
  store.write("encounterPityByRarity", pity);
  store.write("encounterPity", 0);
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
