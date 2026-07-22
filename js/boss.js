import { store } from "./store.js";

// 神殿試煉：把「答對/答錯」包裝成對 boss 的傷害。不重造出題邏輯——
// 出題仍走 quiz-loader.js 既有的 buildMasterSession；這裡只算傷害與勝負。
export const BOSS_MAX_HP = 100;
export const PLAYER_MAX_HP = 100;
export const BOSSES = {
  "num-quantity": { icon: "⚖", name: "米諾陶洛斯", attacks: ["蹄聲試探", "迷宮封鎖", "狂角覺醒"] },
  algebra: { icon: "✦", name: "斯芬克斯", attacks: ["謎語試探", "獅身謎盾", "真言覺醒"] },
  "space-shape": { icon: "🔨", name: "獨眼巨人", attacks: ["石槌試探", "熔爐鐵壁", "巨眼覺醒"] },
  "relation-pattern": { icon: "🧵", name: "命運三女神", attacks: ["絲線試探", "命運織網", "三相覺醒"] },
  "data-uncertainty": { icon: "🏺", name: "皮媞亞", attacks: ["籤語試探", "迷霧神諭", "先知覺醒"] },
};

export function bossFor(strandId) {
  return BOSSES[strandId] ?? null;
}

export function newBossState(strandId) {
  if (!bossFor(strandId)) return null;
  return { strandId, hp: BOSS_MAX_HP, maxHp: BOSS_MAX_HP, playerHp: PLAYER_MAX_HP, playerMaxHp: PLAYER_MAX_HP };
}

// 階段只由 Boss 剩餘血量比例推導，不以答題次數或登入天數推進。
// correctBonus 只有答對才會成為反擊助力，並與裝備加成合計受 25% 上限約束。
export function bossPhase(bossState) {
  if (!bossState) return null;
  const ratio = bossState.maxHp > 0 ? bossState.hp / bossState.maxHp : 0;
  const index = ratio > 0.66 ? 0 : ratio > 0.33 ? 1 : 2;
  const phases = [
    { id: "probe", name: "試探攻勢", correctBonus: 0 },
    { id: "shield", name: "謎盾攻勢", correctBonus: 0.1 },
    { id: "awakened", name: "覺醒攻勢", correctBonus: 0.2 },
  ];
  return { ...phases[index], attack: bossFor(bossState.strandId)?.attacks?.[index] ?? phases[index].name };
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
  const phase = bossPhase(next);
  if (isCorrect) {
    const totalBonus = Math.min(0.25, Math.max(0, collectionBonus) + phase.correctBonus);
    const dmg = playerDamage(combo, next.playerHp, next.playerMaxHp, totalBonus);
    next.hp = Math.max(0, next.hp - dmg);
    const eventType = phase.id === "shield" ? "break" : phase.id === "awakened" ? "counter" : "hit";
    next.lastEvent = {
      type: eventType,
      dmg,
      totalBonus,
      phase: phase.id,
      phaseName: phase.name,
      attack: phase.attack,
    };
  } else {
    next.lastEvent = { type: "guard", dmg: 0, phase: phase.id, phaseName: phase.name, attack: phase.attack };
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
