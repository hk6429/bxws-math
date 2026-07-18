import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { workshopWeeklyGoal } from "../js/workshop.js";

test("世界觀故事預設收合，只先顯示一行摘要與展開入口", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  const lore = html.match(/<section id="mythos-lore"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(lore, /<details class="mythos-lore-details">/);
  assert.doesNotMatch(lore, /<details[^>]* open/);
  assert.match(lore, /<summary>[\s\S]*展開故事/);
  assert.match(css, /\.mythos-lore-details > summary/);
});

test("神殿總進度旁提供五個百分點內的本週小目標", async () => {
  assert.equal(workshopWeeklyGoal(3), "本週小目標：先把甦醒度推到 8%");
  assert.equal(workshopWeeklyGoal(98), "本週小目標：一起完成最後 2%！");
  assert.equal(workshopWeeklyGoal(100), "本週小目標：五座神殿已全數甦醒！");
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /workshopWeeklyGoal\(workshop\.overallPct\)/);
  assert.match(app, /workshop-weekly-goal/);
});

test("分享與下載完成或失敗時都有可見提示", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /function showToast/);
  assert.match(app, /已開啟分享/);
  assert.match(app, /已複製成果/);
  assert.match(app, /已產生並下載/);
  assert.match(app, /無法產生下載卡片/);
  assert.match(app, /role = "status"/);
});
