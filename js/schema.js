import { store } from "./store.js";

let treeCache = null;

const QUESTION_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

export function validateQuestion(question) {
  if (!question || typeof question !== "object" || typeof question.id !== "string") {
    throw new Error("question.id 必須是字串");
  }
  if (question.difficulty !== undefined && !QUESTION_DIFFICULTIES.has(question.difficulty)) {
    throw new Error(`question.difficulty 不合法：${question.difficulty}`);
  }
  if (question.errorPath !== undefined
      && question.errorPath !== null
      && typeof question.errorPath !== "string"
      && typeof question.errorPath !== "number") {
    throw new Error("question.errorPath 必須是字串或舊版數字標籤");
  }
  return question;
}

export function validateQuestionBank(bank) {
  for (const key of ["basicMastery", "conceptId", "errorDiagnosis", "contextApplication"]) {
    for (const question of bank?.[key] ?? []) validateQuestion(question);
  }
  return bank;
}

export async function loadSkillTree() {
  if (treeCache) return treeCache;
  const res = await fetch("data/skilltree.json");
  if (!res.ok) throw new Error(`技能樹載入失敗（${res.status}）`);
  treeCache = await res.json();
  return treeCache;
}

export function allNodes(tree) {
  return tree.strands.flatMap((s) => s.nodes.map((n) => ({
    ...n,
    masteryThreshold: tree.masteryThresholds?.[n.tier] ?? tree.masteryThreshold ?? 0.8,
    strandId: s.id,
    strandName: s.name,
  })));
}

export function getProgress() {
  return store.read("progress", {});
}

export function getNodeMastery(nodeId, progress = getProgress()) {
  return progress[nodeId]?.masteryPct ?? 0;
}

export function isNodeMastered(nodeId, tree, progress = getProgress()) {
  const entry = progress[nodeId];
  if (!entry) return false;
  return entry.masteryVersion === 2 && entry.mastered === true;
}

export function isNodeUnlocked(node, tree, progress = getProgress()) {
  if (node.contentPending) return false;
  if (progress[node.id]?.diagnosticUnlocked === true) return true;
  if (!node.prereq || node.prereq.length === 0) return true;
  return node.prereq.every((id) => isNodeMastered(id, tree, progress));
}

export function nodeState(node, tree, progress = getProgress()) {
  if (node.contentPending) return "content-pending";
  if (isNodeMastered(node.id, tree, progress)) return "mastered";
  if (!isNodeUnlocked(node, tree, progress)) return "locked";
  return "unlocked";
}

export function isNodePlayable(node, tree, progress = getProgress()) {
  const state = nodeState(node, tree, progress);
  return state === "unlocked" || state === "mastered";
}

export function recommendedNextNode(tree, progress = getProgress()) {
  const nodes = allNodes(tree);
  return nodes.find((node) => nodeState(node, tree, progress) === "unlocked")
    ?? nodes.find((node) => isNodePlayable(node, tree, progress))
    ?? null;
}
