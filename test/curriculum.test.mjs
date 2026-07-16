import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tree = JSON.parse(await readFile(new URL("../data/skilltree.json", import.meta.url), "utf8"));
const nodes = tree.strands.flatMap((strand) =>
  strand.nodes.map((node) => ({ ...node, strand: strand.id }))
);
const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));
const existingIds = new Set([
  "fraction-unlike-denom", "fraction-mul", "decimal-mul", "ratio-rate",
  "negative-number", "proportion-eq", "algebra-symbol", "linear-eq-1var",
]);
const lowReadyGates = {
  "numbers-to-100": ["1-3", "1-6"],
  "basic-add-sub": ["2-6"],
  "add-sub-within-100": ["3-4", "3-5"],
  "money-basic": ["4-4"],
  "numbers-to-1000": ["5-6"],
  "vertical-add-sub": ["6-5"],
  "add-sub-word-problems": ["7-6", "7-7"],
  "multiplication-intro": ["8-4"],
  "times-table": ["9-6"],
  "two-step-basic": ["10-5", "10-6"],
  "share-and-group": ["11-5"],
  "unit-fraction": ["12-4", "12-6"],
};
const midReadyGates = {
  "big-number-10k": ["1-5"],
  "add-sub-multi-digit": ["2-2", "2-5"],
  "mul-by-1digit": ["3-4", "3-6"],
  "div-by-1digit": ["4-4", "4-6"],
  "two-step-problems": ["5-5", "5-7"],
  "big-number-100m": ["6-5"],
  "mul-div-2digit": ["7-3", "7-5", "7-6"],
  "estimation-round": ["8-4", "8-7"],
  "four-ops-order": ["9-1", "9-6"],
  "fraction-same-denom": ["10-7", "10-8"],
  "fraction-equivalent": ["11-3", "11-7"],
  "decimal-1place": ["12-5", "12-6"],
  "decimal-2place": ["13-2", "13-7"],
};
const measurementReadyGates = {
  "length-compare": ["1-5"],
  "time-daily": ["2-5"],
  "length-cm-m": ["3-7"],
  "quantity-compare": ["4-4", "4-7"],
  "clock-face": ["5-5", "5-6"],
  "calendar-units": ["6-4", "6-5"],
  "length-mm": ["7-7"],
  "area-cm2": ["9-3", "9-5"],
  "capacity-l-ml": ["10-6"],
  "weight-kg-g": ["11-5"],
  "time-hms": ["12-5", "12-6"],
  "length-km": ["13-5"],
  "area-m2": ["15-5"],
  "volume-cm3": ["16-5"],
  "time-add-sub": ["17-4", "17-6"],
};
const angleReadyGates = {
  "angle-basic": ["4", "6"],
  "angle-degree": ["4", "6"],
};
const finalReadyGates = {
  "shape-recognize": ["1-6", "1-4"],
  "shape-feature": ["2-6", "2-5"],
  "square-rect": ["4-6", "4-5"],
  "circle-parts": ["5-6", "5-4"],
  "perp-parallel": ["8-4", "8-6"],
  "tri-quad-types": ["9-5", "9-7"],
  "tri-quad-property": ["10-6", "10-7"],
  "line-symmetry": ["13-5", "13-7"],
  "perimeter-area-formula": ["6", "5"],
  "plane-area-formula": ["7", "3"],
  "sector-basic": ["7", "6"],
  "circle-measure": ["7", "4"],
  "cuboid-volume": ["6", "7"],
  "solids-nets": ["15-7", "15-6"],
  "scale-map": ["16-7", "16-5"],
  "prism-volume": ["18-7", "18-5"],
  "factor-multiple": ["1-5", "1-7"],
  "prime-factor": ["2-4", "2-6"],
  "gcd-lcm": ["3-6", "3-7"],
  "frac-dec-convert": ["4-6", "4-7"],
  "percent-rate": ["5-6"],
  "mixed-four-ops": ["6-6", "6-5"],
  "base-compare": ["8-6", "8-7"],
  "area-large-units": ["18-4", "18-5"],
  "weight-ton": ["19-5", "19-4"],
  "capacity-volume": ["21-5", "21-6"],
  "time-mul-div": ["22-4", "22-6"],
  "speed": ["5", "7"],
};
const readyGates = {
  ...lowReadyGates,
  ...midReadyGates,
  ...measurementReadyGates,
  ...angleReadyGates,
  ...finalReadyGates,
};

test("國小全技能骨架新增 70 節點，id 全域唯一", () => {
  assert.equal(nodes.length, 78);
  assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length);
  assert.equal(nodes.filter((node) => !existingIds.has(node.id)).length, 70);
});

test("tier、六組合併與兩組改名遵守總綱裁決", () => {
  assert.equal(tree.tiers["elem-low"], "國小低年級");
  assert.equal(tree.tiers["elem-mid"], "國小中年級");
  assert.ok(nodesById["two-step-basic"]);
  assert.ok(nodesById["two-step-problems"]);
  assert.ok(nodesById["four-ops-order"]);
  assert.ok(nodesById["mixed-four-ops"]);
  for (const discarded of [
    "circle-calc", "angle-right-angle", "angle-measure", "rect-perimeter-area", "volume-m3",
  ]) assert.equal(nodesById[discarded], undefined, `${discarded} 應由總綱合併或改名`);
  assert.equal(nodesById["circle-measure"].strand, "space-shape");
  assert.equal(nodesById["angle-basic"].strand, "space-shape");
  assert.equal(nodesById["angle-degree"].strand, "space-shape");
  assert.equal(nodesById["perimeter-area-formula"].strand, "space-shape");
  assert.equal(nodesById["cuboid-volume"].strand, "space-shape");
});

test("78 個節點 contentPending 歸零，70 個新題庫守門挑戰符合裁決", () => {
  assert.equal(nodes.filter((node) => node.contentPending === true).length, 0);
  for (const node of nodes.filter((item) => !existingIds.has(item.id))) {
    assert.ok(Array.isArray(node.gateChallenges), `${node.id} 應有 gateChallenges 陣列`);
    if (readyGates[node.id]) {
      assert.equal(node.contentPending, undefined, `${node.id} 應移除 contentPending`);
      assert.deepEqual(node.gateChallenges, readyGates[node.id]);
    } else {
      assert.equal(node.contentPending, true, `${node.id} 應標 contentPending`);
    }
  }
  assert.deepEqual(nodesById["shape-recognize"].gateChallenges, ["1-6", "1-4"]);
});

test("總綱第三節接線完成，跨 strand prereq 以全域索引解析且無環", () => {
  assert.deepEqual(nodesById["fraction-unlike-denom"].prereq, ["fraction-equivalent", "factor-multiple"]);
  assert.deepEqual(nodesById["decimal-mul"].prereq, ["decimal-2place"]);
  assert.deepEqual(nodesById["speed"].prereq, ["time-mul-div", "ratio-rate"]);
  assert.deepEqual(nodesById["scale-map"].prereq, ["tri-quad-property", "ratio-rate"]);

  for (const node of nodes) {
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
  nodes.forEach(visit);
});

test("space-shape 已解鎖，num-quantity 維持可用", () => {
  assert.equal(tree.strands.find((strand) => strand.id === "space-shape").status, undefined);
  assert.equal(tree.strands.find((strand) => strand.id === "num-quantity").status, undefined);
});
