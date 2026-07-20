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
const {
  buildSeededQuestions, newChallengeSeed, getPvpChallenges, recordPvpRun, pvpChallengeFor,
} = await import("../js/pvp.js");

const SAMPLE_QUESTIONS = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}` }));

test("同一個 seed 兩次呼叫產出完全相同的題目序列——PvP 公平性的核心保證", () => {
  const seed = 123456789;
  const first = buildSeededQuestions(seed, SAMPLE_QUESTIONS, 10);
  const second = buildSeededQuestions(seed, SAMPLE_QUESTIONS, 10);
  assert.deepEqual(first.map((q) => q.id), second.map((q) => q.id));
  assert.equal(first.length, 10);
});

test("不同 seed 通常會產出不同的題目順序", () => {
  const a = buildSeededQuestions(1, SAMPLE_QUESTIONS, 10).map((q) => q.id);
  const b = buildSeededQuestions(2, SAMPLE_QUESTIONS, 10).map((q) => q.id);
  assert.notDeepEqual(a, b);
});

test("newChallengeSeed 產出可重現的整數（供注入 random）", () => {
  const seed = newChallengeSeed(() => 0.5);
  assert.equal(seed, Math.floor(0.5 * 1e9));
});

test("PvP 戰績存檔：同 seed 多次挑戰，最佳分數只升不降", () => {
  localStorage.data.clear();
  recordPvpRun(999, "algebra", { totalDmg: 40, maxCombo: 3 });
  let record = pvpChallengeFor(999);
  assert.equal(record.bestDmg, 40);
  assert.equal(record.attempts, 1);

  recordPvpRun(999, "algebra", { totalDmg: 25, maxCombo: 2 });
  record = pvpChallengeFor(999);
  assert.equal(record.bestDmg, 40); // 只升不降
  assert.equal(record.lastDmg, 25); // 但最近一次的分數要更新
  assert.equal(record.attempts, 2);

  recordPvpRun(999, "algebra", { totalDmg: 60, maxCombo: 5 });
  record = pvpChallengeFor(999);
  assert.equal(record.bestDmg, 60);
  assert.equal(getPvpChallenges()["999"].attempts, 3);
});
