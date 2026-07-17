import test from "node:test";
import assert from "node:assert/strict";
import { recordAnswer, getNodeStats } from "../js/scoreEngine.js";
import { isNodeMastered, nodeState } from "../js/schema.js";
import { runMigrations } from "../js/store.js";

function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

const node = { id: "n1", tier: "elem-mid", prereq: [], gateChallenges: ["1-2"] };
const tree = { masteryThreshold: 0.8, strands: [{ id: "s", name: "S", nodes: [node] }] };

test("recordAnswer 保存題目診斷欄位並以五條件寫入 mastered", () => {
  globalThis.localStorage = fakeStorage();
  const types = ["basic-mastery", "concept-id", "error-diagnosis", "context-application"];
  for (let index = 0; index < 12; index += 1) {
    recordAnswer("n1", {
      id: `q-${index}`,
      challenge: `1-${(index % 8) + 1}`,
      type: types[index % 4],
      errorPath: (index % 3) + 1,
    }, true, 100, node);
  }
  const stats = getNodeStats("n1");
  assert.equal(stats.mastered, true);
  assert.deepEqual(stats.conditions, { A: true, B: true, C: true, D: true, E: true });
  const saved = JSON.parse(localStorage.getItem("bxws:progress"));
  assert.deepEqual(saved.n1.attempts[0], {
    questionId: "q-0", challenge: "1-1", type: "basic-mastery", errorPath: 1,
    correct: true, msElapsed: 100, at: saved.n1.attempts[0].at,
  });
});

test("recordAnswer 保留題庫實際挑戰清單供比例式精熟裁決", () => {
  globalThis.localStorage = fakeStorage();
  const challengeIds = Array.from({ length: 9 }, (_, index) => `10-${index + 1}`);
  recordAnswer("fraction-same-denom", {
    id: "fraction-first",
    challenge: "10-1",
    type: "basic-mastery",
    _challengeIds: challengeIds,
  }, true, 100, { tier: "elem-mid", gateChallenges: ["10-7", "10-8"] });
  const saved = JSON.parse(localStorage.getItem("bxws:progress"));
  assert.deepEqual(saved["fraction-same-denom"].challengeIds, challengeIds);
});

test("舊存檔達門檻者一次性遷移，新增 prereq 不回鎖", () => {
  globalThis.localStorage = fakeStorage();
  localStorage.setItem("bxws:progress", JSON.stringify({
    old: { attempts: [], masteryPct: 0.8 },
    prereq: { attempts: [], masteryPct: 0 },
  }));
  const oldNode = { id: "old", prereq: ["prereq"] };
  const oldTree = { masteryThreshold: 0.8, strands: [{ id: "s", nodes: [oldNode, { id: "prereq", prereq: [] }] }] };
  runMigrations(0, oldTree);
  assert.equal(isNodeMastered("old", oldTree), true);
  assert.equal(nodeState(oldNode, oldTree), "mastered");
  const saved = JSON.parse(localStorage.getItem("bxws:progress"));
  assert.equal(saved.old.mastered, true);
  assert.equal(saved.old.masteryVersion, 2);
});

test("contentPending 節點顯示星墨未乾且不可進測驗", () => {
  globalThis.localStorage = fakeStorage();
  const pending = { id: "pending", prereq: [], contentPending: true };
  assert.equal(nodeState(pending, { masteryThreshold: 0.8, strands: [] }), "content-pending");
});
