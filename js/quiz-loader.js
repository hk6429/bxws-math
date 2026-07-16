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

export async function buildSession(nodeId, sessionSize = 8) {
  const bank = await loadQuestionBank(nodeId);
  const all = flattenBank(bank);
  const due = all.filter((q) => isDue(q.id));
  const notDue = all.filter((q) => !isDue(q.id));
  const ordered = [...due, ...notDue].sort((a, b) => getBox(a.id) - getBox(b.id));
  return ordered.slice(0, Math.min(sessionSize, ordered.length));
}
