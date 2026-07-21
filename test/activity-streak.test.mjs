import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

globalThis.localStorage = new FakeStorage();
const { getActivityStreak, recordActivityStreak } = await import("../js/store.js");

test("累計練習日數同日冪等、隔日加一、中斷後只加不清零", () => {
  const day1 = new Date(2026, 6, 17, 8).getTime();
  const day2 = new Date(2026, 6, 18, 20).getTime();
  const day4 = new Date(2026, 6, 20, 8).getTime();
  assert.equal(recordActivityStreak(day1).count, 1);
  assert.equal(recordActivityStreak(day1 + 3600000).count, 1); // 同日不重複計
  assert.equal(recordActivityStreak(day2).count, 2);
  assert.equal(getActivityStreak().count, 2);
  // 中斷一天（day3 沒練）仍照加，不歸零——累計制、不製造 streak 焦慮
  assert.equal(recordActivityStreak(day4).count, 3);
});
