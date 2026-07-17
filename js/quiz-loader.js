import { isDue, getBox, hasRecord, getBoxState } from "./leitner.js";
import { store } from "./store.js";
import { activeErrorLocks, buildAdaptiveSequence, prereqQuickCheckPassed } from "./mastery-engine.js";

const bankCache = {};

export async function loadQuestionBank(nodeId) {
  if (bankCache[nodeId]) return bankCache[nodeId];
  const res = await fetch(`data/questions/${nodeId}.json`);
  if (!res.ok) throw new Error(`題庫載入失敗：${nodeId}（${res.status}）`);
  const bank = await res.json();
  bankCache[nodeId] = bank;
  return bank;
}

export function flattenBank(bank) {
  return [
    ...(bank.basicMastery ?? []),
    ...(bank.conceptId ?? []),
    ...(bank.errorDiagnosis ?? []),
    ...(bank.contextApplication ?? []),
  ];
}

export function insertMentorCoachingQuestion(queue, currentIndex, basicQuestions, mentorLine, random = Math.random) {
  const candidates = (basicQuestions ?? []).filter((question) => question?.type === "basic-mastery");
  if (candidates.length === 0) return false;
  const picked = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  queue.splice(currentIndex + 1, 0, { ...picked, _mentorCoaching: true, _mentorLine: mentorLine });
  return true;
}

// 終局大師試煉：跨節點混題，每題帶 _nodeId 讓作答記錄回到原節點
export async function buildMasterSession(nodeIds, sessionSize = 10) {
  const results = await Promise.allSettled(nodeIds.map(loadQuestionBank));
  const all = results.flatMap((result, i) => result.status === "fulfilled"
    ? flattenBank(result.value).map((q) => ({ ...q, _nodeId: nodeIds[i] }))
    : []);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(sessionSize, all.length));
}

export async function buildSession(nodeId, sessionSize = 8, strategy = "slow", errorEntries = [], node = {}) {
  const bank = await loadQuestionBank(nodeId);
  const all = flattenBank(bank);
  // 補筆修稿：錯題本優先（標記 _fromErrorbook 供清帳），不足再以一般順序補滿
  const repairQuestions = strategy === "repair"
    ? errorEntries.slice(0, sessionSize).map((e) => ({ ...e.question, _fromErrorbook: true }))
    : [];
  const repairIds = new Set(repairQuestions.map((q) => q.id));
  const rest = all.filter((q) => !repairIds.has(q.id));
  const attempts = store.read("progress", {})[nodeId]?.attempts ?? [];
  const errorLock = activeErrorLocks(attempts)[0];
  const prereqNodeId = node.prereq?.[0];
  if (errorLock !== undefined && prereqNodeId
      && !prereqQuickCheckPassed(attempts, errorLock, prereqNodeId)) {
    const prereqBank = await loadQuestionBank(prereqNodeId);
    return (prereqBank.basicMastery ?? []).slice(0, 3).map((question) => ({
      ...question,
      _prereqQuickCheck: true,
      _prereqNodeId: prereqNodeId,
      _remediationPath: errorLock,
    }));
  }
  const challengeIds = [...new Set(rest.map((question) => question.challenge).filter(Boolean))];
  const isInitialChallengeScan = challengeIds.length > 0
    && !attempts.some((attempt) => attempt.challenge);
  const targetSize = isInitialChallengeScan
    ? Math.max(sessionSize, challengeIds.length)
    : sessionSize;
  const adaptive = rest.some((question) => question.challenge)
    ? buildAdaptiveSequence(
      rest,
      attempts,
      Math.max(0, targetSize - repairQuestions.length),
      Math.random,
      node
    ).map((question) => ({ ...question, _challengeIds: challengeIds }))
    : rest;
  const due = adaptive.filter((q) => isDue(q.id));
  const notDue = adaptive.filter((q) => !isDue(q.id));
  const dueIds = new Set(due.map((q) => q.id));
  const ordered = [...repairQuestions, ...due, ...notDue].sort((a, b) => {
    if (!!a._fromErrorbook !== !!b._fromErrorbook) return a._fromErrorbook ? -1 : 1;
    if (!!a._remediation !== !!b._remediation) return a._remediation ? -1 : 1;
    const aDue = dueIds.has(a.id);
    const bDue = dueIds.has(b.id);
    if (aDue !== bDue) return aDue ? -1 : 1;
    if (aDue) return getBox(b.id) - getBox(a.id); // 到期題中，記憶最成熟（高盒）者最急
    return getBox(a.id) - getBox(b.id);
  });
  return ordered.slice(0, Math.min(targetSize, ordered.length));
}

// 今日補墨：跨節點蒐集「作答過且到期」的複習題（高盒優先）
export async function buildReviewSession(nodeIds, sessionSize = 6) {
  const state = getBoxState();
  const dueRecords = Object.entries(state).filter(([id]) => isDue(id));
  const dueNodeIds = new Set(dueRecords.map(([, record]) => record.nodeId).filter(Boolean));
  const hasLegacyDue = dueRecords.some(([, record]) => !record.nodeId);
  const nodesToFetch = hasLegacyDue ? nodeIds : nodeIds.filter((id) => dueNodeIds.has(id));
  const results = await Promise.allSettled(nodesToFetch.map(loadQuestionBank));
  const all = results.flatMap((result, i) => result.status === "fulfilled" ? flattenBank(result.value).map((q) => {
    const nodeId = nodesToFetch[i];
    if (state[q.id] && !state[q.id].nodeId) state[q.id].nodeId = nodeId;
    return { ...q, _nodeId: nodeId };
  }) : []);
  if (dueRecords.some(([, record]) => !record.nodeId)) store.write("leitner", state);
  return all
    .filter((q) => hasRecord(q.id) && isDue(q.id))
    .sort((a, b) => getBox(b.id) - getBox(a.id))
    .slice(0, sessionSize);
}

// 今日到期複習題數（首頁修稿單用）
export async function countDueReviews(nodeIds) {
  const allowed = new Set(nodeIds);
  return Object.entries(getBoxState())
    .filter(([id, record]) => (!record.nodeId || allowed.has(record.nodeId)) && isDue(id)).length;
}
