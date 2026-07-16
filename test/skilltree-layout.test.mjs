import test from "node:test";
import assert from "node:assert/strict";
import tree from "../data/skilltree.json" with { type: "json" };
import { layoutNodes, splitLabelLines } from "../js/skilltree-ui.js";

const allNodes = tree.strands.flatMap((strand) => strand.nodes);
const nodesById = Object.fromEntries(allNodes.map((node) => [node.id, node]));

test("技能樹長標籤會自動換行，每行不超過可讀寬度", () => {
  assert.deepEqual(splitLabelLines("三角形／平行四邊形／梯形面積"), ["三角形／平行四", "邊形／梯形面積"]);
  allNodes.forEach((node) => {
    splitLabelLines(node.name).forEach((line) => assert.ok([...line].length <= 8, `${node.name}: ${line}`));
  });
});

test("技能樹將高密度層分行，標籤安全框不重疊", () => {
  for (const strand of tree.strands.filter((item) => item.nodes.length > 0)) {
    const { positions, width, height } = layoutNodes(strand.nodes, nodesById);
    const boxes = strand.nodes.map((node) => {
      const pos = positions[node.id];
      const lines = splitLabelLines(node.name);
      return {
        id: node.id,
        left: pos.x - 58,
        right: pos.x + 58,
        top: pos.y + 29,
        bottom: pos.y + 45 + (lines.length - 1) * 16,
      };
    });
    boxes.forEach((box) => {
      assert.ok(box.left >= 0 && box.right <= width, `${strand.id}/${box.id} 超出橫向邊界`);
      assert.ok(box.bottom <= height, `${strand.id}/${box.id} 超出縱向邊界`);
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        assert.equal(overlaps, false, `${strand.id}: ${a.id} 與 ${b.id} 標籤重疊`);
      }
    }
  }
});

test("跨 strand 的全域深度會壓密成連續畫布列", () => {
  const algebra = tree.strands.find((strand) => strand.id === "algebra");
  const { positions, height } = layoutNodes(algebra.nodes, nodesById);
  assert.ok(positions["algebra-symbol"].y < positions["linear-eq-1var"].y);
  assert.ok(positions["linear-eq-1var"].y < positions["linear-equation-modeling"].y);
  assert.ok(positions["linear-inequality-meaning"].y < positions["linear-inequality-solving"].y);
  assert.ok(Math.max(...Object.values(positions).map((pos) => pos.y)) < height);
  assert.ok(height < 800, `5 個代數節點的畫布不應因全域深度撲高：${height}`);
});
