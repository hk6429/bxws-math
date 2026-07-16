import { store } from "./store.js";
import { evaluateMastery } from "./mastery-engine.js";

export function recordAnswer(nodeId, questionOrId, correct, msElapsed, node = {}) {
  const progress = store.read("progress", {});
  const entry = progress[nodeId] ?? { attempts: [], masteryPct: 0 };
  const question = typeof questionOrId === "string" ? { id: questionOrId } : questionOrId;
  const attempt = {
    questionId: question.id,
    ...(question.challenge ? { challenge: question.challenge } : {}),
    ...(question.type ? { type: question.type } : {}),
    ...(question.errorPath !== undefined ? { errorPath: question.errorPath } : {}),
    correct,
    msElapsed,
    at: Date.now(),
  };
  entry.attempts.push(attempt);
  const challengeIds = question._challengeIds ?? entry.challengeIds ?? node.challengeIds;
  if (Array.isArray(challengeIds) && challengeIds.length > 0) {
    entry.challengeIds = [...new Set(challengeIds)];
  }
  const evaluationNode = entry.challengeIds
    ? { ...node, challengeIds: entry.challengeIds }
    : node;
  const result = evaluateMastery(entry.attempts, evaluationNode, 0.8, entry.mastered === true);
  Object.assign(entry, result, { masteryVersion: 2 });
  progress[nodeId] = entry;
  store.write("progress", progress);
  return entry.masteryPct;
}

export function getNodeStats(nodeId) {
  const progress = store.read("progress", {});
  const entry = progress[nodeId] ?? { attempts: [], masteryPct: 0 };
  return {
    masteryPct: entry.masteryPct,
    mastered: entry.mastered === true,
    stars: entry.stars ?? 0,
    conditions: entry.conditions ?? null,
    missingChallenges: entry.missingChallenges ?? [],
    feedback: entry.feedback ?? "",
    errorLocks: entry.errorLocks ?? [],
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
