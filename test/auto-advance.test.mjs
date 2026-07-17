import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { autoAdvanceDelay } from "../js/quiz-ui.js";

test("答對約八百毫秒後自動前進，答錯保留手動前進", () => {
  assert.equal(autoAdvanceDelay(true), 800);
  assert.equal(autoAdvanceDelay(false), null);
});

test("作答流程只替正確答案排入自動下一題", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /const autoDelay = autoAdvanceDelay\(isCorrect\)/);
  assert.match(app, /scheduleTimer\(\(\) => answeredNextButton\.click\(\), autoDelay\)/);
});
