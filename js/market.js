import { getPlayerId, getPlayerName } from "./leaderboard.js";
import { seasonKey, normalizeRoomCode, isValidRoomCode } from "./arena.js";

// 赫米斯市集：班級內玩家互相掛單交易星靈，星屑買賣。赫米斯＝商業之神，每週五「市集日」開市。
// 經濟安全：P2P 交易星屑是「買方付、賣方收」的重分配，不新增星屑（水龍頭仍只有每日任務／精熟），
// 因此不會通膨；價格一律由伺服器存的為準（買單不信任前端價格）、成交用原子狀態轉移防重複賣。
const API_BASE = "https://bxws-math.pages.dev";
export const MARKET_MIN_PRICE = 5;
export const MARKET_MAX_PRICE = 100;
export const MAX_ACTIVE_LISTINGS = 3;
export const MAX_BUYS_PER_DAY = 3;

// 台灣時間週五開市
export function isMarketOpen(now = new Date()) {
  return now.getDay() === 5;
}

export function nextMarketText(now = new Date()) {
  return isMarketOpen(now) ? "赫米斯市集日・開市中" : "下次開市：本週五";
}

// 經濟對帳（D7）：星屑水龍頭 vs 各出口是否對得上目前餘額。
// balance 應等於玩家目前星屑餘額；不等代表有漏算或異常。
export function reconcileEconomy({ earned = 0, npcSpent = 0, p2pBought = 0, p2pSold = 0 } = {}) {
  const balance = earned - npcSpent - p2pBought + p2pSold;
  return { balance, faucet: earned, sinks: npcSpent + p2pBought, inflow: p2pSold };
}

export async function listSpirit(roomCode, spiritN, price, season = seasonKey()) {
  if (!isValidRoomCode(roomCode)) return { error: "bad-room" };
  try {
    const res = await fetch(`${API_BASE}/api/market-list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode: normalizeRoomCode(roomCode), season, deviceId: getPlayerId(), name: getPlayerName() || "匿名", spiritN, price }),
    });
    return await res.json();
  } catch { return { error: "offline" }; }
}

export async function fetchMarketBoard(roomCode, season = seasonKey()) {
  if (!isValidRoomCode(roomCode)) return null;
  try {
    const url = `${API_BASE}/api/market-board?roomCode=${encodeURIComponent(normalizeRoomCode(roomCode))}&season=${encodeURIComponent(season)}&deviceId=${encodeURIComponent(getPlayerId())}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()).listings ?? [];
  } catch { return null; }
}

export async function buyListing(id) {
  try {
    const res = await fetch(`${API_BASE}/api/market-buy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, deviceId: getPlayerId(), name: getPlayerName() || "匿名" }),
    });
    return await res.json();
  } catch { return { error: "offline" }; }
}

export async function fetchMyListings() {
  try {
    const res = await fetch(`${API_BASE}/api/market-mine?deviceId=${encodeURIComponent(getPlayerId())}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function claimPayout() {
  try {
    const res = await fetch(`${API_BASE}/api/market-claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: getPlayerId() }),
    });
    return await res.json();
  } catch { return { error: "offline" }; }
}
