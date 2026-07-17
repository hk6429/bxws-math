import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tree from "../data/skilltree.json" with { type: "json" };
import {
  applyDiagnosticResult,
  buildPrerequisiteDiagnostic,
  evaluatePrerequisiteDiagnostic,
} from "../js/prereq-diagnostic.js";
import { isNodeUnlocked } from "../js/schema.js";

const nodes = tree.strands.flatMap((strand) => strand.nodes);
const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

test("七個國中橋接節點提供先備診斷捷徑", () => {
  const expected = [
    "linear-eq-1var",
    "linear-equation-modeling",
    "linear-inequality-meaning",
    "linear-inequality-solving",
    "median-mode",
    "probability-basic",
    "histogram-contingency",
  ];
  assert.deepEqual(
    nodes.filter((node) => node.diagnosticPrereq).map((node) => node.id),
    expected
  );
  expected.forEach((id) => {
    assert.ok(nodesById[id].diagnosticPrereq.length >= 1 && nodesById[id].diagnosticPrereq.length <= 2);
  });
});

test("先備診斷只混合直接先備節點的基本精通題", async () => {
  const node = nodesById["linear-inequality-meaning"];
  const loadBank = async (nodeId) => ({
    basicMastery: Array.from({ length: 4 }, (_, index) => ({
      id: `${nodeId}-bm-${index + 1}`,
      type: "basic-mastery",
    })),
    errorDiagnosis: [{ id: `${nodeId}-ed`, type: "error-diagnosis" }],
  });
  const questions = await buildPrerequisiteDiagnostic(node, loadBank, 5);

  assert.equal(questions.length, 5);
  assert.deepEqual(new Set(questions.map((question) => question._diagnosticPrereqNodeId)), new Set(node.diagnosticPrereq));
  assert.ok(questions.every((question) => question.type === "basic-mastery"));
  assert.ok(questions.every((question) => question._diagnosticFor === node.id));
});

test("題庫未上線時由另一個直接先備補足，不會抽鎖定節點本身", async () => {
  const node = nodesById["histogram-contingency"];
  const loadBank = async (nodeId) => {
    if (nodeId === "statistical-chart-design") throw new Error("尚未上線");
    return {
      basicMastery: Array.from({ length: 5 }, (_, index) => ({
        id: `${nodeId}-bm-${index + 1}`,
        type: "basic-mastery",
      })),
    };
  };
  const questions = await buildPrerequisiteDiagnostic(node, loadBank, 5);
  assert.equal(questions.length, 5);
  assert.deepEqual(new Set(questions.map((question) => question._diagnosticPrereqNodeId)), new Set(["median-mode"]));
  assert.ok(questions.every((question) => !question.id.startsWith(`${node.id}-`)));
});

test("診斷達八成會直接解鎖，未達標則指出答錯的先備缺口", () => {
  const questions = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `a-${index}`, _diagnosticPrereqNodeId: "linear-eq-1var" })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `b-${index}`, _diagnosticPrereqNodeId: "negative-number" })),
  ];
  const passed = evaluatePrerequisiteDiagnostic(questions, [true, true, true, true, false]);
  assert.equal(passed.passed, true);

  const failed = evaluatePrerequisiteDiagnostic(questions, [true, true, false, true, false]);
  assert.equal(failed.passed, false);
  assert.deepEqual(failed.gapNodeIds, ["linear-eq-1var", "negative-number"]);

  const progress = applyDiagnosticResult({}, "linear-inequality-meaning", passed, 1234);
  assert.equal(progress["linear-inequality-meaning"].diagnosticUnlocked, true);
  assert.equal(isNodeUnlocked(nodesById["linear-inequality-meaning"], tree, progress), true);
  assert.equal(isNodeUnlocked(nodesById["linear-inequality-meaning"], tree, {}), false);
});

test("作答流程以獨立診斷場次評分，不灌入一般精熟紀錄", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /function startPrerequisiteDiagnostic/);
  assert.match(app, /kind: "diagnostic"/);
  assert.match(app, /session\.kind !== "diagnostic"[\s\S]*recordAnswer/);
  assert.match(app, /evaluatePrerequisiteDiagnostic/);
  assert.match(app, /applyDiagnosticResult/);
  assert.match(app, /diagnosticResult\.gapNodeIds/);
});
