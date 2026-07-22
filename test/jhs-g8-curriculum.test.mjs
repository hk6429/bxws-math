import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tree from "../data/skilltree.json" with { type: "json" };

const expectedByStrand = {
  "num-quantity": [
    "square-root-radical",
  ],
  algebra: [
    "multiplication-formulas", "polynomial-operations", "factorization", "simultaneous-linear-2var",
  ],
  "space-shape": [
    "pythagorean-theorem", "triangle-congruence",
  ],
  "relation-pattern": [
    "linear-function-graph",
  ],
};
const newIds = new Set(Object.values(expectedByStrand).flat());
const allNodes = tree.strands.flatMap((strand) =>
  strand.nodes.map((node) => ({ ...node, strand: strand.id }))
);
const nodesById = Object.fromEntries(allNodes.map((node) => [node.id, node]));

test("八年級新增 8 節點依指定 strand 完整落位", () => {
  assert.equal(newIds.size, 8);
  for (const [strandId, expectedIds] of Object.entries(expectedByStrand)) {
    const actualIds = tree.strands
      .find((strand) => strand.id === strandId)
      .nodes.filter((node) => newIds.has(node.id))
      .map((node) => node.id);
    assert.deepEqual(actualIds, expectedIds, `${strandId} 新節點順序或歸屬錯誤`);
  }
});

test("八年級新節點 schema 完整且皆已上線", () => {
  for (const id of newIds) {
    const node = nodesById[id];
    assert.ok(node, `缺少 ${id}`);
    assert.equal(typeof node.name, "string", `${id}.name 應為字串`);
    assert.ok(node.name.trim().length > 0, `${id}.name 不可為空`);
    assert.equal(node.tier, "jhs-g8", `${id}.tier 應為 jhs-g8`);
    assert.ok(Array.isArray(node.prereq), `${id}.prereq 應為陣列`);
    assert.ok(node.prereq.length > 0, `${id} 應有明確先備節點`);
    assert.ok(Array.isArray(node.diagnosticPrereq), `${id}.diagnosticPrereq 應為陣列`);
    assert.ok(node.diagnosticPrereq.every((p) => node.prereq.includes(p)), `${id} 診斷先備必須是直接先備`);
    assert.ok(Array.isArray(node.gateChallenges), `${id}.gateChallenges 應為陣列`);
    assert.equal(node.gateChallenges.length, 2, `${id} 應有 2 個守門挑戰`);
    assert.ok(node.gateChallenges.every((challenge) => /^\d+-\d+$/.test(challenge)), `${id} 守門挑戰格式錯誤`);
    assert.equal(node.contentPending, undefined, `${id} 已有題庫應上線`);
  }
});

test("八年級新節點 prereq 皆可解析且接上真實先備鏈", () => {
  for (const id of newIds) {
    for (const prereqId of nodesById[id].prereq) {
      assert.ok(nodesById[prereqId], `${id} 的 prereq ${prereqId} 不存在`);
    }
  }
  assert.deepEqual(nodesById["multiplication-formulas"].prereq, ["exponent-laws", "algebra-symbol"]);
  assert.deepEqual(nodesById["pythagorean-theorem"].prereq, ["square-root-radical", "geometry-symbols"]);
  assert.deepEqual(nodesById["simultaneous-linear-2var"].prereq, ["linear-eq-1var"]);
  assert.deepEqual(nodesById["linear-function-graph"].prereq, ["function-relation", "coordinate-plane"]);
});

test("八年級 8 節點各有 8 挑戰 × 3 自編變式，答案索引均衡不可矇答", async () => {
  for (const nodeId of newIds) {
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
    assert.ok(nodesById[nodeId].gateChallenges.every((gate) => groups.has(gate)), `${nodeId} gateChallenges 必須對應真實題組`);
    assert.equal(bank.curriculum?.sourceType, "自編", `${nodeId} 應明示自編`);
    // 題目全數可純文字作答（無圖片依賴）
    assert.ok(!questions.some((question) => /(?:如圖|下圖|看圖|圖中)/.test(JSON.stringify(question))), `${nodeId} 題目必須可純文字作答`);
    // 選擇題正解索引須跨 0-3 分布，任一索引不得過半，杜絕「點第一個矇過」
    const answerIdx = [...bank.basicMastery, ...bank.contextApplication].map((question) => question.answer)
      .concat(bank.errorDiagnosis.map((question) => question.correctErrorIndex));
    assert.ok(answerIdx.every((index) => Number.isInteger(index) && index >= 0 && index <= 3), `${nodeId} 選項索引須為 0-3`);
    const counts = answerIdx.reduce((map, index) => map.set(index, (map.get(index) ?? 0) + 1), new Map());
    assert.ok(counts.size >= 3, `${nodeId} 正解索引至少要用到 3 種位置`);
    assert.ok(Math.max(...counts.values()) <= answerIdx.length * 0.5, `${nodeId} 單一索引不得占過半，易被矇答`);
    // 找錯題正解不可全部落在同一位置
    assert.ok(new Set(bank.errorDiagnosis.map((question) => question.correctErrorIndex)).size >= 2, `${nodeId} 找錯題正解不可固定同一選項`);
  }
});
