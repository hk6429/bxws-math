import { loadQuestionBank } from "./quiz-loader.js";

const PREFIX = "BX";
const REPLY_PREFIX = "XR";
const PICK_COUNT = 5;

function checksum(text) {
  let hash = 2166136261;
  for (const ch of text) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 36;
}

function flattenBank(bank) {
  return [...bank.basicMastery, ...bank.conceptId, ...bank.errorDiagnosis, ...bank.contextApplication];
}

export async function buildChallengeCatalog(nodeIds) {
  const banks = await Promise.all(nodeIds.map(loadQuestionBank));
  return banks
    .flatMap((bank, index) => flattenBank(bank).map((q) => ({ ...q, _nodeId: nodeIds[index] })))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function encodeChallenge(questions, catalog) {
  if (questions.length !== PICK_COUNT) throw new Error("挑戰包必須剛好五題");
  const indexes = questions.map((question) => catalog.findIndex((item) => item.id === question.id));
  if (indexes.some((index) => index < 0 || index >= 36 ** 2)) throw new Error("挑戰包含有無法辨識的題目");
  if (new Set(indexes).size !== PICK_COUNT) throw new Error("挑戰包題目不可重複");
  const body = indexes.map((index) => index.toString(36).padStart(2, "0")).join("").toUpperCase();
  return `${PREFIX}-${body}${checksum(body).toString(36).toUpperCase()}`;
}

export function decodeChallenge(code, catalog) {
  const match = /^BX-([0-9A-Z]{10})([0-9A-Z])$/.exec(String(code).trim().toUpperCase());
  if (!match || checksum(match[1]).toString(36).toUpperCase() !== match[2]) return null;
  const indexes = match[1].match(/.{2}/g).map((chunk) => parseInt(chunk, 36));
  if (new Set(indexes).size !== PICK_COUNT || indexes.some((index) => !catalog[index])) return null;
  return indexes.map((index) => catalog[index]);
}

export function questionAccuracy(questionId, progress = {}) {
  const attempts = Object.values(progress).flatMap((entry) => entry?.attempts ?? []).filter((a) => a.questionId === questionId);
  if (attempts.length === 0) return null;
  return attempts.filter((a) => a.correct).length / attempts.length;
}

export function encodeReply(challengeCode, pct, totalSec) {
  const challenge = String(challengeCode).trim().toUpperCase();
  const digest = checksum(challenge).toString(36).padStart(1, "0");
  const score = Math.max(0, Math.min(100, Math.round(pct))).toString(36).padStart(2, "0");
  const seconds = Math.max(0, Math.min(1295, Math.round(totalSec))).toString(36).padStart(2, "0");
  const body = `${digest}${score}${seconds}`.toUpperCase();
  return `${REPLY_PREFIX}-${body}${checksum(body).toString(36).toUpperCase()}`;
}

export function decodeReply(code, challengeCode) {
  const match = /^XR-([0-9A-Z]{5})([0-9A-Z])$/.exec(String(code).trim().toUpperCase());
  if (!match || checksum(match[1]).toString(36).toUpperCase() !== match[2]) return null;
  const expectedDigest = checksum(String(challengeCode).trim().toUpperCase()).toString(36).toUpperCase();
  if (match[1][0] !== expectedDigest) return null;
  const pct = parseInt(match[1].slice(1, 3), 36);
  const totalSec = parseInt(match[1].slice(3, 5), 36);
  if (pct > 100) return null;
  return { pct, totalSec };
}

export function questionLabel(question) {
  return question.stem ?? question.statement ?? question.problem ?? question.question ?? question.id;
}
