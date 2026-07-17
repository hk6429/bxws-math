export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function normStr(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

// 與 js/weekly.js 的 assessImplausibleResult 同邏輯之精簡版（Functions 執行環境不引入完整前端模組樹）
export function assessImplausibleResult({ pct, totalSec, questionCount }) {
  const reasons = [];
  if (Number.isFinite(questionCount) && questionCount > 0) {
    if (Number.isFinite(totalSec) && totalSec < questionCount * 1.2) reasons.push("平均作答時間過短");
    if (pct === 100 && questionCount < 5) reasons.push("全對但題數過少");
  }
  return { flagged: reasons.length > 0, reasons, flagLabel: reasons.length > 0 ? "⚠️ 建議複驗" : "" };
}
