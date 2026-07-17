import test from "node:test";
import assert from "node:assert/strict";
import { decodeResult, encodeResult } from "../js/weekly.js";

test("每週戰績碼使用混入週次的三位檢查碼並可還原", () => {
  const code = encodeResult(80, 47, 6);
  assert.match(code, /^\d{4}W\d{2}-V2[0-9A-Z]+[0-9A-Z]{3}$/);
  const result = decodeResult(code);
  assert.deepEqual({ pct: result.pct, totalSec: result.totalSec, maxStreak: result.maxStreak }, { pct: 80, totalSec: 47, maxStreak: 6 });
  const changed = `${code.slice(0, -1)}${code.endsWith("Z") ? "Y" : "Z"}`;
  assert.equal(decodeResult(changed), null);
});

test("舊戰績碼會明確回報格式過舊", () => {
  assert.deepEqual(decodeResult("2026W29-ABCDE1"), { error: "too-old" });
});
