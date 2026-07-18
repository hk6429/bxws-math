import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CORRECT_BURST_PARTICLE_COUNT } from "../js/quiz-ui.js";

test("答對答錯都等使用者主動按下一題", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(app, /autoAdvanceDelay/);
  assert.doesNotMatch(app, /answeredNextButton\.click\(\)/);
  assert.match(app, /下一題按鈕已出現/);
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

test("老師眉批有柔和淡入且尊重減少動態偏好", async () => {
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");
  assert.match(css, /\.q-explain\s*\{[\s\S]*animation:\s*explanation-fade-in/);
  assert.match(css, /@keyframes explanation-fade-in/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*\.q-explain/);
});
