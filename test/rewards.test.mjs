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

test("四十到八十節點各有精熟里程碑", () => {
  globalThis.localStorage = fakeStorage({ "bxws:badges": "[]" });
  const ids = evaluateBadges({
    masteredCount: 80,
    totalNodes: 94,
    currentStreak: 0,
    encounterWins: 0,
  }).map((badge) => badge.id);
  assert.deepEqual(
    ["forty", "fifty", "sixty", "seventy", "eighty"].map((count) => ids.includes(`${count}-mastery`)),
    [true, true, true, true, true]
  );
  assert.ok(!ids.includes("all-mastery"));
});

test("每一座塔達到百分之百時都會各自獲得重燃章", () => {
  globalThis.localStorage = fakeStorage({ "bxws:badges": "[]" });
  const rooms = [
    "num-quantity", "algebra", "space-shape", "relation-pattern", "data-uncertainty",
  ].map((id) => ({ id, repairPct: 100 }));
  const ids = evaluateBadges({
    masteredCount: 0,
    totalNodes: 94,
    currentStreak: 0,
    encounterWins: 0,
    rooms,
  }).map((badge) => badge.id);
  assert.deepEqual(ids.filter((id) => id.endsWith("-tower-restored")), [
    "num-tower-restored",
    "algebra-tower-restored",
    "space-tower-restored",
    "relation-tower-restored",
    "data-tower-restored",
  ]);
});

test("結算成就脈絡會帶入工作室各塔修復狀態", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const finish = app.slice(app.indexOf("function finishSession"), app.indexOf("const newBadges"));
  assert.match(finish, /rooms:\s*workshop\.rooms/);
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
