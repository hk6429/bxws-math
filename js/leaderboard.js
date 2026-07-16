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
