import { json, normStr, corsPreflight } from "./_util.js";

export async function onRequestOptions() {
  return corsPreflight();
}

// 賣家視角：自己開放中的掛單，以及已售出但尚未領款的星屑總額
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const deviceId = normStr(url.searchParams.get("deviceId") ?? "", 40);
  if (!deviceId) return json({ error: "bad-device" }, 400);

  const { results: open } = await env.DB.prepare(
    `SELECT id, spirit_n AS spiritN, price, room_code AS roomCode, created_at AS createdAt
     FROM market_listings WHERE seller_device = ? AND status = 'open' ORDER BY created_at DESC LIMIT 30`
  ).bind(deviceId).all();

  const { results: sold } = await env.DB.prepare(
    `SELECT id, spirit_n AS spiritN, price, buyer_name AS buyerName, sold_at AS soldAt
     FROM market_listings WHERE seller_device = ? AND status = 'sold' AND payout_claimed = 0
     ORDER BY sold_at DESC LIMIT 50`
  ).bind(deviceId).all();

  const unclaimedTotal = sold.reduce((s, r) => s + r.price, 0);
  return json({ ok: true, open, sold, unclaimedTotal });
}
