import { store } from "./store.js";
import { flattenBank, loadQuestionBank } from "./quiz-loader.js";

// 每週大師盃：ISO 週數當種子，全班同一套題；結算產生可互報的戰績碼（無後端天梯）

export function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}W${String(week).padStart(2, "0")}`;
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 同週同 nodeIds → 題組完全相同（id 排序後洗牌，與題庫檔內順序無關）
export async function buildWeeklySession(nodeIds, sessionSize = 10) {
  const results = await Promise.allSettled(nodeIds.map(loadQuestionBank));
  const all = results
    .flatMap((result, i) => result.status === "fulfilled"
      ? flattenBank(result.value).map((q) => ({ ...q, _nodeId: nodeIds[i] }))
      : [])
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const rand = mulberry32(hashSeed(isoWeekKey()));
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(sessionSize, all.length));
}

const RESULT_SALT = "bxws-weekly-2026";

function resultChecksum(text) {
  return (hashSeed(`${RESULT_SALT}|${text}`) % (36 ** 3)).toString(36).toUpperCase().padStart(3, "0");
}

// 戰績碼 V2：base36 本體＋混入週次與站點鹽的三位檢查碼
export function encodeResult(pct, totalSec, maxStreak) {
  const value =
    Math.round(pct) * 1000000 +
    Math.min(999, Math.round(totalSec)) * 1000 +
    Math.min(99, maxStreak);
  const body = value.toString(36).toUpperCase();
  const week = isoWeekKey();
  const check = resultChecksum(`${week}|${body}`);
  return `${week}-V2${body}${check}`;
}

export function decodeResult(code) {
  const normalized = String(code).trim().toUpperCase();
  if (/^\d{4}W\d{2}-[0-9A-Z]+$/.test(normalized) && !normalized.includes("-V2")) return { error: "too-old" };
  const m = /^(\d{4}W\d{2})-V2([0-9A-Z]+)([0-9A-Z]{3})$/.exec(normalized);
  if (!m) return null;
  const value = parseInt(m[2], 36);
  if (Number.isNaN(value) || resultChecksum(`${m[1]}|${m[2]}`) !== m[3]) return null;
  const result = {
    week: m[1],
    pct: Math.floor(value / 1000000),
    totalSec: Math.floor(value / 1000) % 1000,
    maxStreak: value % 1000,
  };
  // 合理範圍檢查，擋掉碰巧過檢查碼的亂碼
  if (result.pct > 100 || result.maxStreak > 99) return null;
  return result;
}

export function decodeClassResults(text) {
  const results = [];
  let invalidCount = 0;
  String(text).split(/\r?\n/).forEach((raw, index) => {
    const code = raw.trim();
    if (!code) return;
    const decoded = decodeResult(code);
    if (!decoded || decoded.error) {
      invalidCount += 1;
      return;
    }
    results.push({ ...decoded, code, lineNumber: index + 1 });
  });
  results.sort((a, b) => b.pct - a.pct || a.totalSec - b.totalSec || b.maxStreak - a.maxStreak);
  return { results, invalidCount };
}

export function getWeeklyBest() {
  return store.read(`weekly:${isoWeekKey()}`, null);
}

// 名次規則：正確率高者勝，同分比總秒數（快者勝）
export function submitWeeklyResult(pct, totalSec, maxStreak) {
  const current = getWeeklyBest();
  const better =
    !current ||
    pct > current.pct ||
    (pct === current.pct && totalSec < current.totalSec);
  if (!better) return current;
  const record = { pct, totalSec, maxStreak, code: encodeResult(pct, totalSec, maxStreak) };
  store.write(`weekly:${isoWeekKey()}`, record);
  return record;
}
