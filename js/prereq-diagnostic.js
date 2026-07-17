const MIN_QUESTIONS = 3;
const DEFAULT_QUESTION_COUNT = 5;
const PASS_RATIO = 0.8;

export function hasPrerequisiteDiagnostic(node) {
  return Array.isArray(node?.diagnosticPrereq) && node.diagnosticPrereq.length > 0;
}

export async function buildPrerequisiteDiagnostic(
  node,
  loadBank,
  questionCount = DEFAULT_QUESTION_COUNT
) {
  if (!hasPrerequisiteDiagnostic(node)) return [];
  const sourceIds = node.diagnosticPrereq.slice(0, 2);
  const results = await Promise.allSettled(sourceIds.map(async (nodeId) => ({
    nodeId,
    bank: await loadBank(nodeId),
  })));
  const pools = results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    const questions = (result.value.bank.basicMastery ?? [])
      .filter((question) => question?.type === "basic-mastery")
      .map((question) => ({
        ...question,
        _diagnosticFor: node.id,
        _diagnosticPrereqNodeId: result.value.nodeId,
      }));
    return questions.length > 0 ? [{ nodeId: result.value.nodeId, questions }] : [];
  });

  const target = Math.max(MIN_QUESTIONS, Math.min(DEFAULT_QUESTION_COUNT, Number(questionCount) || 0));
  const picked = [];
  let index = 0;
  while (picked.length < target && pools.some((pool) => index < pool.questions.length)) {
    pools.forEach((pool) => {
      if (picked.length < target && pool.questions[index]) picked.push(pool.questions[index]);
    });
    index += 1;
  }
  if (picked.length < MIN_QUESTIONS) {
    throw new Error(`先備診斷題不足：${node.id}`);
  }
  return picked;
}

export function evaluatePrerequisiteDiagnostic(questions = [], answers = []) {
  const correctCount = questions.reduce((count, _question, index) => (
    count + (answers[index] === true ? 1 : 0)
  ), 0);
  const passed = questions.length >= MIN_QUESTIONS
    && correctCount >= Math.ceil(questions.length * PASS_RATIO);
  const gapNodeIds = [];
  questions.forEach((question, index) => {
    const nodeId = question._diagnosticPrereqNodeId;
    if (answers[index] !== true && nodeId && !gapNodeIds.includes(nodeId)) gapNodeIds.push(nodeId);
  });
  return {
    passed,
    correctCount,
    total: questions.length,
    gapNodeIds: passed ? [] : gapNodeIds,
  };
}

export function applyDiagnosticResult(progress = {}, nodeId, result, completedAt = Date.now()) {
  const previous = progress[nodeId] ?? {};
  return {
    ...progress,
    [nodeId]: {
      ...previous,
      diagnosticUnlocked: result?.passed === true || previous.diagnosticUnlocked === true,
      diagnosticLastResult: {
        passed: result?.passed === true,
        correctCount: Number(result?.correctCount) || 0,
        total: Number(result?.total) || 0,
        gapNodeIds: Array.isArray(result?.gapNodeIds) ? [...result.gapNodeIds] : [],
        completedAt,
      },
    },
  };
}
