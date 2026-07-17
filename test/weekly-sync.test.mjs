import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

globalThis.localStorage = new FakeStorage();
const { getRoomCode, setRoomCode, syncWeeklyResultToServer, fetchWeeklyBoard, isoWeekKey } = await import("../js/weekly.js");

test("班級代碼可設定、清空與讀回", () => {
  assert.equal(getRoomCode(), null);
  assert.equal(setRoomCode(" 301班 "), "301班");
  assert.equal(getRoomCode(), "301班");
  assert.equal(setRoomCode(""), null);
  assert.equal(getRoomCode(), null);
});

test("沒有房間代碼時，同步與查詢一律跳過，不呼叫網路", async () => {
  setRoomCode("");
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  const syncResult = await syncWeeklyResultToServer({ pct: 90, totalSec: 40, maxStreak: 5, questionCount: 10 });
  assert.deepEqual(syncResult, { skipped: true });
  assert.equal(called, false);
  assert.equal(await fetchWeeklyBoard(null), null);
});

test("有房間代碼時會 POST 到 /api/weekly-submit 並帶上正確欄位", async () => {
  setRoomCode("302班");
  let capturedUrl = null;
  let capturedBody = null;
  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, updated: true, flagged: false, reasons: [] }) };
  };
  const result = await syncWeeklyResultToServer({ pct: 90, totalSec: 40, maxStreak: 5, questionCount: 10 });
  assert.equal(capturedUrl, "/api/weekly-submit");
  assert.equal(capturedBody.roomCode, "302班");
  assert.equal(capturedBody.week, isoWeekKey());
  assert.equal(capturedBody.pct, 90);
  assert.deepEqual(result, { ok: true, updated: true, flagged: false, reasons: [] });
});

test("伺服器離線或連線失敗時安靜回報 offline，不丟出例外", async () => {
  setRoomCode("303班");
  globalThis.fetch = async () => { throw new Error("network down"); };
  const result = await syncWeeklyResultToServer({ pct: 90, totalSec: 40, maxStreak: 5, questionCount: 10 });
  assert.deepEqual(result, { ok: false, offline: true });
});

test("fetchWeeklyBoard 正常時回傳 results 陣列，失敗時回傳 null 供呼叫端 fallback", async () => {
  globalThis.fetch = async (url) => {
    assert.match(url, /^\/api\/weekly-board\?roomCode=304%E7%8F%AD&week=/);
    return { ok: true, json: async () => ({ ok: true, results: [{ name: "小安", pct: 90 }] }) };
  };
  const results = await fetchWeeklyBoard("304班");
  assert.deepEqual(results, [{ name: "小安", pct: 90 }]);

  globalThis.fetch = async () => ({ ok: false });
  assert.equal(await fetchWeeklyBoard("304班"), null);

  globalThis.fetch = async () => { throw new Error("boom"); };
  assert.equal(await fetchWeeklyBoard("304班"), null);
});
