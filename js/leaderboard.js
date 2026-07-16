import { store } from "./store.js";

export function getPlayerName() {
  return store.read("player", null);
}

export function setPlayerName(name) {
  store.write("player", name);
}

export function submitScore(name, overallMasteryPct) {
  const board = store.read("leaderboard", []);
  const existing = board.find((row) => row.name === name);
  if (existing) {
    existing.masteryPct = Math.max(existing.masteryPct, overallMasteryPct);
    existing.updatedAt = Date.now();
  } else {
    board.push({ name, masteryPct: overallMasteryPct, updatedAt: Date.now() });
  }
  board.sort((a, b) => b.masteryPct - a.masteryPct);
  store.write("leaderboard", board);
  return board;
}

export function getLeaderboard() {
  return store.read("leaderboard", []);
}
