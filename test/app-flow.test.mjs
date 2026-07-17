import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { masteryEncouragement } from "../js/quiz-ui.js";

test("結算頁保留星圖出口，並可用同一策略直達重練", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /✦ 神諭卷軸完卷！/);
  assert.match(app, /nextStep\.label/);
  assert.match(app, /startQuizWithStrategy\(session\.node, session\.strategy/);
  assert.match(app, /回神話星圖/);
});

test("賢者試煉與每週神殿盃結算可直接再挑戰，戰鬥模式不共用重玩", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const finish = app.slice(app.indexOf("function finishSession"), app.indexOf("function roundStars"));
  assert.match(finish, /再挑戰一次賢者試煉/);
  assert.match(finish, /startMasterTrial/);
  assert.match(finish, /再挑戰一次本週神殿盃/);
  assert.match(finish, /startWeeklySession/);
  assert.doesNotMatch(finish, /再挑戰一次同學挑戰/);
  assert.match(finish, /q-next-secondary/);
});

test("一般結算提供可讀文字成果分享，並在不支援原生分享時複製", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const summary = app.slice(app.indexOf("function makeSummary"), app.indexOf("let challengeCatalogPromise"));
  assert.match(summary, /分享這次成果/);
  assert.match(summary, /navigator\.share/);
  assert.match(summary, /navigator\.clipboard\.writeText\(shareText\)/);
  assert.match(summary, /答對了.*roundCorrect.*roundTotal/);
  assert.match(summary, /連詠.*maxStreak/);
});

test("測驗進行中顯示 A–E 五條精熟進度", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /function renderMasteryProgress/);
  assert.match(app, /criteriaProgress/);
  assert.match(app, /精熟進度/);
  assert.match(app, /Object\.entries\(criteriaProgress\)/);
  assert.match(app, /criterion\.label/);
  assert.match(app, /<meter min="0" max="100"/);
});

test("A–E 每條進度保留原指標並加上依百分比變化的白話鼓勵", async () => {
  assert.equal(masteryEncouragement(100), "這個技能你已經很熟了！");
  assert.equal(masteryEncouragement(80), "再加把勁就滿分！");
  assert.match(masteryEncouragement(50), /一半/);
  assert.match(masteryEncouragement(0), /第一題/);
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /criterion\.label/);
  assert.match(app, /masteryEncouragement\(criterion\.pct\)/);
  assert.match(app, /mastery-encouragement/);
});

test("全精熟後顯示銅銀金試煉狀態並在首通發放星屑", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /masterTrialTierState/);
  assert.match(app, /startMasterTrial\(tier\.id\)/);
  assert.match(app, /settleMasterTrialTier/);
  assert.match(app, /addStardust\(trialSettlement\.rewardStardust\)/);
});
