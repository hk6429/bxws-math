import { store } from "./store.js";

let treeCache = null;

export async function loadSkillTree() {
  if (treeCache) return treeCache;
  const res = await fetch("data/skilltree.json");
  treeCache = await res.json();
  return treeCache;
}

export function allNodes(tree) {
  return tree.strands.flatMap((s) => s.nodes.map((n) => ({ ...n, strandId: s.id, strandName: s.name })));
}

export function getProgress() {
  return store.read("progress", {});
}

export function getNodeMastery(nodeId) {
  const progress = getProgress();
  return progress[nodeId]?.masteryPct ?? 0;
}

export function isNodeMastered(nodeId, tree) {
  return getNodeMastery(nodeId) >= (tree.masteryThreshold ?? 0.8);
}

export function isNodeUnlocked(node, tree) {
  if (!node.prereq || node.prereq.length === 0) return true;
  return node.prereq.every((id) => isNodeMastered(id, tree));
}

export function nodeState(node, tree) {
  if (!isNodeUnlocked(node, tree)) return "locked";
  if (isNodeMastered(node.id, tree)) return "mastered";
  return "unlocked";
}
