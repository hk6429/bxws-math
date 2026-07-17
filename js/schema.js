import { store } from "./store.js";

let treeCache = null;

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
