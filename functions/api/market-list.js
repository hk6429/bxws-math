import { json, normStr, clampInt, corsPreflight } from "./_util.js";

const ROOM_CODE_RE = /^[0-9A-Z]{3,8}$/;
const SEASON_RE = /^\d{4}-\d{2}$/;
const MAX_ACTIVE_LISTINGS = 3;

export async function onRequestOptions() {
  return corsPreflight();
}

// 週五開市（赫米斯市集日）：伺服器端也把關，避免改前端繞過
function isMarketDay(now = new Date()) {
  return true; // 市集天天開（週五「加碼日」僅前端呈現，後端不再限制交易日）
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid-json" }, 400); }

  const roomCode = normStr(body.roomCode, 8).toUpperCase();
  const season = normStr(body.season, 7);
  const sellerDevice = normStr(body.deviceId, 40);
  const sellerName = normStr(body.name, 20) || "匿名";
  const spiritN = clampInt(body.spiritN, 2, 100);
  const price = clampInt(body.price, 5, 100);

  if (!ROOM_CODE_RE.test(roomCode)) return json({ error: "bad-room-code" }, 400);
  if (!SEASON_RE.test(season)) return json({ error: "bad-season" }, 400);
  if (!sellerDevice) return json({ error: "bad-device" }, 400);
  if (spiritN === null || price === null) return json({ error: "bad-numbers" }, 400);
  if (!isMarketDay()) return json({ error: "market-closed", message: "市集暫時關閉" }, 403);

  const active = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM market_listings WHERE seller_device = ? AND status = 'open'"
  ).bind(sellerDevice).first();
  if (active && active.n >= MAX_ACTIVE_LISTINGS) {
    return json({ error: "too-many-listings", message: `最多同時掛 ${MAX_ACTIVE_LISTINGS} 件` }, 429);
  }

  const res = await env.DB.prepare(
    `INSERT INTO market_listings (room_code, season, seller_device, seller_name, spirit_n, price, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
  ).bind(roomCode, season, sellerDevice, sellerName, spiritN, price, Date.now()).run();

  return json({ ok: true, id: res.meta?.last_row_id ?? null });
}
