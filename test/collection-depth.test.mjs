import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  key(index) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}

globalThis.localStorage = new FakeStorage();
const { RARE_STAMPS, STAMP_RARITIES, resolveEncounterReward } = await import("../js/collection.js");

test("導師徽記擴充至 30 枚且三階稀有度各有掉落率與保底", () => {
  assert.equal(RARE_STAMPS.length, 30);
  assert.deepEqual([...new Set(RARE_STAMPS.map((stamp) => stamp.rarity))].sort(), ["傳說", "普通", "稀有"]);
  assert.deepEqual(STAMP_RARITIES, {
    "普通": { dropRate: 0.12, pity: 5 },
    "稀有": { dropRate: 0.05, pity: 15 },
    "傳說": { dropRate: 0.02, pity: 30 },
  });
  assert.ok(RARE_STAMPS.every((stamp) => ["凡奇", "格思", "幾德", "斐蘿", "帕嵐"].includes(stamp.mentor)));
});

test("普通五抽保底、稀有十五抽保底、傳說三十抽保底獨立累積", () => {
  localStorage.data.clear();
  let drop = null;
  for (let draw = 1; draw <= 5; draw += 1) drop = resolveEncounterReward("fraction-mul", "davinci", () => 0.99);
  assert.equal(drop.stamp.rarity, "普通");

  localStorage.data.clear();
  for (let draw = 1; draw <= 14; draw += 1) resolveEncounterReward("fraction-mul", "davinci", () => 0.08);
  drop = resolveEncounterReward("fraction-mul", "davinci", () => 0.08);
  assert.equal(drop.stamp.rarity, "稀有");

  localStorage.data.clear();
  for (let draw = 1; draw <= 29; draw += 1) resolveEncounterReward("fraction-mul", "davinci", () => 0.08);
  drop = resolveEncounterReward("fraction-mul", "davinci", () => 0.08);
  assert.equal(drop.stamp.rarity, "傳說");
});
