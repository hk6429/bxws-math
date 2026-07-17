import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("結算頁保留星圖出口，並可用同一策略直達重練", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /✦ 咒卷完卷！/);
  assert.match(app, /nextStep\.label/);
  assert.match(app, /startQuizWithStrategy\(session\.node, session\.strategy/);
  assert.match(app, /回魔法星圖/);
});
