import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateMastery } from "../js/mastery-engine.js";
import { recordAnswer } from "../js/scoreEngine.js";
import { questionAccuracy } from "../js/challenge.js";
import { buildWeeklySession } from "../js/weekly.js";
import { loadQuestionBank } from "../js/quiz-loader.js";
import { loadSkillTree } from "../js/schema.js";
import { isStorageBroken, runMigrations, store } from "../js/store.js";

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

test("JSON 載入失敗不污染快取，批次題庫只保留成功結果", async () => {
  let treeCalls = 0;
  globalThis.fetch = async (url) => {
    if (url === "data/skilltree.json") {
      treeCalls += 1;
      if (treeCalls === 1) return { ok: false, status: 503 };
      return { ok: true, status: 200, json: async () => ({ strands: [] }) };
    }
    if (url.includes("bad-bank")) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        basicMastery: [{ id: "good-q" }], conceptId: [], errorDiagnosis: [], contextApplication: [],
      }),
    };
  };
  await assert.rejects(loadSkillTree(), /載入失敗/);
  assert.deepEqual(await loadSkillTree(), { strands: [] });
  await assert.rejects(loadQuestionBank("bad-bank"), /載入失敗/);
  const weekly = await buildWeeklySession(["bad-bank", "good-bank"], 10);
  assert.deepEqual(weekly.map((question) => question.id), ["good-q"]);
});

test("recordAnswer 只留最近 50 筆，累計計數與精熟裁決不變", () => {
  globalThis.localStorage = fakeStorage();
  const node = { id: "trim-node", tier: "elem-mid", prereq: [] };
  const types = ["basic-mastery", "concept-id", "error-diagnosis", "context-application"];
  const fullAttempts = [];
  for (let index = 0; index < 60; index += 1) {
    const question = { id: `q-${index % 4}`, type: types[index % 4] };
    fullAttempts.push({ questionId: question.id, type: question.type, correct: true, msElapsed: 50, at: index });
    recordAnswer(node.id, question, true, 50, node);
  }
  const saved = JSON.parse(localStorage.getItem("bxws:progress"))[node.id];
  const fullEvaluation = evaluateMastery(fullAttempts, node);
  assert.equal(saved.attempts.length, 50);
  assert.equal(saved.totalAttempts, 60);
  assert.equal(saved.correctAttempts, 60);
  assert.equal(saved.mastered, fullEvaluation.mastered);
  assert.deepEqual(saved.conditions, fullEvaluation.conditions);
  assert.equal(questionAccuracy("q-0", { [node.id]: saved }), 1);
});

test("啟動遷移合併舊稀有章並清掉過期 daily 與非本週 weekly", () => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const currentWeek = `${date.getUTCFullYear()}W${String(week).padStart(2, "0")}`;
  const storage = fakeStorage({
    "bxws:progress": JSON.stringify({ old: { attempts: [], masteryPct: 0.8 } }),
    "bxws:rareStamps": JSON.stringify(["stamp-old"]),
    "bxws:rareStampBook": JSON.stringify({ "stamp-new": { at: 1 } }),
    "bxws:daily:2000-01-01": "{}",
    [`bxws:daily:${today}`]: "{}",
    "bxws:weekly:2000W01": "{}",
    [`bxws:weekly:${currentWeek}`]: "{}",
  });
  runMigrations(0, { masteryThreshold: 0.8, strands: [] }, storage);
  const book = JSON.parse(storage.getItem("bxws:rareStampBook"));
  assert.ok(book["stamp-old"]);
  assert.ok(book["stamp-new"]);
  assert.equal(storage.getItem("bxws:rareStamps"), null);
  assert.equal(storage.getItem("bxws:daily:2000-01-01"), null);
  assert.equal(storage.getItem(`bxws:daily:${today}`), "{}");
  assert.equal(storage.getItem("bxws:weekly:2000W01"), null);
  assert.equal(storage.getItem(`bxws:weekly:${currentWeek}`), "{}");
  assert.equal(storage.getItem("bxws:schemaVersion"), "2");
});

test("store.write 遇到 quota 失敗回傳 false 並升起 storageBroken", () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
  };
  assert.equal(store.write("progress", {}), false);
  assert.equal(isStorageBroken(), true);
});

test("Wave 2 無障礙契約與 CSS 尾端追加規則齊全", async () => {
  const [html, css, app, quizUi, skilltreeUi, weekly, challenge] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/quiz-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../js/skilltree-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../js/weekly.js", import.meta.url), "utf8"),
    readFile(new URL("../js/challenge.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="quiz-live" role="status" aria-live="polite"/);
  assert.equal((html.match(/<section id="view-/g) ?? []).length, 7);
  assert.equal((html.match(/<h2[^>]*tabindex="-1"/g) ?? []).length, 7);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(html, /role="progressbar"/);
  assert.ok(css.lastIndexOf("Wave 2：無障礙工具") > css.lastIndexOf("2026-07 行動裝置"));
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.halo-ripple/);
  assert.match(css, /\.q-stem \{ line-height: 1\.7; \}/);
  assert.match(css, /\.q-explain \{ font-style: normal; \}/);
  assert.match(app, /aria-current/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /已滿 5 題，取消一題才能改選/);
  assert.match(quizUi, /q-result-mark/);
  assert.match(skilltreeUi, /tabindex: "0"/);
  assert.doesNotMatch(weekly, /function flattenBank/);
  assert.doesNotMatch(challenge, /function flattenBank/);
});
