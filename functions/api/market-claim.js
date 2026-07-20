import { json, normStr, corsPreflight } from "./_util.js";

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

  const pending = await env.DB.prepare(
    "SELECT COALESCE(SUM(price), 0) AS total, COUNT(*) AS n FROM market_listings WHERE seller_device = ? AND status = 'sold' AND payout_claimed = 0"
  ).bind(deviceId).first();

  const total = pending?.total ?? 0;
  if (!total) return json({ ok: true, claimed: 0, count: 0 });

  await env.DB.prepare(
    "UPDATE market_listings SET payout_claimed = 1 WHERE seller_device = ? AND status = 'sold' AND payout_claimed = 0"
  ).bind(deviceId).run();

  return json({ ok: true, claimed: total, count: pending.n });
}
