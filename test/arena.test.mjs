import test from "node:test";
import assert from "node:assert/strict";
import {
  seasonKey, seasonLabel, normalizeRoomCode, isValidRoomCode, roomSeed,
  recordLocalArenaBest, getLocalArenaBest, ARENA_QUESTION_COUNT,
} from "../js/arena.js";

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

test("seasonKey 為 YYYY-MM，seasonLabel 可讀", () => {
  assert.equal(seasonKey(new Date(2026, 6, 20)), "2026-07");
  assert.equal(seasonKey(new Date(2026, 0, 1)), "2026-01");
  assert.equal(seasonLabel("2026-07"), "2026 年 7 月賽季");
});

test("房號正規化與驗證：去符號、轉大寫、限 3–8 碼", () => {
  assert.equal(normalizeRoomCode(" 5a-2026! "), "5A2026");
  assert.equal(normalizeRoomCode("abcdefghijk"), "ABCDEFGH");
  assert.equal(isValidRoomCode("5A2026"), true);
  assert.equal(isValidRoomCode("ab"), false);
  assert.equal(isValidRoomCode(""), false);
  assert.equal(isValidRoomCode("!!"), false);
});

test("roomSeed 對相同(房號,神殿,賽季)決定性一致，不同輸入不同", () => {
  const a1 = roomSeed("5A2026", "num-quantity", "2026-07");
  const a2 = roomSeed("5a2026", "num-quantity", "2026-07");
  assert.equal(a1, a2, "房號大小寫正規化後 seed 相同");
  assert.notEqual(a1, roomSeed("5A2026", "algebra", "2026-07"), "不同神殿不同 seed");
  assert.notEqual(a1, roomSeed("5A2026", "num-quantity", "2026-08"), "不同賽季不同 seed");
  assert.ok(Number.isInteger(a1) && a1 >= 0 && a1 < 1e9);
});

test("recordLocalArenaBest 只在成績更佳時覆寫（pct 優先，同 pct 比時間短）", () => {
  globalThis.localStorage = fakeStorage();
  const room = "5A2026", strand = "num-quantity", season = "2026-07";
  recordLocalArenaBest(room, strand, { pct: 80, totalSec: 100, totalDmg: 200, maxCombo: 5 }, season);
  const key = `${room}|${season}|${strand}`;
  assert.equal(getLocalArenaBest()[key].pct, 80);

  recordLocalArenaBest(room, strand, { pct: 70, totalSec: 50, totalDmg: 300, maxCombo: 8 }, season);
  assert.equal(getLocalArenaBest()[key].pct, 80, "較低 pct 不覆寫");

  recordLocalArenaBest(room, strand, { pct: 80, totalSec: 60, totalDmg: 210, maxCombo: 6 }, season);
  assert.equal(getLocalArenaBest()[key].totalSec, 60, "同 pct 但更快，覆寫");

  recordLocalArenaBest(room, strand, { pct: 100, totalSec: 90, totalDmg: 400, maxCombo: 10 }, season);
  assert.equal(getLocalArenaBest()[key].pct, 100, "更高 pct 覆寫");
});

test("ARENA_QUESTION_COUNT 為 10", () => {
  assert.equal(ARENA_QUESTION_COUNT, 10);
});
