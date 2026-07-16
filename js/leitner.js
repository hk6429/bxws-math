import { store } from "./store.js";

const MAX_BOX = 5;
const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14];

export function getBoxState() {
  return store.read("leitner", {});
}

export function getBox(questionId) {
  const state = getBoxState();
  return state[questionId]?.box ?? 1;
}

export function isDue(questionId) {
  const state = getBoxState();
  const record = state[questionId];
  if (!record) return true;
  const intervalDays = BOX_INTERVAL_DAYS[record.box - 1] ?? 0;
  const dueAt = record.lastSeen + intervalDays * 24 * 60 * 60 * 1000;
  return Date.now() >= dueAt;
}

// 是否曾作答過（有 Leitner 紀錄）——複習類每日任務用
export function hasRecord(questionId) {
  return !!getBoxState()[questionId];
}

export function updateBox(questionId, correct) {
  const state = getBoxState();
  const current = state[questionId]?.box ?? 1;
  const nextBox = correct ? Math.min(MAX_BOX, current + 1) : Math.max(1, current - 1);
  state[questionId] = { box: nextBox, lastSeen: Date.now() };
  store.write("leitner", state);
  return nextBox;
}
