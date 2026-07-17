import { readFile, writeFile } from "node:fs/promises";

const categories = ["basicMastery", "conceptId", "errorDiagnosis", "contextApplication"];
const plans = {
  "fraction-mul": {
    difficulty: [
      ["easy", "medium", "easy", "medium", "hard", "hard"],
      ["easy", "easy", "medium", "medium", "medium", "hard"],
      ["easy", "easy", "easy", "medium", "hard", "hard"],
      ["easy", "easy", "easy", "medium", "hard", "hard"],
    ],
    paths: {
      basicMastery: ["fraction-multiply-rule", "reciprocal-divisor", "whole-number-factor", "fraction-multiply-rule", "mixed-number-conversion", "reciprocal-divisor"],
      errorDiagnosis: ["fraction-multiply-rule", "reciprocal-divisor", "whole-number-factor", "reciprocal-divisor", "mixed-number-conversion", "reciprocal-divisor"],
      contextApplication: ["fraction-multiply-rule", "reciprocal-divisor", "fraction-multiply-rule", "reciprocal-divisor", "mixed-number-conversion", "reciprocal-divisor"],
    },
  },
  "decimal-mul": {
    difficulty: [
      ["easy", "easy", "easy", "medium", "medium", "hard"],
      ["easy", "easy", "easy", "medium", "medium", "hard"],
      ["easy", "easy", "medium", "medium", "hard", "medium"],
      ["medium", "easy", "easy", "hard", "hard", "medium"],
    ],
    paths: {
      basicMastery: ["decimal-product-place", "scale-both-division", "decimal-product-place", "decimal-place-value", "scale-both-division", "scale-both-division"],
      errorDiagnosis: ["decimal-product-place", "scale-both-division", "decimal-product-place", "decimal-place-value", "scale-both-division", "estimation-scale"],
      contextApplication: ["decimal-product-place", "scale-both-division", "scale-both-division", "decimal-product-place", "scale-both-division", "scale-both-division"],
    },
  },
  "ratio-rate": {
    difficulty: [
      ["easy", "medium", "easy", "easy", "medium", "hard"],
      ["easy", "medium", "easy", "easy", "medium", "medium"],
      ["easy", "easy", "medium", "medium", "medium", "hard"],
      ["medium", "medium", "medium", "easy", "medium", "hard"],
    ],
    paths: {
      basicMastery: ["ratio-order", "proportional-scale", "ratio-simplification", "ratio-order", "ratio-simplification", "ratio-simplification"],
      errorDiagnosis: ["ratio-simplification", "ratio-order", "invalid-equivalent-operation", "ratio-order", "ratio-simplification", "proportional-scale"],
      contextApplication: ["ratio-order", "proportional-scale", "ratio-order", "proportional-scale", "proportional-scale", "proportional-scale"],
    },
  },
  "algebra-symbol": {
    difficulty: [
      ["easy", "easy", "easy", "easy", "hard", "hard"],
      ["easy", "easy", "easy", "easy", "medium", "medium"],
      ["easy", "medium", "medium", "easy", "medium", "hard"],
      ["easy", "easy", "medium", "easy", "hard", "medium"],
    ],
    paths: {
      basicMastery: ["substitution-operation-order", "combine-like-terms", "translate-operation-order", "substitution-operation-order", "distribute-sign", "substitution-operation-order"],
      errorDiagnosis: ["combine-like-terms", "substitution-operation-order", "translate-operation-order", "substitution-operation-order", "combine-like-terms", "distribute-sign"],
      contextApplication: ["translate-operation-order", "translate-operation-order", "translate-operation-order", "translate-operation-order", "distribute-sign", "translate-operation-order"],
    },
  },
  "linear-eq-1var": {
    difficulty: [
      ["easy", "medium", "easy", "easy", "hard", "hard"],
      ["easy", "easy", "easy", "medium", "medium", "medium"],
      ["easy", "easy", "easy", "easy", "hard", "hard"],
      ["medium", "medium", "medium", "easy", "hard", "hard"],
    ],
    paths: {
      basicMastery: ["coefficient-inverse-operation", "move-term-sign", "move-term-sign", "coefficient-inverse-operation", "move-term-sign", "coefficient-inverse-operation"],
      errorDiagnosis: ["move-term-sign", "coefficient-inverse-operation", "move-term-sign", "move-term-sign", "move-term-sign", "distribute-all-terms"],
      contextApplication: ["coefficient-inverse-operation", "coefficient-inverse-operation", "move-term-sign", "move-term-sign", "move-term-sign", "distribute-all-terms"],
    },
  },
};

for (const [nodeId, plan] of Object.entries(plans)) {
  const path = new URL(`../data/questions/${nodeId}.json`, import.meta.url);
  const bank = JSON.parse(await readFile(path, "utf8"));
  categories.forEach((category, categoryIndex) => {
    const questions = bank[category] ?? [];
    if (questions.length !== plan.difficulty[categoryIndex].length) {
      throw new Error(`${nodeId}.${category} 題數與標記計畫不符`);
    }
    questions.forEach((question, index) => {
      question.difficulty = plan.difficulty[categoryIndex][index];
      const errorPath = plan.paths[category]?.[index];
      if (errorPath) question.errorPath = errorPath;
    });
  });
  await writeFile(path, `${JSON.stringify(bank, null, 2)}\n`);
}
