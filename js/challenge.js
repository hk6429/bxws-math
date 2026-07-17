import { flattenBank, loadQuestionBank } from "./quiz-loader.js";
import { isoWeekKey } from "./weekly.js";

const PREFIX = "BX2";
const REPLY_PREFIX = "XR2";
const PICK_COUNT = 5;
const SITE_SALT = "bxws-challenge-2026";

function checksum(text) {
  let hash = 2166136261;
  for (const ch of text) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  for (const ch of SITE_SALT) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % (36 ** 3);
}

function checksumText(text) {
  return checksum(text).toString(36).toUpperCase().padStart(3, "0");
}

export async function buildChallengeCatalog(nodeIds) {
  const results = await Promise.allSettled(nodeIds.map(loadQuestionBank));
  return results
    .flatMap((result, index) => result.status === "fulfilled"
      ? flattenBank(result.value).map((q) => ({ ...q, _nodeId: nodeIds[index] }))
      : [])
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function encodeChallenge(questions, catalog) {
  if (questions.length !== PICK_COUNT) throw new Error("挑戰包必須剛好五題");
  const indexes = questions.map((question) => catalog.findIndex((item) => item.id === question.id));
  if (indexes.some((index) => index < 0 || index >= 36 ** 2)) throw new Error("挑戰包含有無法辨識的題目");
  if (new Set(indexes).size !== PICK_COUNT) throw new Error("挑戰包題目不可重複");
  const body = indexes.map((index) => index.toString(36).padStart(2, "0")).join("").toUpperCase();
  const week = isoWeekKey();
  return `${PREFIX}-${week}-${body}${checksumText(`${week}|${body}`)}`;
}

export function decodeChallenge(code, catalog) {
  const normalized = String(code).trim().toUpperCase();
  if (/^BX-[0-9A-Z]{11}$/.test(normalized)) return { error: "too-old" };
  const match = /^BX2-(\d{4}W\d{2})-([0-9A-Z]{10})([0-9A-Z]{3})$/.exec(normalized);
  if (!match || checksumText(`${match[1]}|${match[2]}`) !== match[3]) return null;
  const indexes = match[2].match(/.{2}/g).map((chunk) => parseInt(chunk, 36));
  if (new Set(indexes).size !== PICK_COUNT || indexes.some((index) => !catalog[index])) return null;
  return indexes.map((index) => catalog[index]);
}

export function questionAccuracy(questionId, progress = {}) {
  const counters = Object.values(progress).flatMap((entry) => {
    const stats = entry?.questionStats?.[questionId];
    if (stats) return [stats];
    const legacy = (entry?.attempts ?? []).filter((attempt) => attempt.questionId === questionId);
    return legacy.length > 0 ? [{
      totalAttempts: legacy.length,
      correctAttempts: legacy.filter((attempt) => attempt.correct).length,
    }] : [];
  });
  const totalAttempts = counters.reduce((sum, stats) => sum + stats.totalAttempts, 0);
  if (totalAttempts === 0) return null;
  return counters.reduce((sum, stats) => sum + stats.correctAttempts, 0) / totalAttempts;
}

export function encodeReply(challengeCode, pct, totalSec) {
  const challenge = String(challengeCode).trim().toUpperCase();
  const digest = checksumText(challenge);
  const score = Math.max(0, Math.min(100, Math.round(pct))).toString(36).padStart(2, "0");
  const seconds = Math.max(0, Math.min(1295, Math.round(totalSec))).toString(36).padStart(2, "0");
  const body = `${digest}${score}${seconds}`.toUpperCase();
  return `${REPLY_PREFIX}-${body}${checksumText(body)}`;
}

export function decodeReply(code, challengeCode) {
  const normalized = String(code).trim().toUpperCase();
  if (/^XR-[0-9A-Z]{6}$/.test(normalized)) return { error: "too-old" };
  const match = /^XR2-([0-9A-Z]{7})([0-9A-Z]{3})$/.exec(normalized);
  if (!match || checksumText(match[1]) !== match[2]) return null;
  const expectedDigest = checksumText(String(challengeCode).trim().toUpperCase());
  if (match[1].slice(0, 3) !== expectedDigest) return null;
  const pct = parseInt(match[1].slice(3, 5), 36);
  const totalSec = parseInt(match[1].slice(5, 7), 36);
  if (pct > 100) return null;
  return { pct, totalSec };
}

export function questionLabel(question) {
  return question.stem ?? question.statement ?? question.problem ?? question.question ?? question.id;
}
