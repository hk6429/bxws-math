import { store } from "./store.js";
import { flattenBank, loadQuestionBank } from "./quiz-loader.js";
import { getPlayerId, getPlayerName } from "./leaderboard.js";

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

function deriveResultKey(week) {
  let mixed = hashSeed(week) ^ 0x9e3779b9;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0xc2b2ae35);
  const rotatedWeek = [...week].reverse().map((char, index) =>
    String.fromCharCode(char.charCodeAt(0) ^ ((index * 17 + 43) & 31))
  ).join("");
  return `${(mixed >>> 0).toString(36)}:${hashSeed(rotatedWeek).toString(36)}`;
}

function resultChecksum(week, body) {
  const key = deriveResultKey(week);
  return (hashSeed(`${key}|${body}|${key.length}`) % (36 ** 3)).toString(36).toUpperCase().padStart(3, "0");
}

// 戰績碼 V2：base36 本體＋混入週次與站點鹽的三位檢查碼
export function encodeResult(pct, totalSec, maxStreak) {
  const value =
    Math.round(pct) * 1000000 +
    Math.min(999, Math.round(totalSec)) * 1000 +
    Math.min(99, maxStreak);
  const body = value.toString(36).toUpperCase();
  const week = isoWeekKey();
  const check = resultChecksum(week, body);
  return `${week}-V2${body}${check}`;
}

export function decodeResult(code) {
  const normalized = String(code).trim().toUpperCase();
  if (/^\d{4}W\d{2}-[0-9A-Z]+$/.test(normalized) && !normalized.includes("-V2")) return { error: "too-old" };
  const m = /^(\d{4}W\d{2})-V2([0-9A-Z]+)([0-9A-Z]{3})$/.exec(normalized);
  if (!m) return null;
  const value = parseInt(m[2], 36);
  if (Number.isNaN(value) || resultChecksum(m[1], m[2]) !== m[3]) return null;
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

export function assessImplausibleResult(record = {}) {
  const reasons = [];
  const pct = Number(record.pct);
  const totalSec = Number(record.totalSec);
  const questionCount = Number(record.questionCount);
  if (Number.isFinite(questionCount) && questionCount > 0) {
    if (Number.isFinite(totalSec) && totalSec < questionCount * 1.2) reasons.push("平均作答時間過短");
    if (pct === 100 && questionCount < 5) reasons.push("全對但題數過少");
  }
  const answerLog = Array.isArray(record.answerLog) ? record.answerLog : null;
  if (answerLog) {
    const logCorrect = answerLog.filter((answer) => answer.c === 1 || answer.correct === true).length;
    const logPct = answerLog.length > 0 ? Math.round((logCorrect / answerLog.length) * 100) : 0;
    const logSec = answerLog.reduce((sum, answer) => sum + Math.max(0, Number(answer.ms) || 0), 0) / 1000;
    if ((Number.isFinite(questionCount) && questionCount !== answerLog.length)
      || (Number.isFinite(pct) && pct !== logPct)
      || (Number.isFinite(totalSec) && Math.abs(totalSec - logSec) > Math.max(2, logSec * 0.2))) {
      reasons.push("分數或時間與作答紀錄不一致");
    }
    if (Number.isFinite(record.completedAt)
      && answerLog.some((answer) => Number.isFinite(answer.at) && answer.at > record.completedAt)) {
      reasons.push("作答時間戳晚於結算時間");
    }
  }
  return { flagged: reasons.length > 0, reasons, flagLabel: reasons.length > 0 ? "⚠️ 建議複驗" : "" };
}

export function decodeClassResults(text) {
  const results = [];
  let invalidCount = 0;
  String(text).split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    let name = "";
    let code = line;
    const commaIndex = line.indexOf(",");
    if (commaIndex >= 0) {
      name = line.slice(0, commaIndex).trim();
      code = line.slice(commaIndex + 1).trim();
    } else {
      const parts = line.split(/\s+/);
      if (parts.length > 1) {
        code = parts.pop();
        name = parts.join(" ").trim();
      }
    }
    const decoded = decodeResult(code);
    if (!decoded || decoded.error) {
      invalidCount += 1;
      return;
    }
    const audit = assessImplausibleResult({ ...decoded, questionCount: 10 });
    results.push({ ...decoded, ...audit, code, name: name || null, lineNumber: index + 1 });
  });
  results.sort((a, b) => b.pct - a.pct || a.totalSec - b.totalSec || b.maxStreak - a.maxStreak);
  return { results, invalidCount };
}

export function getWeeklyBest() {
  return store.read(`weekly:${isoWeekKey()}`, null);
}

// 名次規則：正確率高者勝，同分比總秒數（快者勝）
export function submitWeeklyResult(pct, totalSec, maxStreak, audit = {}) {
  const current = getWeeklyBest();
  const better =
    !current ||
    pct > current.pct ||
    (pct === current.pct && totalSec < current.totalSec);
  if (!better) return current;
  const completedAt = Date.now();
  const questionCount = Number(audit.questionCount) || audit.answerLog?.length || 10;
  const plausibility = assessImplausibleResult({ pct, totalSec, questionCount, completedAt, answerLog: audit.answerLog });
  const record = {
    pct, totalSec, maxStreak, questionCount, completedAt, ...plausibility,
    code: encodeResult(pct, totalSec, maxStreak),
  };
  store.write(`weekly:${isoWeekKey()}`, record);
  return record;
}

// 房間代碼：老師/學生自訂的班級代碼，用來把伺服器排行榜分組
export function getRoomCode() {
  return store.read("roomCode", null);
}

export function setRoomCode(code) {
  const trimmed = String(code ?? "").trim().slice(0, 40);
  store.write("roomCode", trimmed || null);
  return trimmed || null;
}

// 背景同步到 Cloudflare D1；離線或伺服器異常時安靜失敗，不影響本機遊戲流程
export async function syncWeeklyResultToServer(record) {
  const roomCode = getRoomCode();
  if (!roomCode || !record) return { skipped: true };
  try {
    const res = await fetch("/api/weekly-submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomCode,
        week: isoWeekKey(),
        deviceId: getPlayerId(),
        name: getPlayerName() || "匿名",
        pct: record.pct,
        totalSec: record.totalSec,
        maxStreak: record.maxStreak,
        questionCount: record.questionCount,
      }),
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false, offline: true };
  }
}

// 從伺服器讀取真排行榜；失敗時回傳 null，呼叫端要自行 fallback 到手動貼上模式
export async function fetchWeeklyBoard(roomCode, week = isoWeekKey()) {
  if (!roomCode) return null;
  try {
    const res = await fetch(`/api/weekly-board?roomCode=${encodeURIComponent(roomCode)}&week=${encodeURIComponent(week)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results ?? null;
  } catch {
    return null;
  }
}
