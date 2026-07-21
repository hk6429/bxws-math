import { json, normStr, corsPreflight } from "./_util.js";

const MAX_BUYS_PER_DAY = 3;

export async function onRequestOptions() {
  return corsPreflight();
}

// 台灣日界（UTC+8）的今日零點毫秒
function startOfTodayMs(now = Date.now()) {
  const shifted = now + 8 * 3600 * 1000;
  const dayStart = Math.floor(shifted / 86400000) * 86400000;
  return dayStart - 8 * 3600 * 1000;
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid-json" }, 400); }

  const id = Number(body.id);
  const buyerDevice = normStr(body.deviceId, 40);
  const buyerName = normStr(body.name, 20) || "匿名";

  if (!Number.isInteger(id) || id <= 0) return json({ error: "bad-id" }, 400);
  if (!buyerDevice) return json({ error: "bad-device" }, 400);

  const listing = await env.DB.prepare(
    "SELECT id, seller_device, spirit_n, price, status FROM market_listings WHERE id = ?"
  ).bind(id).first();
  if (!listing) return json({ error: "not-found" }, 404);
  if (listing.status !== "open") return json({ error: "already-sold", message: "這件已被買走了" }, 409);
  if (listing.seller_device === buyerDevice) return json({ error: "own-listing", message: "不能買自己的掛單" }, 400);

  const buys = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM market_listings WHERE buyer_device = ? AND sold_at >= ?"
  ).bind(buyerDevice, startOfTodayMs()).first();
  if (buys && buys.n >= MAX_BUYS_PER_DAY) {
    return json({ error: "daily-limit", message: `每天最多買 ${MAX_BUYS_PER_DAY} 件` }, 429);
  }

  // 原子成交：只有仍 open 才成交，價格一律以伺服器存的為準（不信任前端傳的價格）
  const upd = await env.DB.prepare(
    "UPDATE market_listings SET status = 'sold', buyer_device = ?, buyer_name = ?, sold_at = ? WHERE id = ? AND status = 'open'"
  ).bind(buyerDevice, buyerName, Date.now(), id).run();

  if (!upd.meta || upd.meta.changes === 0) {
    return json({ error: "already-sold", message: "這件剛剛被買走了" }, 409);
  }

  return json({ ok: true, spiritN: listing.spirit_n, price: listing.price });
}
