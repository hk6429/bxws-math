import { store } from "./store.js";

export function getPlayerName() {
  return store.read("player", null);
}

export function setPlayerName(name) {
  store.write("player", name);
}

// 每台裝置一組固定 id，同名不同人不會互相覆蓋
export function getPlayerId() {
  let id = store.read("playerId", null);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    store.write("playerId", id);
  }
  return id;
}

// C6 裝置認證 token：伺服器首次核發後存本機，之後每次改動性請求都帶上，冒充者只有 deviceId
// 沒有 token 就打不進來。回應若帶新 token 就更新（用 syncDeviceToken）。
export function getDeviceToken() {
  return store.read("deviceAuthToken", "") || "";
}
export function syncDeviceToken(resp) {
  if (resp && typeof resp.authToken === "string" && resp.authToken && resp.authToken !== getDeviceToken()) {
    store.write("deviceAuthToken", resp.authToken);
  }
  return resp;
}

export function submitScore(name, overallMasteryPct) {
  const board = store.read("leaderboard", []);
  const id = getPlayerId();
  const existing = board.find((row) => row.id === id);
  if (existing) {
    existing.name = name;
    existing.masteryPct = Math.max(existing.masteryPct, overallMasteryPct);
    existing.updatedAt = Date.now();
  } else {
    board.push({ id, name, masteryPct: overallMasteryPct, updatedAt: Date.now() });
  }
  board.sort((a, b) => b.masteryPct - a.masteryPct);
  store.write("leaderboard", board);
  return board;
}

export function getLeaderboard() {
  return store.read("leaderboard", []);
}
