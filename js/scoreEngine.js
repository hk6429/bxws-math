import { store } from "./store.js";
import { evaluateMastery } from "./mastery-engine.js";

export function recordAnswer(nodeId, questionOrId, correct, msElapsed, node = {}) {
  const progress = store.read("progress", {});
  const entry = progress[nodeId] ?? { attempts: [], masteryPct: 0 };
  entry.totalAttempts = Number.isFinite(entry.totalAttempts) ? entry.totalAttempts : entry.attempts.length;
  entry.correctAttempts = Number.isFinite(entry.correctAttempts)
    ? entry.correctAttempts
    : entry.attempts.filter((savedAttempt) => savedAttempt.correct).length;
  entry.questionStats = entry.questionStats ?? {};
  const question = typeof questionOrId === "string" ? { id: questionOrId } : questionOrId;
  const attempt = {
    questionId: question.id,
    ...(question.challenge ? { challenge: question.challenge } : {}),
    ...(question.type ? { type: question.type } : {}),
    ...(question.errorPath !== undefined ? { errorPath: question.errorPath } : {}),
    ...(question._prereqQuickCheck ? { prereqQuickCheck: true } : {}),
    // 導師安撫題（連錯後插入的簡單題）與慢筆重描題（看過正解＋解析後重答同題）都不是
    // 乾淨的能力證據，打標後排除於精熟窗口，避免灌水答對率、假性完卷（仍照常記錯題本／Leitner）。
    ...(question._mentorCoaching ? { coachingAttempt: true } : {}),
    ...(question._retry ? { retryAttempt: true } : {}),
    ...(question._prereqNodeId ? { prereqNodeId: question._prereqNodeId } : {}),
    ...(question._remediationPath !== undefined ? { remediationPath: question._remediationPath } : {}),
    correct,
    msElapsed,
    at: Date.now(),
  };
  entry.attempts.push(attempt);
  entry.totalAttempts += 1;
  if (correct) entry.correctAttempts += 1;
  const questionStats = entry.questionStats[question.id] ?? { totalAttempts: 0, correctAttempts: 0 };
  questionStats.totalAttempts += 1;
  if (correct) questionStats.correctAttempts += 1;
  entry.questionStats[question.id] = questionStats;
  entry.attempts = entry.attempts.slice(-50);
  const challengeIds = question._challengeIds ?? entry.challengeIds ?? node.challengeIds;
  if (Array.isArray(challengeIds) && challengeIds.length > 0) {
    entry.challengeIds = [...new Set(challengeIds)];
  }
  const evaluationNode = entry.challengeIds
    ? { ...node, challengeIds: entry.challengeIds }
    : node;
  const result = evaluateMastery(entry.attempts, evaluationNode, undefined, entry.mastered === true);
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
    criteriaProgress: entry.criteriaProgress ?? null,
    unmetConditions: entry.unmetConditions ?? [],
    remainingPracticeCount: entry.remainingPracticeCount ?? Math.max(0, 12 - (entry.totalAttempts ?? entry.attempts.length)),
    missingChallenges: entry.missingChallenges ?? [],
    feedback: entry.feedback ?? "",
    errorLocks: entry.errorLocks ?? [],
    totalAttempts: entry.totalAttempts ?? entry.attempts.length,
    correctAttempts: entry.correctAttempts ?? entry.attempts.filter((a) => a.correct).length,
  };
}

export function overallMasteryPct(nodeIds) {
  if (nodeIds.length === 0) return 0;
  const progress = store.read("progress", {});
  const sum = nodeIds.reduce((acc, id) => acc + (progress[id]?.masteryPct ?? 0), 0);
  return Math.round((sum / nodeIds.length) * 100) / 100;
}
