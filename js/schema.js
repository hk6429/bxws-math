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
  const progress = getProgress();
  const entry = progress[nodeId];
  if (!entry) return false;
  if (entry.masteryVersion === 2) return entry.mastered === true;
  if ((entry.masteryPct ?? 0) < (tree.masteryThreshold ?? 0.8)) return false;
  entry.mastered = true;
  entry.masteryVersion = 2;
  progress[nodeId] = entry;
  store.write("progress", progress);
  return true;
}

export function isNodeUnlocked(node, tree) {
  if (node.contentPending) return false;
  if (!node.prereq || node.prereq.length === 0) return true;
  return node.prereq.every((id) => isNodeMastered(id, tree));
}

export function nodeState(node, tree) {
  if (node.contentPending) return "content-pending";
  if (isNodeMastered(node.id, tree)) return "mastered";
  if (!isNodeUnlocked(node, tree)) return "locked";
  return "unlocked";
}

export function isNodePlayable(node, tree) {
  const state = nodeState(node, tree);
  return state === "unlocked" || state === "mastered";
}
