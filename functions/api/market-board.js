import { json, normStr, corsPreflight } from "./_util.js";

const ROOM_CODE_RE = /^[0-9A-Z]{3,8}$/;
const SEASON_RE = /^\d{4}-\d{2}$/;

export async function onRequestOptions() {
  return corsPreflight();
}

// 開放中的掛單（排除自己的），最多 30 件
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const roomCode = normStr(url.searchParams.get("roomCode") ?? "", 8).toUpperCase();
  const season = normStr(url.searchParams.get("season") ?? "", 7);
  const deviceId = normStr(url.searchParams.get("deviceId") ?? "", 40);

  if (!ROOM_CODE_RE.test(roomCode)) return json({ error: "bad-room-code" }, 400);
  if (!SEASON_RE.test(season)) return json({ error: "bad-season" }, 400);

  const { results } = await env.DB.prepare(
    `SELECT id, seller_name AS sellerName, spirit_n AS spiritN, price, created_at AS createdAt
     FROM market_listings
     WHERE room_code = ? AND season = ? AND status = 'open' AND seller_device != ?
     ORDER BY created_at DESC
     LIMIT 30`
  ).bind(roomCode, season, deviceId).all();

  return json({ ok: true, listings: results });
}
