import { isDue, getBox } from "./leitner.js";

const bankCache = {};

export async function loadQuestionBank(nodeId) {
  if (bankCache[nodeId]) return bankCache[nodeId];
  const res = await fetch(`data/questions/${nodeId}.json`);
  const bank = await res.json();
  bankCache[nodeId] = bank;
  return bank;
}

function flattenBank(bank) {
  return [
    ...bank.basicMastery,
    ...bank.conceptId,
    ...bank.errorDiagnosis,
    ...bank.contextApplication,
  ];
}

// 終局大師試煉：跨節點混題，每題帶 _nodeId 讓作答記錄回到原節點
export async function buildMasterSession(nodeIds, sessionSize = 10) {
  const banks = await Promise.all(nodeIds.map(loadQuestionBank));
  const all = banks.flatMap((bank, i) =>
    flattenBank(bank).map((q) => ({ ...q, _nodeId: nodeIds[i] }))
  );
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(sessionSize, all.length));
}

export async function buildSession(nodeId, sessionSize = 8, strategy = "slow", errorEntries = []) {
  const bank = await loadQuestionBank(nodeId);
  const all = flattenBank(bank);
  // 補筆修稿：錯題本優先（標記 _fromErrorbook 供清帳），不足再以一般順序補滿
  const repairQuestions = strategy === "repair"
    ? errorEntries.slice(0, sessionSize).map((e) => ({ ...e.question, _fromErrorbook: true }))
    : [];
  const repairIds = new Set(repairQuestions.map((q) => q.id));
  const rest = all.filter((q) => !repairIds.has(q.id));
  const due = rest.filter((q) => isDue(q.id));
  const notDue = rest.filter((q) => !isDue(q.id));
  const ordered = [...repairQuestions, ...due, ...notDue].sort((a, b) => {
    if (!!a._fromErrorbook !== !!b._fromErrorbook) return a._fromErrorbook ? -1 : 1;
    return getBox(a.id) - getBox(b.id);
  });
  return ordered.slice(0, Math.min(sessionSize, ordered.length));
}
