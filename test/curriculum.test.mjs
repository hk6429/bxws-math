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
const newStrandNodeIds = {
  "relation-pattern": [
    "repeat-pattern", "growing-pattern", "input-output-table", "pattern-rule",
    "coordinate-first-quadrant", "coordinate-plane", "function-relation", "direct-proportion",
  ],
  "data-uncertainty": [
    "data-table-basic", "bar-chart-reading", "line-chart-reading", "mean-basic",
    "median-mode", "range-data-interpretation", "chance-sample-space", "probability-basic",
  ],
};
const newestIds = new Set(Object.values(newStrandNodeIds).flat());
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
  "linear-equation-modeling": ["4-6", "4-8"],
  "linear-inequality-meaning": ["5-6", "5-8"],
  "linear-inequality-solving": ["6-6", "6-8"],
  "histogram-contingency": ["12-6", "12-8"],
  // 七年級八個 pending 骨架已補齊內容（Codex 產、主線程獨立驗收）
  "prime-factorization-app": ["1-6", "1-8"],
  "exponent-laws": ["2-6", "2-7"],
  "scientific-notation": ["3-6", "3-8"],
  "geometry-symbols": ["7-6", "7-7"],
  "three-views": ["8-6", "8-8"],
  "perpendicular-bisector": ["9-6", "9-8"],
  "symmetry-properties-jhs": ["10-6", "10-8"],
  "statistical-chart-design": ["11-6", "11-8"],
  // 四個國小骨架節點已補齊內容（Codex 產、主線程獨立驗收）
  "two-dimensional-pattern": ["1-6", "1-8"],
  "simple-classification": ["1-6", "1-8"],
  "pictogram-simple-table": ["2-6", "2-8"],
  "table-reading-making": ["3-6", "3-8"],
};

test("全技能骨架共 110 節點，id 全域唯一", () => {
  assert.equal(nodes.length, 110);
  assert.equal(new Set(nodes.map((node) => node.id)).size, nodes.length);
  assert.equal(nodes.filter((node) => !existingIds.has(node.id) && !newestIds.has(node.id)).length, 86);
  assert.equal(nodes.filter((node) => newestIds.has(node.id)).length, 16);
});

test("關係與規律、資料與可能性既有 8 節點順序不變，且已移除 status", () => {
  for (const [strandId, expectedNodeIds] of Object.entries(newStrandNodeIds)) {
    const strand = tree.strands.find((item) => item.id === strandId);
    assert.ok(strand, `缺少 ${strandId} strand`);
    assert.deepEqual(strand.nodes.slice(0, 8).map((node) => node.id), expectedNodeIds);
    assert.equal(Object.hasOwn(strand, "status"), false, `${strandId} 應移除 status`);
  }
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

test("十二骨架補齊內容後已無 contentPending，既有題庫守門挑戰符合裁決", () => {
  assert.equal(nodes.filter((node) => node.contentPending === true).length, 0);
  for (const node of nodes.filter((item) => !existingIds.has(item.id) && !newestIds.has(item.id))) {
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

test("22 個幾何節點全數完成且皆有 lessonMedia，無 pending 骨架", () => {
  const geometry = tree.strands.find((strand) => strand.id === "space-shape");
  assert.ok(geometry);
  assert.equal(geometry.nodes.length, 22);
  const readyGeometry = geometry.nodes.filter((node) => !node.contentPending);
  const pendingGeometry = geometry.nodes.filter((node) => node.contentPending);
  assert.equal(readyGeometry.length, 22);
  assert.equal(pendingGeometry.length, 0);
  for (const node of readyGeometry) {
    assert.equal(typeof node.lessonMedia?.src, "string", `${node.id} 缺 lessonMedia.src`);
    assert.match(node.lessonMedia.src, /^assets\/geometry\/.+\.(?:png|webp)$/);
    assert.equal(typeof node.lessonMedia?.alt, "string", `${node.id} 缺 lessonMedia.alt`);
    assert.ok(node.lessonMedia.alt.trim().length > 0, `${node.id} 的 alt 不可為空`);
  }
  assert.equal(new Set(readyGeometry.map((node) => node.lessonMedia.src)).size, 10);
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
