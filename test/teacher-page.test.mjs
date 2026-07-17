import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBoardUrl, buildClassShareText, resultsToCsv } from "../js/teacher.js";

test("教師頁使用既有 Cloudflare 絕對網址查詢班級週榜", () => {
  assert.equal(buildBoardUrl("七年一班", "2026W29"), "https://bxws-math.pages.dev/api/weekly-board?roomCode=%E4%B8%83%E5%B9%B4%E4%B8%80%E7%8F%AD&week=2026W29");
});

test("班級代碼分享文字與 CSV 匯出保留必要欄位並正確跳脫", () => {
  assert.match(buildClassShareText("701A"), /701A/);
  const csv = resultsToCsv([{ name: "王,小明", pct: 90, totalSec: 88, flagged: true, flagReasons: ["時間過短"] }]);
  assert.match(csv, /^姓名,正確率,作答時間秒,可疑標記,原因/m);
  assert.match(csv, /"王,小明",90,88,是,時間過短/);
});

test("最小教師頁有 roomCode、week、結果表格、分享與 CSV，且不含登入流程", async () => {
  const html = await readFile(new URL("../teacher.html", import.meta.url), "utf8");
  assert.match(html, /id="teacher-room-code"/);
  assert.match(html, /id="teacher-week"/);
  assert.match(html, /id="teacher-results"/);
  assert.match(html, /複製班級代碼分享文字/);
  assert.match(html, /匯出 CSV/);
  assert.doesNotMatch(html, /登入|login|password/i);
});
