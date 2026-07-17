import test from "node:test";
import assert from "node:assert/strict";

const now = Date.now();
const state = {
  q1: { box: 1, lastSeen: now - 86400000, nodeId: "n1" },
  q2: { box: 5, lastSeen: now, nodeId: "n2" },
};
globalThis.localStorage = {
  getItem(key) { return key === "bxws:leitner" ? JSON.stringify(state) : null; },
  setItem() {},
};

const fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(url);
  return { ok: true, status: 200, json: async () => ({ basicMastery: [{ id: "q1" }], conceptId: [], errorDiagnosis: [], contextApplication: [] }) };
};

const { buildReviewSession, countDueReviews } = await import("../js/quiz-loader.js");

test("首頁到期題計數只讀本機 Leitner，完全不 fetch 題庫", async () => {
  assert.equal(await countDueReviews(["n1", "n2"]), 1);
  assert.deepEqual(fetched, []);
});

test("複習場只按需 fetch 含到期題的節點", async () => {
  const queue = await buildReviewSession(["n1", "n2"], 6);
  assert.deepEqual(fetched, ["data/questions/n1.json"]);
  assert.equal(queue[0]._nodeId, "n1");
});
