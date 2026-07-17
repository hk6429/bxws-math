function pick(items, random) {
  if (items.length === 0) return null;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function difficultyWeight(difficulty, accuracy) {
  if (accuracy < 0.5) return { easy: 5, medium: 2, hard: 1 }[difficulty] ?? 1;
  if (accuracy >= 0.85) return { easy: 1, medium: 2, hard: 5 }[difficulty] ?? 1;
  return { easy: 2, medium: 4, hard: 2 }[difficulty] ?? 1;
}

function pickWeightedQuestion(questions, accuracy, random) {
  if (questions.length === 0) return null;
  const weighted = questions.map((question) => ({
    question,
    weight: difficultyWeight(question.difficulty, accuracy),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let target = random() * total;
  for (const item of weighted) {
    target -= item.weight;
    if (target < 0) return item.question;
  }
  return weighted.at(-1)?.question ?? null;
}

function pickDifficultySequence(questions, accuracy, limit, random) {
  const available = [...questions];
  const result = [];
  while (available.length > 0 && result.length < limit) {
    const question = pickWeightedQuestion(available, accuracy, random);
    if (!question) break;
    result.push(question);
    available.splice(available.indexOf(question), 1);
  }
  return result;
}

export function challengeWeight(attempts, challenge) {
  const matching = attempts.filter((attempt) => attempt.challenge === challenge);
  const lastTwo = matching.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((attempt) => attempt.correct)) return 0.5;
  if (matching.some((attempt) => !attempt.correct)) return 2;
  return 1;
}

function pickWeightedChallenge(challenges, attempts, random) {
  const weighted = challenges.map((challenge) => ({
    challenge,
    weight: challengeWeight(attempts, challenge),
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let target = random() * total;
  for (const item of weighted) {
    target -= item.weight;
    if (target < 0) return item.challenge;
  }
  return weighted.at(-1)?.challenge ?? null;
}

function masteryStars(accuracy) {
  if (accuracy === 1) return 3;
  if (accuracy >= 0.9) return 2;
  if (accuracy >= 0.8) return 1;
  return 0;
}

const DEFAULT_TIER_THRESHOLDS = {
  "elem-low": 0.75,
  "elem-mid": 0.75,
  "elem-high": 0.8,
  "jhs-g7": 0.8,
};

export const MASTER_TRIAL_TIERS = [
  { id: "bronze", name: "銅章試煉", questionCount: 10, passPct: 0.8, reward: { stardust: 10 }, requires: null },
  { id: "silver", name: "銀章試煉", questionCount: 15, passPct: 0.9, reward: { stardust: 25 }, requires: "bronze" },
  { id: "gold", name: "金章試煉", questionCount: 20, passPct: 1, reward: { stardust: 50 }, requires: "silver" },
];

export function masterTrialTierState(records = {}) {
  return MASTER_TRIAL_TIERS.map((tier) => ({
    ...tier,
    unlocked: tier.requires === null || records[tier.requires]?.cleared === true,
    cleared: records[tier.id]?.cleared === true,
    bestPct: records[tier.id]?.bestPct ?? 0,
  }));
}

export function settleMasterTrialTier(tierId, pct, records = {}, at = Date.now()) {
  const tier = MASTER_TRIAL_TIERS.find((item) => item.id === tierId);
  if (!tier) return { passed: false, rewardStardust: 0, records };
  const state = masterTrialTierState(records).find((item) => item.id === tierId);
  if (!state?.unlocked) return { passed: false, rewardStardust: 0, records };
  const prior = records[tierId] ?? {};
  const passed = pct >= tier.passPct;
  const firstClear = passed && prior.cleared !== true;
  return {
    passed,
    firstClear,
    rewardStardust: firstClear ? tier.reward.stardust : 0,
    records: {
      ...records,
      [tierId]: {
        ...prior,
        cleared: prior.cleared === true || passed,
        bestPct: Math.max(prior.bestPct ?? 0, pct),
        ...(firstClear ? { clearedAt: at } : {}),
      },
    },
  };
}

export function masteryThresholdFor(node = {}, threshold) {
  if (Number.isFinite(threshold)) return threshold;
  if (Number.isFinite(node.masteryThreshold)) return node.masteryThreshold;
  return DEFAULT_TIER_THRESHOLDS[node.tier] ?? 0.8;
}

export function nextStepRecommendation(stats = {}, wasMastered = false) {
  if (!wasMastered && stats.mastered) {
    return { kind: "just-mastered", label: "⚡ 同節點再練一輪" };
  }
  const unmet = stats.unmetConditions ?? [];
  if (!stats.mastered && unmet.length >= 1 && unmet.length <= 2) {
    const remaining = Math.max(1, Math.ceil(Number(stats.remainingPracticeCount) || 1));
    return { kind: "close", remaining, label: "再練一輪，很可能就完卷！" };
  }
  return { kind: "retry", label: "⚡ 同節點再練一輪" };
}

function expectedChallenges(attempts, node) {
  if (Array.isArray(node.challengeIds) && node.challengeIds.length > 0) {
    return [...new Set(node.challengeIds)];
  }
  const observed = attempts.map((attempt) => attempt.challenge).filter(Boolean);
  const seeds = [...observed, ...(node.gateChallenges ?? [])];
  const parsed = seeds.map((challenge) => /^(.*-)(\d+)$/.exec(challenge)).filter(Boolean);
  if (parsed.length === 0) return [];
  const prefix = parsed[0][1];
  if (!parsed.every((match) => match[1] === prefix)) return [...new Set(seeds)];
  const count = Math.max(...parsed.map((match) => Number(match[2])));
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

export function activeErrorLocks(attempts = []) {
  const relevant = attempts.filter((attempt) => attempt.prereqQuickCheck !== true);
  if (!relevant.some((attempt) => attempt.challenge)) return [];
  const window = relevant.slice(-10);
  const pathHits = new Map();
  for (const attempt of window) {
    if (attempt.correct || attempt.errorPath === undefined || attempt.errorPath === null) continue;
    if (!pathHits.has(attempt.errorPath)) pathHits.set(attempt.errorPath, []);
    pathHits.get(attempt.errorPath).push(attempt);
  }

  const locks = [];
  for (const [errorPath, hits] of pathHits) {
    if (hits.length < 2) continue;
    const secondHitIndex = relevant.indexOf(hits[1]);
    const remediation = relevant.slice(secondHitIndex + 1).filter((attempt) =>
      attempt.errorPath === errorPath && attempt.type === "error-diagnosis"
    );
    const cleared = remediation.length >= 2 && remediation.slice(-2).every((attempt) => attempt.correct);
    if (!cleared) locks.push(errorPath);
  }
  return locks;
}

export function prereqQuickCheckPassed(attempts = [], errorPath, prereqNodeId) {
  const matching = attempts.filter((attempt) =>
    attempt.prereqQuickCheck === true
      && attempt.remediationPath === errorPath
      && attempt.prereqNodeId === prereqNodeId
  );
  const latestByQuestion = new Map();
  for (const attempt of matching) latestByQuestion.set(attempt.questionId, attempt);
  const latest = [...latestByQuestion.values()].slice(-3);
  return latest.length === 3 && latest.every((attempt) => attempt.correct);
}

export function evaluateMastery(attempts = [], node = {}, threshold, alreadyMastered = false) {
  const resolvedThreshold = masteryThresholdFor(node, threshold);
  const scoredAttempts = attempts.filter((attempt) => attempt.prereqQuickCheck !== true);
  const window = scoredAttempts.slice(-10);
  const correctCount = window.filter((attempt) => attempt.correct).length;
  const accuracy = window.length === 0 ? 0 : correctCount / window.length;
  const hasChallengeData = scoredAttempts.some((attempt) => attempt.challenge);
  const gates = node.gateChallenges ?? [];
  const challenges = expectedChallenges(scoredAttempts, node);
  const latestByChallenge = new Map();
  for (const attempt of scoredAttempts) {
    if (attempt.challenge) latestByChallenge.set(attempt.challenge, attempt);
  }
  const missingChallenges = hasChallengeData
    ? challenges.filter((challenge) => !latestByChallenge.get(challenge)?.correct)
    : [];
  const challengeCorrect = challenges.filter((challenge) => latestByChallenge.get(challenge)?.correct).length;

  const windowTypes = new Set(window.map((attempt) => attempt.type).filter(Boolean));
  const conceptAndDiagnosisCorrect = window.filter((attempt) =>
    attempt.correct && (attempt.type === "concept-id" || attempt.type === "error-diagnosis")
  ).length;
  const lowShortcut = node.tier === "elem-low"
    && scoredAttempts.length >= 8
    && scoredAttempts.slice(-8).every((attempt) => attempt.correct);

  const errorLocks = activeErrorLocks(scoredAttempts);

  const conditions = {
    A: lowShortcut || (window.length === 10 && accuracy >= resolvedThreshold),
    B: lowShortcut || scoredAttempts.length >= 12,
    C: !hasChallengeData || (
      challengeCorrect >= Math.max(0, challenges.length - 1)
      && gates.every((gate) => latestByChallenge.get(gate)?.correct)
    ),
    D: ["basic-mastery", "concept-id", "error-diagnosis", "context-application"]
      .every((type) => windowTypes.has(type)) && conceptAndDiagnosisCorrect >= 3,
    E: !hasChallengeData || errorLocks.length === 0,
  };
  const clampPct = (value) => Math.max(0, Math.min(100, Math.round(value)));
  const requiredChallengeCount = Math.max(0, challenges.length - 1);
  const passedGateCount = gates.filter((gate) => latestByChallenge.get(gate)?.correct).length;
  const typeCoverage = windowTypes.size;
  const criteriaProgress = {
    A: {
      pct: lowShortcut ? 100 : clampPct(Math.min(window.length / 10, accuracy / resolvedThreshold) * 100),
      current: Math.round(accuracy * 100),
      target: Math.round(resolvedThreshold * 100),
      label: `答對率 ${Math.round(accuracy * 100)}%/${Math.round(resolvedThreshold * 100)}%（近 ${window.length}/10 題）`,
    },
    B: {
      pct: lowShortcut ? 100 : clampPct((scoredAttempts.length / 12) * 100),
      current: Math.min(scoredAttempts.length, 12),
      target: 12,
      label: `練習量 ${Math.min(scoredAttempts.length, 12)}/12 題`,
    },
    C: {
      pct: !hasChallengeData
        ? 100
        : clampPct(Math.min(
          requiredChallengeCount === 0 ? 1 : challengeCorrect / requiredChallengeCount,
          gates.length === 0 ? 1 : passedGateCount / gates.length
        ) * 100),
      current: challengeCorrect,
      target: requiredChallengeCount,
      gateCurrent: passedGateCount,
      gateTarget: gates.length,
      label: !hasChallengeData
        ? "挑戰覆蓋：舊題庫無挑戰編號，直接通過"
        : `挑戰覆蓋 ${challengeCorrect}/${requiredChallengeCount}・守門 ${passedGateCount}/${gates.length}`,
    },
    D: {
      pct: clampPct(Math.min(typeCoverage / 4, conceptAndDiagnosisCorrect / 3) * 100),
      current: conceptAndDiagnosisCorrect,
      target: 3,
      typeCurrent: Math.min(typeCoverage, 4),
      typeTarget: 4,
      label: `題型覆蓋 ${Math.min(typeCoverage, 4)}/4・概念與找錯答對 ${Math.min(conceptAndDiagnosisCorrect, 3)}/3`,
    },
    E: {
      pct: !hasChallengeData || errorLocks.length === 0 ? 100 : 0,
      current: errorLocks.length,
      target: 0,
      label: errorLocks.length === 0 ? "錯誤墨路已清空" : `待淨化錯誤墨路 ${errorLocks.length} 條`,
    },
  };
  const mastered = alreadyMastered || Object.values(conditions).every(Boolean);
  const unmetConditions = Object.entries(conditions)
    .filter(([, met]) => !met)
    .map(([condition]) => condition);
  const remainingPracticeCount = Math.max(0, 12 - scoredAttempts.length, 10 - window.length);
  const details = {
    A: `再多練 ${Math.max(1, 10 - window.length)} 題，最近 10 題答對率要接近 ${Math.round(resolvedThreshold * 100)}% 才會亮`,
    B: `再多寫 ${Math.max(0, 12 - scoredAttempts.length)} 題就集滿練習量囉`,
    C: missingChallenges.length > 0
      ? `再點亮這些挑戰：${missingChallenges.join("、")}`
      : "守門挑戰再答對一次，這處星光就會亮起來",
    D: "四種題型都再碰一碰，概念辨識和找錯題合計答對 3 題就好",
    E: `第 ${errorLocks.join("、")} 條墨路還沒亮，先做暖身題，再完成兩題找錯練習`,
  };
  const feedback = unmetConditions.length === 0
    ? "五處星光都已點亮，這卷神諭卷軸可以完卷。"
    : `還沒完卷：${unmetConditions.map((condition) => details[condition]).join("；")}。`;

  return {
    mastered,
    masteryPct: Math.round(accuracy * 100) / 100,
    stars: masteryStars(accuracy),
    conditions,
    criteriaProgress,
    unmetConditions,
    remainingPracticeCount,
    missingChallenges,
    feedback,
    errorLocks,
  };
}

export function prioritizeBasicWarmup(sequence = [], candidates = sequence, limit = sequence.length) {
  const target = Math.min(2, Math.max(0, limit));
  if (target === 0) return [];
  const result = [...sequence];
  const selected = result.filter((question) => question.type === "basic-mastery").slice(0, target);
  const selectedIds = new Set(selected.map((question) => question.id));
  const basicCandidates = candidates.filter((question) => (
    question.type === "basic-mastery" && !selectedIds.has(question.id)
  ));

  for (const candidate of basicCandidates) {
    if (selected.length >= target) break;
    const sameChallengeIndex = candidate.challenge
      ? result.findIndex((question) => (
        question.challenge === candidate.challenge && !selectedIds.has(question.id)
      ))
      : -1;
    if (sameChallengeIndex >= 0) result.splice(sameChallengeIndex, 1, candidate);
    else if (!result.some((question) => question.id === candidate.id)) result.push(candidate);
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  return [
    ...selected,
    ...result.filter((question) => !selectedIds.has(question.id)),
  ].slice(0, limit);
}

export function buildAdaptiveSequence(questions, attempts = [], limit = 8, random = Math.random, node = {}) {
  const recent = attempts.slice(-10);
  const accuracy = recent.length === 0
    ? 0
    : recent.filter((attempt) => attempt.correct).length / recent.length;
  const eligibleQuestions = node.tier === "elem-low" && accuracy < 0.6
    ? questions.filter((question) => question.type !== "error-diagnosis")
    : questions;
  const cooldownIds = new Set(attempts.slice(-6).map((attempt) => attempt.questionId));
  const warmupCandidates = eligibleQuestions.filter((question) => !cooldownIds.has(question.id));
  const challengeQuestions = eligibleQuestions.filter((question) => question.challenge);
  if (challengeQuestions.length === 0) {
    if (!eligibleQuestions.some((question) => question.difficulty)) {
      return prioritizeBasicWarmup(eligibleQuestions.slice(0, limit), warmupCandidates, limit);
    }
    return prioritizeBasicWarmup(
      pickDifficultySequence(eligibleQuestions, accuracy, limit, random),
      warmupCandidates,
      limit
    );
  }

  const attemptedChallenges = new Set(attempts.map((attempt) => attempt.challenge).filter(Boolean));
  const groups = new Map();
  for (const question of challengeQuestions) {
    if (!groups.has(question.challenge)) groups.set(question.challenge, []);
    groups.get(question.challenge).push(question);
  }

  const errorLocks = activeErrorLocks(attempts);
  const remediation = errorLocks.length === 0 ? [] : eligibleQuestions.filter((question) =>
    question.type === "error-diagnosis"
      && question.errorPath === errorLocks[0]
      && !cooldownIds.has(question.id)
  ).slice(0, 2).map((question) => ({ ...question, _remediation: true }));
  const queue = remediation.slice(0, limit);
  const queuedIds = new Set(queue.map((question) => question.id));
  for (const [challenge, variants] of groups) {
    if (attemptedChallenges.has(challenge)) continue;
    const candidates = variants.filter((question) =>
      !cooldownIds.has(question.id) && !queuedIds.has(question.id)
    );
    const question = pickWeightedQuestion(candidates, accuracy, random);
    if (question) {
      queue.push(question);
      queuedIds.add(question.id);
    }
    if (queue.length >= limit) break;
  }

  while (queue.length < limit) {
    const availableChallenges = [...groups].filter(([, variants]) =>
      variants.some((question) => !cooldownIds.has(question.id) && !queuedIds.has(question.id))
    ).map(([challenge]) => challenge);
    if (availableChallenges.length === 0) break;
    const challenge = pickWeightedChallenge(availableChallenges, attempts, random);
    const candidates = groups.get(challenge).filter((question) =>
      !cooldownIds.has(question.id) && !queuedIds.has(question.id)
    );
    const question = pickWeightedQuestion(candidates, accuracy, random);
    if (!question) break;
    queue.push(question);
    queuedIds.add(question.id);
  }
  return prioritizeBasicWarmup(queue, warmupCandidates, limit);
}
