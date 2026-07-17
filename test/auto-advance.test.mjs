import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { autoAdvanceDelay, CORRECT_BURST_PARTICLE_COUNT } from "../js/quiz-ui.js";

test("答對約八百毫秒後自動前進，答錯保留手動前進", () => {
  assert.equal(autoAdvanceDelay(true), 800);
  assert.equal(autoAdvanceDelay(false), null);
});

test("作答流程只替正確答案排入自動下一題", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /const autoDelay = autoAdvanceDelay\(isCorrect\)/);
  assert.match(app, /scheduleTimer\(\(\) => answeredNextButton\.click\(\), autoDelay\)/);
});

test("答對鉛筆屑加量並觸發短暫畫面邊緣亮光", async () => {
  assert.ok(CORRECT_BURST_PARTICLE_COUNT >= 20);
  const [ui, css] = await Promise.all([
    readFile(new URL("../js/quiz-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /flashCorrectScreenEdge\(\)/);
  assert.match(ui, /correct-edge-flash/);
  assert.match(css, /\.correct-edge-flash[\s\S]*position:\s*fixed[\s\S]*inset:\s*0/);
  assert.match(css, /@keyframes correct-edge-flash/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*correct-edge-flash/);
});
