import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSession, loadQuestionBank } from "../js/quiz-loader.js";

const nodeIds = [
  "numbers-to-100", "basic-add-sub", "add-sub-within-100", "money-basic",
  "numbers-to-1000", "vertical-add-sub", "add-sub-word-problems", "multiplication-intro",
  "times-table", "two-step-basic", "share-and-group", "unit-fraction",
  "big-number-10k", "add-sub-multi-digit", "mul-by-1digit", "div-by-1digit",
  "two-step-problems", "big-number-100m", "mul-div-2digit", "estimation-round",
  "four-ops-order", "fraction-same-denom", "fraction-equivalent", "decimal-1place",
  "decimal-2place",
  "length-compare", "time-daily", "length-cm-m", "quantity-compare", "clock-face",
  "calendar-units", "length-mm", "area-cm2", "capacity-l-ml", "weight-kg-g",
  "time-hms", "length-km", "area-m2", "volume-cm3", "time-add-sub",
  "angle-basic", "angle-degree",
  "shape-recognize", "shape-feature", "square-rect", "circle-parts", "perp-parallel",
  "tri-quad-types", "tri-quad-property", "line-symmetry", "perimeter-area-formula",
  "plane-area-formula", "sector-basic", "circle-measure", "cuboid-volume", "solids-nets",
  "scale-map", "prism-volume", "factor-multiple", "prime-factor", "gcd-lcm",
  "frac-dec-convert", "percent-rate", "mixed-four-ops", "base-compare", "area-large-units",
  "weight-ton", "capacity-volume", "time-mul-div", "speed",
  "fraction-unlike-denom", "fraction-mul", "decimal-mul", "ratio-rate",
  "negative-number", "proportion-eq", "algebra-symbol", "linear-eq-1var",
];

const questionArrays = ["basicMastery", "conceptId", "errorDiagnosis", "contextApplication"];
const legacyNodeIds = new Set([
  "fraction-unlike-denom", "fraction-mul", "decimal-mul", "ratio-rate",
  "negative-number", "proportion-eq", "algebra-symbol", "linear-eq-1var",
]);

globalThis.fetch = async (url) => {
  const body = await readFile(new URL(`../${url}`, import.meta.url), "utf8");
  return { json: async () => JSON.parse(body) };
};
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};

test("quiz-loader 可載入全庫 78 個節點題庫，且容忍頂層 curriculum", async () => {
  const banks = await Promise.all(nodeIds.map(loadQuestionBank));
  assert.equal(banks.length, 78);
  for (const [index, bank] of banks.entries()) {
    const questions = questionArrays.flatMap((key) => bank[key] ?? []);
    assert.ok(questions.length >= 24, `${nodeIds[index]} 題數不足`);
    if (!legacyNodeIds.has(nodeIds[index])) {
      assert.ok(questions.every((question) => question.challenge), `${nodeIds[index]} 缺 challenge`);
    }
  }
  assert.ok(banks.some((bank) => bank.curriculum));
});

test("fraction-same-denom 首輪自動掃描 9 項挑戰", async () => {
  const queue = await buildSession("fraction-same-denom");
  assert.equal(queue.length, 9);
  assert.equal(new Set(queue.map((question) => question.challenge)).size, 9);
});

test("big-number-10k 維持 8 項挑戰的首輪掃描", async () => {
  const queue = await buildSession("big-number-10k", 8, "slow", [], { tier: "elem-mid" });
  assert.equal(queue.length, 8);
  assert.equal(new Set(queue.map((question) => question.challenge)).size, 8);
});

test("首輪掃描同時相容節-列與純數字 challenge 編號", async () => {
  const prefixed = await buildSession("time-add-sub", 8, "slow", [], { tier: "elem-mid" });
  const plain = await buildSession("angle-basic", 8, "slow", [], { tier: "elem-mid" });
  assert.equal(new Set(prefixed.map((question) => question.challenge)).size, 8);
  assert.deepEqual(
    [...new Set(plain.map((question) => question.challenge))].sort(),
    ["1", "2", "3", "4", "5", "6", "7", "8"]
  );
});

test("W3 17 個節點皆可建立首輪測驗", async () => {
  const w3NodeIds = [
    "length-compare", "time-daily", "length-cm-m", "quantity-compare", "clock-face",
    "calendar-units", "length-mm", "area-cm2", "capacity-l-ml", "weight-kg-g",
    "time-hms", "length-km", "area-m2", "volume-cm3", "time-add-sub",
    "angle-basic", "angle-degree",
  ];
  const lowIds = new Set([
    "length-compare", "time-daily", "length-cm-m", "quantity-compare", "clock-face",
    "calendar-units",
  ]);
  for (const nodeId of w3NodeIds) {
    const queue = await buildSession(nodeId, 8, "slow", [], {
      tier: lowIds.has(nodeId) ? "elem-low" : "elem-mid",
    });
    assert.equal(queue.length, 8, `${nodeId} 首輪題數應為 8`);
    assert.ok(queue.every((question) => typeof question.challenge === "string"));
  }
});
