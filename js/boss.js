import { store } from "./store.js";

// 神殿試煉：把「答對/答錯」包裝成對 boss 的傷害。不重造出題邏輯——
// 出題仍走 quiz-loader.js 既有的 buildMasterSession；這裡只算傷害與勝負。
export const BOSS_MAX_HP = 100;
export const PLAYER_MAX_HP = 100;
const WRONG_HIT_DMG = 10;

export const BOSSES = {
  "num-quantity": { icon: "⚖", name: "米諾陶洛斯" },
  algebra: { icon: "✦", name: "斯芬克斯" },
  "space-shape": { icon: "🔨", name: "獨眼巨人" },
  "relation-pattern": { icon: "🧵", name: "命運三女神" },
  "data-uncertainty": { icon: "🏺", name: "皮媞亞" },
};

export function bossFor(strandId) {
  return BOSSES[strandId] ?? null;
}

export function newBossState(strandId) {
  if (!bossFor(strandId)) return null;
  return { strandId, hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP, playerHp: PLAYER_MAX_HP, playerMaxHp: PLAYER_MAX_HP };
}

// 精熟度是否達到門檻，決定能否挑戰該神殿 boss——數值掛鉤真實學習，不是操作次數。
export function bossGate(strand, progress = {}, masteryThreshold = 0.8) {
  const nodeIds = (strand?.nodes ?? []).map((n) => n.id);
  if (nodeIds.length === 0) return { eligible: false, masteryPct: 0 };
  const masteryPct = nodeIds.reduce(
    (sum, id) => sum + Math.max(0, Math.min(1, Number(progress[id]?.masteryPct) || 0)),
    0
  ) / nodeIds.length;
  return { eligible: masteryPct >= masteryThreshold, masteryPct };
}

// 答對造成的傷害：base + combo 加成，己方血量低於 30% 時背水一戰 ×1.5。
// collectionBonus 是 0~0.15 的加成係數，來自 collection.js 的 collectionBonusFor()。
export function playerDamage(combo, playerHp, playerMaxHp, collectionBonus = 0) {
  const base = 12 + combo * 3;
  const desperate = playerMaxHp > 0 && playerHp / playerMaxHp < 0.3 ? base * 1.5 : base;
  return Math.round(desperate * (1 + collectionBonus));
}

export function applyAnswer(bossState, isCorrect, combo, collectionBonus = 0) {
  if (!bossState) return bossState;
  const next = { ...bossState };
  if (isCorrect) {
    const dmg = playerDamage(combo, next.playerHp, next.playerMaxHp, collectionBonus);
    next.hp = Math.max(0, next.hp - dmg);
    next.lastEvent = { type: "hit", dmg };
  } else {
    next.playerHp = Math.max(0, next.playerHp - WRONG_HIT_DMG);
    next.lastEvent = { type: "miss", dmg: WRONG_HIT_DMG };
  }
  return next;
}

// 神諭卷軸蠟封（tier2）給的祝福：戰敗時只消耗一次，血量回復一半再戰
export function reviveWithBlessing(bossState) {
  if (!bossState) return bossState;
  return { ...bossState, playerHp: Math.round(bossState.playerMaxHp * 0.5) };
}

export function bossOutcome(bossState) {
  if (!bossState) return null;
  if (bossState.hp <= 0) return "victory";
  if (bossState.playerHp <= 0) return "defeat";
  return null;
}

export function getBossFights() {
  return store.read("bossFights", {});
}

export function recordBossOutcome(strandId, outcome, bestCombo = 0) {
  const all = getBossFights();
  const prev = all[strandId] ?? { defeated: false, bestCombo: 0, attempts: 0 };
  all[strandId] = {
    defeated: prev.defeated || outcome === "victory",
    bestCombo: Math.max(prev.bestCombo, bestCombo),
    attempts: prev.attempts + 1,
    lastFightAt: Date.now(),
    lastOutcome: outcome,
  };
  store.write("bossFights", all);
  return all[strandId];
}
