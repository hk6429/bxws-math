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

export async function buildSession(nodeId, sessionSize = 8) {
  const bank = await loadQuestionBank(nodeId);
  const all = flattenBank(bank);
  const due = all.filter((q) => isDue(q.id));
  const notDue = all.filter((q) => !isDue(q.id));
  const ordered = [...due, ...notDue].sort((a, b) => getBox(a.id) - getBox(b.id));
  return ordered.slice(0, Math.min(sessionSize, ordered.length));
}
