import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { insertMentorCoachingQuestion, mentorStrategyLine } from "../js/quiz-loader.js";
import { pickQuote, QUOTES } from "../js/quotes.js";

test("三連錯介入會把一題基本精通題插到下一題", () => {
  const queue = [{ id: "hard-1", type: "error-diagnosis" }, { id: "hard-2", type: "context-application" }];
  const inserted = insertMentorCoachingQuestion(queue, 0, [
    { id: "basic-1", type: "basic-mastery", stem: "先暖身" },
  ], "別急，我們先喘口氣，練一題簡單的", () => 0);

  assert.equal(inserted, true);
  assert.equal(queue[1].id, "basic-1");
  assert.equal(queue[1]._mentorCoaching, true);
  assert.equal(queue[1]._mentorLine, "別急，我們先喘口氣，練一題簡單的");
});

test("三連錯導師只取觸發技能的基礎題，並引用題庫現有解題步驟", () => {
  const queue = [{ id: "hard", _nodeId: "fraction-mul", type: "error-diagnosis" }];
  const inserted = insertMentorCoachingQuestion(queue, 0, [
    { id: "other", _nodeId: "decimal-mul", type: "basic-mastery", explanation: "小數點步驟" },
    { id: "fraction", _nodeId: "fraction-mul", type: "basic-mastery", explanation: "分子乘分子，分母乘分母，再約分" },
  ], "加油", () => 0, { nodeId: "fraction-mul", nodeName: "分數乘除" });

  assert.equal(inserted, true);
  assert.equal(queue[1].id, "fraction");
  assert.equal(queue[1]._mentorLine, "分數乘除：先抓關鍵步驟——分子乘分子，分母乘分母，再約分");
  assert.equal(mentorStrategyLine("分數乘除", queue[1], "加油"), queue[1]._mentorLine);
});

test("每個已上線技能的基礎題都有可供導師引用的數學策略", async () => {
  const tree = JSON.parse(await readFile(new URL("../data/skilltree.json", import.meta.url), "utf8"));
  const liveNodes = tree.strands.flatMap((strand) => strand.nodes).filter((node) => !node.contentPending);
  for (const node of liveNodes) {
    const bank = JSON.parse(await readFile(new URL(`../data/questions/${node.id}.json`, import.meta.url), "utf8"));
    assert.ok(bank.basicMastery.length > 0, node.id);
    assert.ok(bank.basicMastery.every((question) => question.explanation?.trim()), node.id);
  }
});

test("零星或一星結算一定取用安慰語錄", () => {
  const originalRandom = Math.random;
  Math.random = () => 0.99;
  try {
    const zeroStar = pickQuote(0, "davinci");
    const oneStar = pickQuote(1, "davinci");
    assert.ok(zeroStar);
    assert.ok(oneStar);
    assert.ok(QUOTES.comfort.includes(zeroStar));
    assert.ok(QUOTES.comfort.includes(oneStar));
  } finally {
    Math.random = originalRandom;
  }
});

test("作答流程在三連錯後插入導師陪練，且不持久化連錯計數", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /session\.consecutiveWrong >= 3/);
  assert.match(app, /insertMentorCoachingQuestion/);
  assert.match(app, /mentor-coaching-line/);
  assert.match(app, /mentor-coaching-question/);
  assert.match(css, /\.mentor-coaching-line\s*\{[\s\S]*linear-gradient/);
  assert.match(css, /\.mentor-coaching-question\s*\{[\s\S]*animation:/);
  assert.match(css, /@keyframes mentor-question-arrive[\s\S]*opacity:\s*0[\s\S]*transform:/);
  assert.match(app, /const \{ qStartAt, consecutiveWrong, mentorPool, \.\.\.rest \} = session/);
});
