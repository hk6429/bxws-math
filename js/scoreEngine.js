import { store } from "./store.js";

const RECENT_WINDOW = 10;

export function recordAnswer(nodeId, questionId, correct, msElapsed) {
  const progress = store.read("progress", {});
  const entry = progress[nodeId] ?? { attempts: [], masteryPct: 0 };
  entry.attempts.push({ questionId, correct, msElapsed, at: Date.now() });
  entry.masteryPct = computeMastery(entry.attempts);
  progress[nodeId] = entry;
  store.write("progress", progress);
  return entry.masteryPct;
}

function computeMastery(attempts) {
  const recent = attempts.slice(-RECENT_WINDOW);
  if (recent.length === 0) return 0;
  const correctCount = recent.filter((a) => a.correct).length;
  return Math.round((correctCount / recent.length) * 100) / 100;
}

export function getNodeStats(nodeId) {
  const progress = store.read("progress", {});
  const entry = progress[nodeId] ?? { attempts: [], masteryPct: 0 };
  return {
    masteryPct: entry.masteryPct,
    totalAttempts: entry.attempts.length,
    correctAttempts: entry.attempts.filter((a) => a.correct).length,
  };
}

export function overallMasteryPct(nodeIds) {
  if (nodeIds.length === 0) return 0;
  const progress = store.read("progress", {});
  const sum = nodeIds.reduce((acc, id) => acc + (progress[id]?.masteryPct ?? 0), 0);
  return Math.round((sum / nodeIds.length) * 100) / 100;
}
