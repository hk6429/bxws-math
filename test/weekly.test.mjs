import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assessImplausibleResult, decodeClassResults, decodeResult, encodeResult } from "../js/weekly.js";

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

test("班級戰績牆接受姓名逗號或空白格式，空姓名維持行號相容", () => {
  const alice = encodeResult(100, 55, 6);
  const bob = encodeResult(80, 20, 8);
  const unnamed = encodeResult(70, 30, 3);
  const wall = decodeClassResults(`小安,${alice}\n小博 ${bob}\n,${unnamed}`);

  assert.deepEqual(wall.results.map((result) => result.name), ["小安", "小博", null]);
  assert.deepEqual(wall.results.map((result) => result.lineNumber), [1, 2, 3]);
});

test("神殿盃畫面提供不落盤的多行班級戰績牆", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /textarea\.id = "class-result-codes"/);
  assert.match(app, /decodeClassResults\(textarea\.value\)/);
  assert.match(app, /姓名,戰績神諭/);
  assert.match(app, /entry\.name \|\| `第 \$\{entry\.lineNumber\} 行`/);
  assert.match(app, /有 \$\{parsed\.invalidCount\} 行無法辨識/);
  const wallBlock = app.slice(app.indexOf("const wall ="), app.indexOf("container.prepend(card)"));
  assert.doesNotMatch(wallBlock, /store\.write/);
});

test("可疑戰績會標記過短時間、過少題全對與作答紀錄不一致", () => {
  const audit = assessImplausibleResult({
    pct: 100,
    totalSec: 30,
    questionCount: 3,
    completedAt: 5000,
    answerLog: [
      { c: 1, ms: 1000, at: 6000 },
      { c: 1, ms: 1000, at: 7000 },
      { c: 1, ms: 1000, at: 8000 },
    ],
  });
  assert.equal(audit.flagged, true);
  assert.ok(audit.reasons.some((reason) => reason.includes("題數過少")));
  assert.ok(audit.reasons.some((reason) => reason.includes("作答紀錄")));
  assert.ok(audit.reasons.some((reason) => reason.includes("時間戳")));

  const wall = decodeClassResults(`小快,${encodeResult(100, 3, 10)}`);
  assert.equal(wall.results[0].flagged, true);
  assert.match(wall.results[0].flagLabel, /建議複驗/);
});

test("戰績碼檢查鍵由週次與多個數值動態混合，不再放單一明文鹽", async () => {
  const weekly = await readFile(new URL("../js/weekly.js", import.meta.url), "utf8");
  assert.doesNotMatch(weekly, /bxws-weekly-2026/);
  assert.doesNotMatch(weekly, /RESULT_SALT/);
  assert.match(weekly, /deriveResultKey/);
  assert.match(weekly, /0x9e3779b9/);
  assert.match(weekly, /0x85ebca6b/);
  assert.match(weekly, /0xc2b2ae35/);
});

test("班級戰績牆顯示建議複驗標記與學生自報揭露", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /entry\.flagLabel/);
  assert.match(app, /學生自行回報成績，未經伺服器驗證/);
});
