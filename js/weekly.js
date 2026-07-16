import { store } from "./store.js";
import { loadQuestionBank } from "./quiz-loader.js";

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

function flattenBank(bank) {
  return [
    ...bank.basicMastery,
    ...bank.conceptId,
    ...bank.errorDiagnosis,
    ...bank.contextApplication,
  ];
}

// 同週同 nodeIds → 題組完全相同（id 排序後洗牌，與題庫檔內順序無關）
export async function buildWeeklySession(nodeIds, sessionSize = 10) {
  const banks = await Promise.all(nodeIds.map(loadQuestionBank));
  const all = banks
    .flatMap((bank, i) => flattenBank(bank).map((q) => ({ ...q, _nodeId: nodeIds[i] })))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const rand = mulberry32(hashSeed(isoWeekKey()));
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(sessionSize, all.length));
}

// 戰績碼：正確率(0-100)×百萬 + 總秒數(cap999)×千 + 最長連對(cap99)，base36 大寫＋一位檢查碼
export function encodeResult(pct, totalSec, maxStreak) {
  const value =
    Math.round(pct) * 1000000 +
    Math.min(999, Math.round(totalSec)) * 1000 +
    Math.min(99, maxStreak);
  const body = value.toString(36).toUpperCase();
  const check = (value % 35).toString(36).toUpperCase();
  return `${isoWeekKey()}-${body}${check}`;
}

export function decodeResult(code) {
  const m = /^(\d{4}W\d{2})-([0-9A-Z]+)([0-9A-Z])$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  const value = parseInt(m[2], 36);
  if (Number.isNaN(value) || (value % 35).toString(36).toUpperCase() !== m[3]) return null;
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
