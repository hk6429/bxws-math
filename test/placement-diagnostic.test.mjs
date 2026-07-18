import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tree from "../data/skilltree.json" with { type: "json" };
import {
  applyPlacementDiagnostic,
  buildPlacementDiagnostic,
  hasMeaningfulProgress,
} from "../js/placement-diagnostic.js";

const nodes = tree.strands.flatMap((strand) => strand.nodes);
const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

test("全新進度會顯示跨年級五分鐘定位入口", async () => {
  assert.equal(hasMeaningfulProgress({}), false);
  assert.equal(hasMeaningfulProgress({ empty: { attempts: [], masteryPct: 0 } }), false);
  assert.equal(hasMeaningfulProgress({ learned: { attempts: [{ correct: true }] } }), true);
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /不知道從哪開始？先做 5 分鐘定位測驗/);
  assert.match(app, /startPlacementDiagnostic/);
  assert.match(app, /kind: "placement"/);
});

test("定位題橫跨國小低中高年級與國中，並混合多種題型", async () => {
  const loadBank = async (nodeId) => ({
    basicMastery: [{ id: `${nodeId}-bm`, type: "basic-mastery", difficulty: "easy" }],
    conceptId: [{ id: `${nodeId}-ci`, type: "concept-id", difficulty: "medium" }],
    errorDiagnosis: [{ id: `${nodeId}-ed`, type: "error-diagnosis", difficulty: "hard" }],
  });
  const questions = await buildPlacementDiagnostic(tree, loadBank, 15);
  assert.equal(questions.length, 15);
  assert.deepEqual(new Set(questions.map((question) => nodesById[question._placementNodeId].tier)), new Set([
    "elem-low", "elem-mid", "elem-high", "jhs-g7",
  ]));
  assert.deepEqual(new Set(questions.map((question) => question.type)), new Set([
    "basic-mastery", "concept-id", "error-diagnosis",
  ]));
});

test("定位精熟只依實際作答紀錄與門檻寫入標準進度，不捏造百分比", () => {
  const questions = [
    ...[1, 2, 3].map((n) => ({ id: `decimal-${n}`, type: "basic-mastery", _placementNodeId: "decimal-mul" })),
    ...[1, 2, 3].map((n) => ({ id: `negative-${n}`, type: "concept-id", _placementNodeId: "negative-number" })),
  ];
  const progress = applyPlacementDiagnostic({}, questions, [true, true, true, true, false, true], nodesById, 1234);
  assert.equal(progress["decimal-mul"].masteryVersion, 2);
  assert.equal(progress["decimal-mul"].mastered, true);
  assert.equal(progress["decimal-mul"].masteryPct, 1);
  assert.equal(progress["decimal-mul"].attempts.length, 3);
  assert.equal(progress["negative-number"].mastered, false);
  assert.equal(progress["negative-number"].masteryPct, 0.67);
  assert.equal(progress["negative-number"].correctAttempts, 2);
  assert.equal(progress["negative-number"].attempts.every((attempt) => attempt.at === 1234), true);
});
