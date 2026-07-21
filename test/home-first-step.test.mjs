import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { returningWelcome } from "../js/daily.js";
import { recommendedNextNode } from "../js/schema.js";

test("離開兩天後的首頁只溫柔顯示最多六頁", () => {
  const now = Date.UTC(2026, 6, 17, 12);
  assert.deepEqual(returningWelcome({ at: now - 2 * 86400000 }, 25, now), {
    daysAway: 2,
    displayDueCount: 6,
    headline: "導師把神諭卷軸都收好了，今天先點亮 6 頁就好",
  });
});

test("推薦節點沿用星圖第一個已解鎖但未精熟的前線", () => {
  const tree = { masteryThreshold: 0.8, strands: [{ id: "s", nodes: [
    { id: "done", prereq: [] },
    { id: "frontier", prereq: ["done"] },
    { id: "locked", prereq: ["frontier"] },
  ] }] };
  const progress = { done: { masteryVersion: 2, mastered: true, masteryPct: 1 } };
  assert.equal(recommendedNextNode(tree, progress).id, "frontier");
});

test("今日第一步依序檢查斷點、到期複習、推薦節點", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const start = app.indexOf("async function takeTodayFirstStep");
  const block = app.slice(start, app.indexOf("\n}", start) + 2);
  assert.ok(block.indexOf("activeSession") < block.indexOf("dueCount > 0"));
  assert.ok(block.indexOf("dueCount > 0") < block.indexOf("recommendedNextNode"));
  assert.match(block, /lastStrategy === null[\s\S]*startQuiz\(recommended\)/);
  assert.match(block, /startQuizWithStrategy\(recommended, lastStrategy\)/);
  // 「今日第一步」已升級成會依現況變化的主要行動大按鈕（U4/K6），仍走 takeTodayFirstStep 派發
  const step = app.indexOf("function makeTodayFirstStep");
  const stepBlock = app.slice(step, app.indexOf("\n}", step) + 2);
  assert.match(stepBlock, /home-hero-action/);
  assert.match(stepBlock, /takeTodayFirstStep\(dueCount\)/);
  assert.match(stepBlock, /繼續上次的練習/);
});

test("新手提示改指向今日第一步，回訪者也不會收到矛盾指令", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const start = app.indexOf("function maybeShowOnboardingTip");
  const block = app.slice(start, app.indexOf("\n}", start) + 2);
  assert.match(block, /store\.read\("lastStrategy", null\) === null/);
  assert.match(block, /今日第一步/);
  assert.doesNotMatch(block, /喚醒到一半/);
});

test("真正新玩家必須完成三步引導，首頁看板預設展開並顯示連續天數", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const start = app.indexOf("function maybeShowOnboardingTip");
  const block = app.slice(start, app.indexOf("// 進節點", start));
  assert.match(block, /activeSession/);
  assert.match(block, /dueCount === 0/);
  assert.match(block, /lastStrategy === null/);
  assert.match(block, /showModal\(\)/);
  assert.match(block, /steps = \[/);
  assert.match(block, /今日第一步/);
  assert.match(block, /今日看板/);
  assert.match(block, /preventDefault\(\)/);
  assert.match(app, /dock\.open = true/);
  assert.match(app, /累計練習.*activityStreak\.count/);
  assert.match(app, /recordActivityStreak\(\)/);
});
