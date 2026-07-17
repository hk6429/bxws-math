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
    headline: "導師把咒卷都收好了，今天先點亮 6 頁就好",
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
  assert.match(block, /startQuizWithStrategy\(recommended, lastStrategy\)/);
  assert.match(app, /textContent = "今日第一步"/);
});
