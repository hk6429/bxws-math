function pick(items, random) {
  if (items.length === 0) return null;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
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
  if (!attempts.some((attempt) => attempt.challenge)) return [];
  const window = attempts.slice(-10);
  const pathHits = new Map();
  for (const attempt of window) {
    if (attempt.correct || attempt.errorPath === undefined || attempt.errorPath === null) continue;
    if (!pathHits.has(attempt.errorPath)) pathHits.set(attempt.errorPath, []);
    pathHits.get(attempt.errorPath).push(attempt);
  }

  const locks = [];
  for (const [errorPath, hits] of pathHits) {
    if (hits.length < 2) continue;
    const secondHitIndex = attempts.indexOf(hits[1]);
    const remediation = attempts.slice(secondHitIndex + 1).filter((attempt) =>
      attempt.errorPath === errorPath && attempt.type === "error-diagnosis"
    );
    const cleared = remediation.length >= 2 && remediation.slice(-2).every((attempt) => attempt.correct);
    if (!cleared) locks.push(errorPath);
  }
  return locks;
}

export function evaluateMastery(attempts = [], node = {}, threshold = 0.8, alreadyMastered = false) {
  const window = attempts.slice(-10);
  const correctCount = window.filter((attempt) => attempt.correct).length;
  const accuracy = window.length === 0 ? 0 : correctCount / window.length;
  const hasChallengeData = attempts.some((attempt) => attempt.challenge);
  const gates = node.gateChallenges ?? [];
  const challenges = expectedChallenges(attempts, node);
  const latestByChallenge = new Map();
  for (const attempt of attempts) {
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
    && attempts.length >= 8
    && attempts.slice(-8).every((attempt) => attempt.correct);

  const errorLocks = activeErrorLocks(attempts);

  const conditions = {
    A: lowShortcut || (window.length === 10 && accuracy >= threshold),
    B: lowShortcut || attempts.length >= 12,
    C: !hasChallengeData || (
      challengeCorrect >= Math.max(0, challenges.length - 1)
      && gates.every((gate) => latestByChallenge.get(gate)?.correct)
    ),
    D: ["basic-mastery", "concept-id", "error-diagnosis", "context-application"]
      .every((type) => windowTypes.has(type)) && conceptAndDiagnosisCorrect >= 3,
    E: !hasChallengeData || errorLocks.length === 0,
  };
  const mastered = alreadyMastered || Object.values(conditions).every(Boolean);
  const feedback = errorLocks.length > 0
    ? `第 ${errorLocks.join("、")} 條墨路連續暈開，補對兩題錯誤診斷變式即可放行。`
    : missingChallenges.length > 0
    ? `星圖還差 ${missingChallenges.join("、")} 挑戰的墨跡，補亮後就更接近完稿。`
    : conditions.D
      ? "墨跡正在聚成完整星圖，再穩住幾筆就能完稿。"
      : "大師手稿還缺四種筆法的交會，尤其要補概念辨識與錯誤診斷。";

  return {
    mastered,
    masteryPct: Math.round(accuracy * 100) / 100,
    stars: masteryStars(accuracy),
    conditions,
    missingChallenges,
    feedback,
    errorLocks,
  };
}

export function buildAdaptiveSequence(questions, attempts = [], limit = 8, random = Math.random, node = {}) {
  const recent = attempts.slice(-10);
  const accuracy = recent.length === 0
    ? 0
    : recent.filter((attempt) => attempt.correct).length / recent.length;
  const eligibleQuestions = node.tier === "elem-low" && accuracy < 0.6
    ? questions.filter((question) => question.type !== "error-diagnosis")
    : questions;
  const challengeQuestions = eligibleQuestions.filter((question) => question.challenge);
  if (challengeQuestions.length === 0) return eligibleQuestions.slice(0, limit);

  const attemptedChallenges = new Set(attempts.map((attempt) => attempt.challenge).filter(Boolean));
  const groups = new Map();
  for (const question of challengeQuestions) {
    if (!groups.has(question.challenge)) groups.set(question.challenge, []);
    groups.get(question.challenge).push(question);
  }

  const cooldownIds = new Set(attempts.slice(-6).map((attempt) => attempt.questionId));
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
    const question = pick(candidates, random);
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
    const question = pick(candidates, random);
    if (!question) break;
    queue.push(question);
    queuedIds.add(question.id);
  }
  return queue;
}
