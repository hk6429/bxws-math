import { masteryThresholdFor } from "./mastery-engine.js";

const PLACEMENT_CHECKPOINT_IDS = [
  "add-sub-within-100",
  "fraction-equivalent",
  "decimal-mul",
  "negative-number",
  "algebra-symbol",
];
const DEFAULT_QUESTION_COUNT = 15;
const MIN_NODE_QUESTIONS = 3;

export function hasMeaningfulProgress(progress = {}) {
  return Object.values(progress).some((entry) => (
    entry?.mastered === true
      || entry?.diagnosticUnlocked === true
      || Number(entry?.totalAttempts) > 0
      || (Array.isArray(entry?.attempts) && entry.attempts.length > 0)
  ));
}

function mixedQuestionPool(bank = {}) {
  const groups = [bank.basicMastery, bank.conceptId, bank.errorDiagnosis, bank.contextApplication]
    .map((items) => Array.isArray(items) ? items : []);
  const picked = [];
  let index = 0;
  while (groups.some((items) => items[index])) {
    groups.forEach((items) => {
      if (items[index]) picked.push(items[index]);
    });
    index += 1;
  }
  return picked;
}

export async function buildPlacementDiagnostic(tree, loadBank, questionCount = DEFAULT_QUESTION_COUNT) {
  const nodes = tree.strands.flatMap((strand) => strand.nodes);
  const availableIds = new Set(nodes.filter((node) => !node.contentPending).map((node) => node.id));
  const checkpointIds = PLACEMENT_CHECKPOINT_IDS.filter((id) => availableIds.has(id));
  const results = await Promise.allSettled(checkpointIds.map(async (nodeId) => ({
    nodeId,
    questions: mixedQuestionPool(await loadBank(nodeId)),
  })));
  const pools = results.flatMap((result) => result.status === "fulfilled" && result.value.questions.length > 0
    ? [{ ...result.value, index: 0 }]
    : []);
  const target = Math.max(MIN_NODE_QUESTIONS, Math.min(DEFAULT_QUESTION_COUNT, Number(questionCount) || 0));
  const picked = [];
  while (picked.length < target && pools.some((pool) => pool.questions[pool.index])) {
    pools.forEach((pool) => {
      const question = pool.questions[pool.index];
      if (question && picked.length < target) {
        picked.push({ ...question, _placementNodeId: pool.nodeId });
      }
      pool.index += 1;
    });
  }
  if (picked.length < MIN_NODE_QUESTIONS) throw new Error("快速定位題目暫時不足");
  return picked;
}

function roundRatio(correct, total) {
  return total === 0 ? 0 : Math.round((correct / total) * 100) / 100;
}

export function applyPlacementDiagnostic(
  progress = {},
  questions = [],
  answers = [],
  nodesById = {},
  completedAt = Date.now()
) {
  const next = { ...progress };
  const grouped = new Map();
  questions.forEach((question, index) => {
    const nodeId = question._placementNodeId;
    if (!nodeId || !nodesById[nodeId]) return;
    if (!grouped.has(nodeId)) grouped.set(nodeId, []);
    grouped.get(nodeId).push({ question, correct: answers[index] === true });
  });

  grouped.forEach((records, nodeId) => {
    const previous = next[nodeId] ?? {};
    const priorAttempts = Array.isArray(previous.attempts) ? previous.attempts : [];
    const attempts = records.map(({ question, correct }) => ({
      questionId: question.id,
      ...(question.challenge ? { challenge: question.challenge } : {}),
      ...(question.type ? { type: question.type } : {}),
      ...(question.errorPath !== undefined ? { errorPath: question.errorPath } : {}),
      correct,
      msElapsed: 0,
      at: completedAt,
      placementDiagnostic: true,
    }));
    const correctCount = attempts.filter((attempt) => attempt.correct).length;
    const masteryPct = roundRatio(correctCount, attempts.length);
    const threshold = masteryThresholdFor(nodesById[nodeId]);
    const passed = attempts.length >= MIN_NODE_QUESTIONS
      && correctCount >= Math.ceil(attempts.length * threshold);
    const priorTotal = Number.isFinite(previous.totalAttempts) ? previous.totalAttempts : priorAttempts.length;
    const priorCorrect = Number.isFinite(previous.correctAttempts)
      ? previous.correctAttempts
      : priorAttempts.filter((attempt) => attempt.correct).length;
    next[nodeId] = {
      ...previous,
      attempts: [...priorAttempts, ...attempts].slice(-50),
      totalAttempts: priorTotal + attempts.length,
      correctAttempts: priorCorrect + correctCount,
      masteryPct: previous.mastered === true ? Math.max(previous.masteryPct ?? 0, masteryPct) : masteryPct,
      mastered: previous.mastered === true || passed,
      masteryVersion: 2,
      placementDiagnostic: {
        passed,
        correctCount,
        total: attempts.length,
        completedAt,
      },
      ...(passed ? { masterySource: "placement-diagnostic" } : {}),
    };
  });
  return next;
}

