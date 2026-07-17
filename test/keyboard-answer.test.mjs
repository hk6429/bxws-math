import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const quizUi = await readFile(new URL("../js/quiz-ui.js", import.meta.url), "utf8");

test("選項按鈕支援數字鍵 1-4 直接作答", () => {
  assert.match(quizUi, /function enableNumberKeyAnswering\(list\)/);
  assert.match(quizUi, /document\.addEventListener\("keydown", handler\)/);
  assert.match(quizUi, /enableNumberKeyAnswering\(list\)/);
});

test("數字鍵作答會避開文字輸入框、已停用選項與已離開畫面的舊題目", () => {
  assert.match(quizUi, /active\.tagName === "INPUT" \|\| active\.tagName === "TEXTAREA"/);
  assert.match(quizUi, /if \(!btn \|\| btn\.disabled\) return;/);
  assert.match(quizUi, /if \(!list\.isConnected\) \{\s*document\.removeEventListener\("keydown", handler\);/);
});
