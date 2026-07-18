import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cardRevealClass, streakMilestone } from "../js/quiz-ui.js";

test("連詠 3、5、8 題才觸發逐級慶祝里程碑", () => {
  assert.equal(streakMilestone(2), null);
  assert.equal(streakMilestone(3), 3);
  assert.equal(streakMilestone(4), null);
  assert.equal(streakMilestone(5), 5);
  assert.equal(streakMilestone(8), 8);
  assert.equal(streakMilestone(9), null);
});

test("答對音效預設開啟且答對分支確實觸發，使用者仍可手動關閉", async () => {
  const [app, sfx] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/sfx.js", import.meta.url), "utf8"),
  ]);
  assert.match(sfx, /store\.read\("sfxOn", true\)/);
  assert.match(app, /if \(isCorrect\)[\s\S]*sfx\.correct\(session\.streak\)/);
  assert.match(app, /setSfxOn\(!isSfxOn\(\)\)/);
  assert.match(app, /showStreakMilestone\(session\.streak\)/);
});

test("神話印記與神諭卷軸解鎖會立即依稀有度開卡", async () => {
  assert.equal(cardRevealClass("普通"), "reveal-common");
  assert.equal(cardRevealClass("稀有"), "reveal-rare");
  assert.equal(cardRevealClass("傳說"), "reveal-legendary");
  const [app, css] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /showCardReveal\(reward\.stamp/);
  assert.match(app, /newDrops\.forEach[\s\S]*showCardReveal/);
  assert.match(css, /\.card-reveal-overlay/);
  assert.match(css, /\.reveal-common/);
  assert.match(css, /\.reveal-rare/);
  assert.match(css, /\.reveal-legendary/);
});
