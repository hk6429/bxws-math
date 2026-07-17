import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdaptiveSequence,
  challengeWeight,
  evaluateMastery,
  masteryThresholdFor,
} from "../js/mastery-engine.js";
import { buildSession } from "../js/quiz-loader.js";

function challengeBank() {
  return Array.from({ length: 8 }, (_, challengeIndex) =>
    Array.from({ length: 3 }, (_, variant) => ({
      id: `q-${challengeIndex + 1}-${variant + 1}`,
      challenge: `1-${challengeIndex + 1}`,
      type: ["basic-mastery", "concept-id", "error-diagnosis", "context-application"][challengeIndex % 4],
    }))
  ).flat();
}

test("首輪診斷依挑戰編號各出一題", () => {
  const queue = buildAdaptiveSequence(challengeBank(), [], 8, () => 0);
  assert.deepEqual(queue.map((question) => question.challenge), [
    "1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8",
  ]);
  assert.equal(new Set(queue.map((question) => question.id)).size, 8);
});

test("加權抽題依錯題與連對調整挑戰權重", () => {
  const attempts = [
    { questionId: "a", challenge: "1-1", correct: false },
    { questionId: "b", challenge: "1-2", correct: true },
    { questionId: "c", challenge: "1-2", correct: true },
  ];
  assert.equal(challengeWeight(attempts, "1-1"), 2);
  assert.equal(challengeWeight(attempts, "1-2"), 0.5);
  assert.equal(challengeWeight(attempts, "1-3"), 1);
});

test("加權階段不抽最近 6 題的同一題 id", () => {
  const bank = challengeBank();
  const scanned = Array.from({ length: 8 }, (_, index) => ({
    questionId: `q-${index + 1}-1`, challenge: `1-${index + 1}`, correct: index !== 0,
  }));
  const recentIds = new Set(scanned.slice(-6).map((attempt) => attempt.questionId));
  const queue = buildAdaptiveSequence(bank, scanned, 8, () => 0);
  assert.equal(queue.length, 8);
  assert.ok(queue.every((question) => !recentIds.has(question.id)));
});

function masteredAttempts(count = 12) {
  const types = ["basic-mastery", "concept-id", "error-diagnosis", "context-application"];
  return Array.from({ length: count }, (_, index) => ({
    questionId: `a-${index}`,
    challenge: `1-${(index % 8) + 1}`,
    type: types[index % types.length],
    correct: true,
  }));
}

function nineChallengeAttempts(wrongChallenges = []) {
  const types = ["basic-mastery", "concept-id", "error-diagnosis", "context-application"];
  const wrong = new Set(wrongChallenges);
  return [
    ...Array.from({ length: 9 }, (_, index) => ({
      questionId: `nine-${index + 1}`,
      challenge: `10-${index + 1}`,
      type: types[index % types.length],
      correct: !wrong.has(`10-${index + 1}`),
    })),
    { questionId: "nine-repeat-1", challenge: "10-1", type: "concept-id", correct: true },
    { questionId: "nine-repeat-2", challenge: "10-2", type: "error-diagnosis", correct: true },
    { questionId: "nine-repeat-3", challenge: "10-3", type: "context-application", correct: true },
  ];
}

test("精熟判定同時通過 A–E 才 mastered", () => {
  const result = evaluateMastery(masteredAttempts(), {
    tier: "elem-mid",
    gateChallenges: ["1-2", "1-6"],
  });
  assert.equal(result.mastered, true);
  assert.deepEqual(result.conditions, { A: true, B: true, C: true, D: true, E: true });
  assert.deepEqual(result.missingChallenges, []);
  assert.equal(result.stars, 3);
});

test("9 挑戰節點最近只對 7/9 時不符合條件 C", () => {
  const result = evaluateMastery(nineChallengeAttempts(["10-8", "10-9"]), {
    tier: "elem-mid",
    gateChallenges: ["10-1"],
    challengeIds: Array.from({ length: 9 }, (_, index) => `10-${index + 1}`),
  });
  assert.equal(result.conditions.C, false);
  assert.equal(result.mastered, false);
});

test("9 挑戰節點最近對 8/9 且守門正確時判定精熟", () => {
  const result = evaluateMastery(nineChallengeAttempts(["10-9"]), {
    tier: "elem-mid",
    gateChallenges: ["10-1"],
    challengeIds: Array.from({ length: 9 }, (_, index) => `10-${index + 1}`),
  });
  assert.equal(result.conditions.C, true);
  assert.equal(result.mastered, true);
});

test("9 挑戰節點即使對 8/9，守門錯誤仍不精熟", () => {
  const result = evaluateMastery(nineChallengeAttempts(["10-9"]), {
    tier: "elem-mid",
    gateChallenges: ["10-9"],
    challengeIds: Array.from({ length: 9 }, (_, index) => `10-${index + 1}`),
  });
  assert.equal(result.conditions.C, false);
  assert.equal(result.mastered, false);
});

test("未滿樣本或挑戰覆蓋時不精熟，回饋指出缺項挑戰", () => {
  const attempts = masteredAttempts(10).filter((attempt) => attempt.challenge !== "1-8");
  const result = evaluateMastery(attempts, { tier: "elem-mid", gateChallenges: ["1-8"] });
  assert.equal(result.mastered, false);
  assert.equal(result.conditions.B, false);
  assert.equal(result.conditions.C, false);
  assert.ok(result.missingChallenges.includes("1-8"));
  assert.match(result.feedback, /1-8/);
  assert.deepEqual(result.unmetConditions, ["A", "B", "C"]);
  for (const condition of result.unmetConditions) assert.match(result.feedback, new RegExp(`${condition} `));
});

test("精熟門檻可依 tier 調整並保留明確參數覆寫", () => {
  assert.equal(masteryThresholdFor({ tier: "elem-low" }), 0.75);
  assert.equal(masteryThresholdFor({ tier: "elem-mid" }), 0.75);
  assert.equal(masteryThresholdFor({ tier: "jhs-g7" }), 0.8);
  assert.equal(masteryThresholdFor({ tier: "elem-low", masteryThreshold: 0.7 }), 0.7);
  assert.equal(masteryThresholdFor({ tier: "elem-low" }, 0.9), 0.9);
});

test("舊題無 challenge 時只跑 A＋B＋D，可維持相容", () => {
  const attempts = masteredAttempts().map(({ challenge, ...attempt }) => attempt);
  const result = evaluateMastery(attempts, { tier: "elem-high" });
  assert.equal(result.mastered, true);
  assert.equal(result.conditions.C, true);
  assert.equal(result.conditions.E, true);

  const oneType = attempts.map((attempt) => ({ ...attempt, type: "basic-mastery" }));
  assert.equal(evaluateMastery(oneType, { tier: "elem-high" }).conditions.D, false);
});

test("elem-low 連對 8 題可提前精熟，正確率未達 0.6 前不解鎖 ED", () => {
  const lowAttempts = masteredAttempts(8);
  assert.equal(evaluateMastery(lowAttempts, { tier: "elem-low" }).mastered, true);

  const weakAttempts = Array.from({ length: 5 }, (_, index) => ({
    questionId: `old-${index}`, correct: index < 2,
  }));
  const queue = buildAdaptiveSequence(challengeBank(), weakAttempts, 8, () => 0, { tier: "elem-low" });
  assert.ok(queue.every((question) => question.type !== "error-diagnosis"));
});

test("錯誤路徑命中兩次後，須完成同路徑兩題 ED 變式才放行", () => {
  const types = ["basic-mastery", "concept-id", "error-diagnosis", "context-application"];
  const attempts = [
    ...Array.from({ length: 6 }, (_, index) => ({
      questionId: `p-${index}`, challenge: `1-${index + 3}`, type: types[index % 4], correct: true,
    })),
    { questionId: "wrong-1", challenge: "1-1", type: "basic-mastery", errorPath: 1, correct: false },
    { questionId: "wrong-2", challenge: "1-2", type: "context-application", errorPath: 1, correct: false },
    { questionId: "p-8", challenge: "1-3", type: "concept-id", correct: true },
    { questionId: "p-9", challenge: "1-4", type: "error-diagnosis", correct: true },
    { questionId: "recover-1", challenge: "1-1", type: "concept-id", correct: true },
    { questionId: "recover-2", challenge: "1-2", type: "error-diagnosis", correct: true },
  ];
  const locked = evaluateMastery(attempts, { tier: "elem-mid" });
  assert.equal(locked.conditions.E, false);
  assert.deepEqual(locked.errorLocks, [1]);

  const remediated = evaluateMastery([
    ...attempts,
    { questionId: "ed-fix-1", challenge: "1-1", type: "error-diagnosis", errorPath: 1, correct: true },
    { questionId: "ed-fix-2", challenge: "1-2", type: "error-diagnosis", errorPath: 1, correct: true },
  ], { tier: "elem-mid" });
  assert.equal(remediated.conditions.E, true);
});

test("無 challenge 的舊題庫維持原順序", () => {
  const legacy = [{ id: "l1" }, { id: "l2" }, { id: "l3" }];
  assert.deepEqual(buildAdaptiveSequence(legacy, [], 2), legacy.slice(0, 2));
});

test("buildSession 實際接上挑戰輪替引擎", async () => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
  const questions = challengeBank();
  const bank = {
    basicMastery: questions.filter((question) => question.type === "basic-mastery"),
    conceptId: questions.filter((question) => question.type === "concept-id"),
    errorDiagnosis: questions.filter((question) => question.type === "error-diagnosis"),
    contextApplication: questions.filter((question) => question.type === "context-application"),
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => bank });
  const queue = await buildSession("adaptive-node", 8, "slow", [], { tier: "elem-mid" });
  assert.equal(new Set(queue.map((question) => question.challenge)).size, 8);
});

test("無 prereq 的錯誤路徑鎖仍優先插入兩題同路徑 ED 變式", () => {
  const bank = [
    ...challengeBank(),
    { id: "path-2-ed-1", challenge: "1-3", type: "error-diagnosis", errorPath: 2 },
    { id: "path-2-ed-2", challenge: "1-4", type: "error-diagnosis", errorPath: 2 },
  ];
  const attempts = [
    { questionId: "wrong-a", challenge: "1-1", type: "basic-mastery", errorPath: 2, correct: false },
    { questionId: "wrong-b", challenge: "1-2", type: "context-application", errorPath: 2, correct: false },
  ];
  const queue = buildAdaptiveSequence(bank, attempts, 8, () => 0, { tier: "elem-mid" });
  assert.deepEqual(queue.slice(0, 2).map((question) => question.id), ["path-2-ed-1", "path-2-ed-2"]);
});

test("有 prereq 的錯誤路徑鎖先做三題先備 BM，全對後才恢復原節點 ED", async () => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
  const attempts = [
    { questionId: "wrong-a", challenge: "1-1", type: "basic-mastery", errorPath: 2, correct: false },
    { questionId: "wrong-b", challenge: "1-2", type: "context-application", errorPath: 2, correct: false },
  ];
  map.set("bxws:progress", JSON.stringify({ "locked-node": { attempts } }));
  const currentBank = {
    basicMastery: [], conceptId: [], contextApplication: [],
    errorDiagnosis: [
      { id: "current-ed-1", challenge: "1-3", type: "error-diagnosis", errorPath: 2 },
      { id: "current-ed-2", challenge: "1-4", type: "error-diagnosis", errorPath: 2 },
    ],
  };
  const prereqBank = {
    basicMastery: [1, 2, 3, 4].map((n) => ({ id: `prereq-bm-${n}`, type: "basic-mastery" })),
  };
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => url.includes("prereq-node") ? prereqBank : currentBank,
  });

  const node = { tier: "elem-mid", prereq: ["prereq-node"] };
  const quickCheck = await buildSession("locked-node", 8, "slow", [], node);
  assert.deepEqual(quickCheck.map((question) => question.id), ["prereq-bm-1", "prereq-bm-2", "prereq-bm-3"]);
  assert.ok(quickCheck.every((question) => question._prereqQuickCheck));

  const passed = quickCheck.map((question) => ({
    questionId: question.id,
    type: question.type,
    correct: true,
    prereqQuickCheck: true,
    prereqNodeId: "prereq-node",
    remediationPath: 2,
  }));
  map.set("bxws:progress", JSON.stringify({ "locked-node": { attempts: [...attempts, ...passed] } }));
  const resumed = await buildSession("locked-node", 8, "slow", [], node);
  assert.deepEqual(resumed.slice(0, 2).map((question) => question.id), ["current-ed-1", "current-ed-2"]);
});

test("先備快檢不灌高原節點精熟率，也不會把原錯誤鎖推出視窗", () => {
  const attempts = [
    { questionId: "wrong-a", challenge: "1-1", type: "basic-mastery", errorPath: 2, correct: false },
    { questionId: "wrong-b", challenge: "1-2", type: "context-application", errorPath: 2, correct: false },
    ...Array.from({ length: 12 }, (_, index) => ({
      questionId: `quick-${index}`,
      type: "basic-mastery",
      correct: true,
      prereqQuickCheck: true,
      prereqNodeId: "prereq-node",
      remediationPath: 2,
    })),
  ];
  const result = evaluateMastery(attempts, { tier: "elem-mid" });
  assert.equal(result.masteryPct, 0);
  assert.equal(result.conditions.B, false);
  assert.deepEqual(result.errorLocks, [2]);
});
