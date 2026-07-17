import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeClassResults, decodeResult, encodeResult } from "../js/weekly.js";

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

test("班級戰績牆逐行容錯，依正確率與速度排序", () => {
  const slowPerfect = encodeResult(100, 80, 4);
  const fastPerfect = encodeResult(100, 55, 6);
  const eighty = encodeResult(80, 20, 8);
  const wall = decodeClassResults(`${slowPerfect}\n看不懂\n${eighty}\n\n${fastPerfect}`);

  assert.deepEqual(wall.results.map((result) => [result.pct, result.totalSec]), [
    [100, 55], [100, 80], [80, 20],
  ]);
  assert.equal(wall.invalidCount, 1);
  assert.deepEqual(wall.results.map((result) => result.lineNumber), [5, 1, 3]);
});

test("學院盃畫面提供不落盤的多行班級戰績牆", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /textarea\.id = "class-result-codes"/);
  assert.match(app, /decodeClassResults\(textarea\.value\)/);
  assert.match(app, /有 \$\{parsed\.invalidCount\} 行無法辨識/);
  const wallBlock = app.slice(app.indexOf("const wall ="), app.indexOf("container.prepend(card)"));
  assert.doesNotMatch(wallBlock, /store\.write/);
});
