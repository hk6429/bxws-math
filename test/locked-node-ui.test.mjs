import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import tree from "../data/skilltree.json" with { type: "json" };
import { lockedNodeMessage } from "../js/skilltree-ui.js";

const nodes = tree.strands.flatMap((strand) => strand.nodes);
const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));

test("鎖定提示只具名列出尚未精熟的直接先備", () => {
  const node = nodesById["linear-inequality-meaning"];
  const progress = {
    "linear-eq-1var": { masteryVersion: 2, mastered: true },
  };
  assert.equal(
    lockedNodeMessage(node, tree, progress, nodesById),
    "先精通「整數與負數」才能解鎖"
  );
  assert.equal(
    lockedNodeMessage(node, tree, {}, nodesById),
    "先精通「一元一次方程式」、「整數與負數」才能解鎖"
  );
});

test("鎖定節點提示可朗讀，且橋接節點提供先備診斷按鈕", async () => {
  const [ui, app] = await Promise.all([
    readFile(new URL("../js/skilltree-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /aria-live["'], ["']polite/);
  assert.match(ui, /參加先備診斷/);
  assert.match(ui, /onStartDiagnostic\(node\)/);
  assert.match(app, /renderSkillTree\(container, tree, startQuiz, startPrerequisiteDiagnostic\)/);
});
