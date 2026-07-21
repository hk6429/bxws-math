import { json, normStr, corsPreflight, ensureDeviceAuth } from "./_util.js";

export async function onRequestOptions() {
  return corsPreflight();
}

// 領款：把自己已售出但未領的掛單標記為已領，回傳這次應入帳的星屑總額
// （前端收到後才 addStardust，避免跨裝置重複入帳——server 端一次性把 payout_claimed 設 1）
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid-json" }, 400); }
  const deviceId = normStr(body.deviceId, 40);
  if (!deviceId) return json({ error: "bad-device" }, 400);
  const auth = await ensureDeviceAuth(env, deviceId, body.authToken);
  if (!auth.ok) return json({ error: "auth-mismatch", message: "裝置驗證失敗" }, 403);

  // 原子領款：UPDATE...RETURNING 一步標記並取回「這一次真正翻到 1」的列——併發／雙擊時，
  // 第二個請求的 UPDATE 匹配 0 列（已被前一個標記），只會回 claimed:0，不會重複入帳。
  const claimed = await env.DB.prepare(
    "UPDATE market_listings SET payout_claimed = 1 WHERE seller_device = ? AND status = 'sold' AND payout_claimed = 0 RETURNING price"
  ).bind(deviceId).all();
  const rows = claimed?.results ?? [];
  const total = rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

  return json({ ok: true, claimed: total, count: rows.length, authToken: auth.token });
}
