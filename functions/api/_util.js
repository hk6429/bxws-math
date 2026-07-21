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

// C6 裝置認證（TOFU）：deviceId 是隨機不可猜字串，但「看得到就能用」。首次改動性請求時伺服器
// 核發一枚隨機 token 綁定該 deviceId 存入 D1，之後每次都要帶對 token，只知 deviceId、沒 token 的
// 冒充者就打不進來。token 只回給本人、不出現在任何 board。相容性：device_auth 表不存在或查詢異常
// 一律放行（fail-open），避免遷移前後端整個壞掉；這是最佳努力的加固，不是硬性登入。
export async function ensureDeviceAuth(env, deviceId, providedToken) {
  try {
    const row = await env.DB.prepare("SELECT token FROM device_auth WHERE device_id = ?").bind(deviceId).first();
    if (row?.token) {
      if (normStr(providedToken, 64) === row.token) return { ok: true, token: row.token };
      return { ok: false };
    }
    const token = (crypto.randomUUID?.() ?? String(Math.random())).replace(/-/g, "");
    await env.DB.prepare("INSERT INTO device_auth (device_id, token, created_ms) VALUES (?, ?, ?)")
      .bind(deviceId, token, Date.now()).run();
    return { ok: true, token, isNew: true };
  } catch {
    return { ok: true, token: null, degraded: true };
  }
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
