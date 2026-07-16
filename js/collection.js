import { store } from "./store.js";

// 大師手稿收藏冊：前 8 件 id = 技能樹節點 id；tier 1 = 入冊、tier 2 = 大師落款
export const MANUSCRIPTS = [
  { id: "fraction-unlike-denom", sym: "½＋⅓", name: "通分之橋手稿", hint: "完成「異分母分數」一輪作答即入冊", desc: "達文西說：分母不同的兩座橋，得先架到同一個高度。" },
  { id: "fraction-mul", sym: "¾×⅔", name: "切割乾酪手稿", hint: "完成「分數乘除」一輪作答即入冊", desc: "把一塊乾酪的四分之三再切三份——這就是分數相乘。" },
  { id: "decimal-mul", sym: "0.5", name: "小數點羅盤手稿", hint: "完成「小數乘除」一輪作答即入冊", desc: "小數點是羅盤針，乘除時它往哪偏，全看位數。" },
  { id: "ratio-rate", sym: "a∶b", name: "黃金比例手稿", hint: "完成「比與比值」一輪作答即入冊", desc: "達文西畫人體前，先量比例——比是萬物的骨架。" },
  { id: "negative-number", sym: "−3", name: "零度以下手稿", hint: "完成「負數」一輪作答即入冊", desc: "高斯批註：數線往左走，世界並沒有結束。" },
  { id: "proportion-eq", sym: "a∶b＝c∶d", name: "等比天平手稿", hint: "完成「比例式」一輪作答即入冊", desc: "內項相乘等於外項相乘——天平兩端就此平衡。" },
  { id: "algebra-symbol", sym: "𝑥", name: "未知數面具手稿", hint: "完成「代數符號」一輪作答即入冊", desc: "高斯說：給未知的東西戴上面具，它就聽你指揮。" },
  { id: "linear-eq-1var", sym: "𝑥＝?", name: "解方程金鑰手稿", hint: "完成「一元一次方程式」一輪作答即入冊", desc: "移項是鑰匙轉動的聲音，等號兩邊同時開鎖。" },
  { id: "master-trial", sym: "∞", name: "雙大師聯名合稿", hint: "大師試煉正確率達九成，直接落款", desc: "達文西執筆、高斯驗算——工作室最珍貴的一頁。" },
];

export function getCollection() {
  return store.read("collection", {});
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
