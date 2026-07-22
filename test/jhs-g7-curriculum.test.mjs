import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tree from "../data/skilltree.json" with { type: "json" };

const expectedByStrand = {
  "num-quantity": [
    "prime-factorization-app", "exponent-laws", "scientific-notation",
  ],
  algebra: [
    "linear-equation-modeling", "linear-inequality-meaning", "linear-inequality-solving",
  ],
  "space-shape": [
    "geometry-symbols", "three-views", "perpendicular-bisector", "symmetry-properties-jhs",
  ],
  "data-uncertainty": [
    "statistical-chart-design", "histogram-contingency",
  ],
};
const newIds = new Set(Object.values(expectedByStrand).flat());
const allNodes = tree.strands.flatMap((strand) =>
  strand.nodes.map((node) => ({ ...node, strand: strand.id }))
);
const nodesById = Object.fromEntries(allNodes.map((node) => [node.id, node]));
const completedThisRound = new Set([
  "linear-equation-modeling", "linear-inequality-meaning", "linear-inequality-solving",
  "histogram-contingency",
]);

test("七年級新增 12 節點依指定 strand 完整落位", () => {
  assert.equal(newIds.size, 12);
  for (const [strandId, expectedIds] of Object.entries(expectedByStrand)) {
    const actualIds = tree.strands
      .find((strand) => strand.id === strandId)
      .nodes.filter((node) => newIds.has(node.id))
      .map((node) => node.id);
    assert.deepEqual(actualIds, expectedIds, `${strandId} 新節點順序或歸屬錯誤`);
  }
});

test("七年級新節點 schema 完整，且題庫未完成狀態一致", () => {
  for (const id of newIds) {
    const node = nodesById[id];
    assert.ok(node, `缺少 ${id}`);
    assert.equal(typeof node.name, "string", `${id}.name 應為字串`);
    assert.ok(node.name.trim().length > 0, `${id}.name 不可為空`);
    assert.equal(node.tier, "jhs-g7", `${id}.tier 應為 jhs-g7`);
    assert.ok(Array.isArray(node.prereq), `${id}.prereq 應為陣列`);
    assert.ok(node.prereq.length > 0, `${id} 應有明確先備節點`);
    assert.ok(Array.isArray(node.gateChallenges), `${id}.gateChallenges 應為陣列`);
    assert.equal(node.gateChallenges.length, 2, `${id} 應有 2 個守門挑戰`);
    assert.ok(node.gateChallenges.every((challenge) => /^\d+-\d+$/.test(challenge)), `${id} 守門挑戰格式錯誤`);
    assert.equal(node.contentPending, completedThisRound.has(id) ? undefined : true, `${id}.contentPending 狀態不一致`);
  }
});

test("全域 prereq 皆可解析且無循環，包含跨 strand 新接線", () => {
  for (const node of allNodes) {
    for (const prereqId of node.prereq ?? []) {
      assert.ok(nodesById[prereqId], `${node.id} 的 prereq ${prereqId} 不存在`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node.id)) assert.fail(`prereq 出現循環：${node.id}`);
    if (visited.has(node.id)) return;
    visiting.add(node.id);
    for (const prereqId of node.prereq ?? []) visit(nodesById[prereqId]);
    visiting.delete(node.id);
    visited.add(node.id);
  };
  allNodes.forEach(visit);

  assert.deepEqual(nodesById["scientific-notation"].prereq, ["exponent-laws", "decimal-mul"]);
  assert.deepEqual(nodesById["linear-inequality-meaning"].prereq, ["linear-eq-1var", "negative-number"]);
  assert.deepEqual(nodesById["perpendicular-bisector"].prereq, ["geometry-symbols", "perp-parallel"]);
  assert.deepEqual(nodesById["histogram-contingency"].prereq, ["statistical-chart-design", "median-mode"]);
});

test("七年級兩個試水節點各有 8 挑戰 × 3 自編變式", async () => {
  for (const nodeId of ["negative-number", "linear-eq-1var"]) {
    const bank = JSON.parse(await readFile(new URL(`../data/questions/${nodeId}.json`, import.meta.url), "utf8"));
    const arrays = [bank.basicMastery, bank.conceptId, bank.errorDiagnosis, bank.contextApplication];
    assert.deepEqual(arrays.map((questions) => questions.length), [6, 6, 6, 6], `${nodeId} 四題型應各 6 題`);
    const questions = arrays.flat();
    assert.equal(questions.length, 24, `${nodeId} 應為 24 題`);
    assert.equal(new Set(questions.map((question) => question.id)).size, 24, `${nodeId} id 應唯一`);
    const groups = Map.groupBy(questions, (question) => question.challenge);
    assert.equal(groups.size, 8, `${nodeId} 應有 8 項挑戰`);
    assert.ok([...groups.values()].every((group) => group.length === 3), `${nodeId} 每項挑戰應有 3 變式`);
    assert.ok(questions.every((question) => ["easy", "medium", "hard"].includes(question.difficulty)), `${nodeId} difficulty 不完整`);
    assert.ok(questions.every((question) => typeof question.errorPath === "string" && question.errorPath.length > 0 && !/^\d+$/.test(question.errorPath)), `${nodeId} errorPath 必須是迷思標籤字串`);
    assert.ok([...groups.values()].every((group) => new Set(group.map((question) => question.errorPath)).size === 1), `${nodeId} 同挑戰應累積同一迷思`);
    assert.equal(bank.curriculum?.sourceType, "自編", `${nodeId} 應明示自編`);
  }
});

test("七年級試水節點接上名稱與真實作答守門挑戰", () => {
  assert.equal(nodesById["negative-number"].name, "整數與負數");
  assert.deepEqual(nodesById["negative-number"].gateChallenges, ["13-6", "13-8"]);
  assert.deepEqual(nodesById["linear-eq-1var"].gateChallenges, ["14-6", "14-8"]);
});
