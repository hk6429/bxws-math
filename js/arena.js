import { store } from "./store.js";
import { mulberry32 } from "./pvp.js";
import { getPlayerId, getPlayerName, getDeviceToken, syncDeviceToken } from "./leaderboard.js";

// 神殿競技場：房號 + 月賽季 → 決定一組所有人都相同的題目 seed（沿用 pvp.js 的 mulberry32），
// 同房同賽季的人各自打完同一套題，把戰績上傳雲端比分。採「非同步比分」而非即時輪詢——
// 對單人在家或同班不同時段練習都適用，也不必維護伺服器對戰權威狀態（見 references/battle-engine.md）。
// D1 只掛在 Cloudflare Pages，寫死絕對網址讓 Vercel/Netlify 版也打同一份資料庫；打不到就退本機模式。

const API_BASE = "https://bxws-math.pages.dev";
export const ARENA_QUESTION_COUNT = 10;

export function seasonKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function seasonLabel(key = seasonKey()) {
  const [y, m] = key.split("-");
  return `${y} 年 ${Number(m)} 月賽季`;
}

// 房號正規化：3–8 碼英數（大寫），足夠同班辨識又好唸
export function normalizeRoomCode(code) {
  return String(code ?? "").trim().toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);
}

export function isValidRoomCode(code) {
  const c = normalizeRoomCode(code);
  return c.length >= 3 && c.length <= 8;
}

// 房號 + 賽季 + strand 三者決定 seed：同房同月同神殿的所有人拿到完全相同的題目序列（公平性核心）。
export function roomSeed(roomCode, strandId, season = seasonKey()) {
  const str = `${normalizeRoomCode(roomCode)}|${season}|${strandId}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 再過一次 mulberry32 讓相近字串也充分打散
  return Math.floor(mulberry32(h)() * 1e9);
}

// 本機備援：伺服器打不到時，至少存自己在這房這賽季的最佳戰績，之後同 seed 重打可自我比分
export function getLocalArenaBest() {
  return store.read("arenaBest", {});
}

function localKey(roomCode, strandId, season) {
  return `${normalizeRoomCode(roomCode)}|${season}|${strandId}`;
}

export function recordLocalArenaBest(roomCode, strandId, result, season = seasonKey()) {
  const all = getLocalArenaBest();
  const key = localKey(roomCode, strandId, season);
  const prev = all[key];
  const better = !prev || result.pct > prev.pct || (result.pct === prev.pct && result.totalSec < prev.totalSec);
  if (better) {
    all[key] = { pct: result.pct, totalSec: result.totalSec, totalDmg: result.totalDmg, maxCombo: result.maxCombo, at: Date.now() };
    store.write("arenaBest", all);
  }
  return all[key];
}

// 上傳戰績到雲端；離線／無後端時安靜失敗（呼叫端會退本機比分）
export async function submitArenaResult(roomCode, strandId, result, season = seasonKey()) {
  if (!isValidRoomCode(roomCode)) return { skipped: true };
  try {
    const res = await fetch(`${API_BASE}/api/arena-submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomCode: normalizeRoomCode(roomCode),
        season,
        strandId,
        deviceId: getPlayerId(),
        authToken: getDeviceToken(),
        name: getPlayerName() || "匿名",
        pct: result.pct,
        totalSec: result.totalSec,
        totalDmg: result.totalDmg,
        maxCombo: result.maxCombo,
        questionCount: result.questionCount ?? ARENA_QUESTION_COUNT,
      }),
    });
    if (!res.ok) return { ok: false };
    return syncDeviceToken(await res.json());
  } catch {
    return { ok: false, offline: true };
  }
}

// 讀取某房某賽季某神殿的戰況牆（伺服器只回前五，暱稱 opt-in）；失敗回 null 讓呼叫端退本機
export async function fetchArenaBoard(roomCode, strandId, season = seasonKey()) {
  if (!isValidRoomCode(roomCode)) return null;
  try {
    const url = `${API_BASE}/api/arena-board?roomCode=${encodeURIComponent(normalizeRoomCode(roomCode))}`
      + `&season=${encodeURIComponent(season)}&strandId=${encodeURIComponent(strandId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results ?? null;
  } catch {
    return null;
  }
}
