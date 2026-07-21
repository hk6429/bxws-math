import assert from "node:assert/strict";
import {
  activeErrorLocks,
  evaluateMastery,
  masteryThresholdFor,
  prereqQuickCheckPassed,
} from "../js/mastery-engine.js";

const locked = [
  { questionId: "w1", challenge: "1-1", errorPath: 1, correct: false },
  { questionId: "w2", challenge: "1-2", errorPath: 1, correct: false },
];
assert.deepEqual(activeErrorLocks(locked), [1]);
const quick = [1, 2, 3].map((n) => ({
  questionId: `p${n}`, correct: true, prereqQuickCheck: true,
  prereqNodeId: "prereq", remediationPath: 1,
}));
assert.equal(prereqQuickCheckPassed([...locked, ...quick], 1, "prereq"), true);
assert.equal(prereqQuickCheckPassed([...locked, ...quick.slice(0, 2)], 1, "prereq"), false);

assert.equal(masteryThresholdFor({ tier: "elem-low" }), 0.75);
assert.equal(masteryThresholdFor({ tier: "elem-mid" }), 0.75);
assert.equal(masteryThresholdFor({ tier: "jhs-g7" }), 0.8);
const nearMiss = evaluateMastery([
  { questionId: "near-1", challenge: "1-1", type: "basic-mastery", correct: false },
], { tier: "elem-mid", gateChallenges: ["1-1"] });
assert.deepEqual(nearMiss.unmetConditions, ["A", "B", "C", "D"]);
assert.deepEqual(Object.keys(nearMiss.criteriaProgress), ["A", "B", "C", "D", "E"]);
assert.match(nearMiss.feedback, /答對率要接近 75%/);
assert.match(nearMiss.feedback, /練習量/);
assert.match(nearMiss.feedback, /再點亮這些挑戰：1-1/);
assert.match(nearMiss.feedback, /四種題型/);
assert.doesNotMatch(nearMiss.feedback, /A 視窗|B 樣本|C 挑戰覆蓋|D 題型|E 錯誤/);
console.log("OK B/C: prereq quick-check gate, tier thresholds, A-E progress, and plain-language feedback verified");
