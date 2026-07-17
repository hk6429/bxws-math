import test from "node:test";
import assert from "node:assert/strict";
import { RARE_STAMPS, resolveEncounterReward } from "../js/collection.js";
import { getStardustCount } from "../js/daily.js";

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

test("十枚徽記集齊後，奇遇答對改注入三粒星屑", () => {
  const fullBook = Object.fromEntries(RARE_STAMPS.map((stamp) => [stamp.id, { at: 1 }]));
  globalThis.localStorage = fakeStorage({
    "bxws:rareStampBook": JSON.stringify(fullBook),
    "bxws:inkDays": JSON.stringify(["2026-07-16"]),
    "bxws:encounterPity": "9",
  });

  const reward = resolveEncounterReward("fraction-mul", "davinci", () => 1);

  assert.deepEqual(reward, {
    type: "stardust",
    amount: 3,
    message: "徽記已全數集齊，這次的魔力化為 3 粒星屑注入你的瓶中",
  });
  assert.equal(getStardustCount(), 4);
  assert.equal(JSON.parse(localStorage.getItem("bxws:encounterPity")), 0);
});
