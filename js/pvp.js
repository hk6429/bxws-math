import { store } from "./store.js";

// PvP 本機挑戰書骨架：同一個 seed，任何人在任何時間都能重建出完全相同的一組題目，
// 不需要伺服器出題——這是「不接後端也能比分」的關鍵，日後要接即時對戰時
// 也是同一套 seed 機制（見 references/battle-engine.md），先把可重現的部分做穩。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 同一個 seed + 同一份題庫，兩次呼叫必須產出完全相同的題目序列——這是 PvP 公平性的核心保證。
export function buildSeededQuestions(seed, allQuestions, size = 10) {
  const rng = mulberry32(seed);
  return seededShuffle(allQuestions, rng).slice(0, Math.min(size, allQuestions.length));
}

export function newChallengeSeed(random = Math.random) {
  return Math.floor(random() * 1e9);
}

export function getPvpChallenges() {
  return store.read("pvpChallenges", {});
}

// 非同步挑戰書：把「這個 seed 打出的總傷害／連擊」記下來，之後同 seed 重打去比分
export function recordPvpRun(seed, strandId, result) {
  const all = getPvpChallenges();
  const key = String(seed);
  const prevBest = all[key]?.bestDmg ?? 0;
  const next = {
    strandId,
    seed,
    lastDmg: result.totalDmg,
    bestDmg: Math.max(prevBest, result.totalDmg),
    lastCombo: result.maxCombo,
    attempts: (all[key]?.attempts ?? 0) + 1,
    lastPlayedAt: Date.now(),
  };
  all[key] = next;
  store.write("pvpChallenges", all);
  return next;
}

export function pvpChallengeFor(seed) {
  return getPvpChallenges()[String(seed)] ?? null;
}
