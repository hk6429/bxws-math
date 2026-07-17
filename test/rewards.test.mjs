import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateBadges } from "../js/achievements.js";
import { claimStardustMilestones } from "../js/daily.js";

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

test("十五、二十、二十五節點補齊中段成就階梯", () => {
  globalThis.localStorage = fakeStorage({ "bxws:badges": "[]" });
  const unlocked = evaluateBadges({
    masteredCount: 25,
    totalNodes: 100,
    currentStreak: 0,
    encounterWins: 0,
  });
  const ids = unlocked.map((badge) => badge.id);
  assert.ok(ids.includes("fifteen-mastery"));
  assert.ok(ids.includes("twenty-mastery"));
  assert.ok(ids.includes("twenty-five-mastery"));
  assert.ok(!ids.includes("thirty-mastery"));
});

test("三十與一百星屑里程碑各只慶祝一次", () => {
  globalThis.localStorage = fakeStorage();
  assert.deepEqual(claimStardustMilestones(30), {
    newlyUnlocked: [30],
    unlocked: [30],
  });
  assert.deepEqual(claimStardustMilestones(30).newlyUnlocked, []);
  assert.deepEqual(claimStardustMilestones(100), {
    newlyUnlocked: [100],
    unlocked: [30, 100],
  });
  assert.deepEqual(claimStardustMilestones(100).newlyUnlocked, []);
});

test("收藏頁顯示已解鎖的星屑里程碑標記", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /stardust-milestone-celebration/);
  assert.match(app, /stardust-milestone-marker/);
  assert.match(app, /inkSection\.classList\.add\(`stardust-\$\{milestone\}`\)/);
});
