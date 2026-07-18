import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeWorkshop } from "../js/workshop.js";

test("工作室修復度由精熟、落款與稀有章加權推導，不另存進度", () => {
  const tree = {
    strands: [
      { id: "num-quantity", name: "數與量", nodes: [{ id: "fraction-mul" }, { id: "decimal-mul" }] },
      { id: "space-shape", name: "空間與形狀", nodes: [], status: "coming-soon" },
    ],
  };
  const workshop = computeWorkshop(tree, {
    progress: { "fraction-mul": { masteryPct: 1 }, "decimal-mul": { masteryPct: 0.5 } },
    collection: { "fraction-mul": { tier: 2 }, "decimal-mul": { tier: 1 } },
    rareStamps: { "stamp-fraction-mul": { at: 1 } },
  });

  assert.equal(workshop.rooms[0].repairPct, 71);
  assert.equal(workshop.rooms[0].stage, "mending");
  assert.equal(workshop.rooms[1].stage, "blueprint");
  assert.equal(workshop.rooms[1].available, false);
});

test("目前已上線房間全數重光時，觸發工作室終局", () => {
  const tree = { strands: [{ id: "algebra", name: "代數", nodes: [{ id: "a1" }] }] };
  const workshop = computeWorkshop(tree, {
    progress: { a1: { masteryPct: 1 } },
    collection: { a1: { tier: 2 } },
    rareStamps: { "stamp-a1": { at: 1 } },
  });
  assert.equal(workshop.overallPct, 100);
  assert.equal(workshop.allRestored, true);
});

test("沒有咒卷與徽記的塔只看精熟度，五塔可一起達成全復明", () => {
  const tree = {
    strands: [
      { id: "num-quantity", name: "數與量", nodes: [{ id: "fraction-mul" }] },
      { id: "algebra", name: "代數", nodes: [{ id: "algebra-symbol" }] },
      { id: "space-shape", name: "空間與形狀", nodes: [{ id: "shape-recognize" }] },
      { id: "relation-pattern", name: "關係與規律", nodes: [{ id: "repeat-pattern" }] },
      { id: "data-uncertainty", name: "資料與可能性", nodes: [{ id: "data-table-basic" }] },
    ],
  };
  const workshop = computeWorkshop(tree, {
    progress: Object.fromEntries(tree.strands.flatMap((strand) => strand.nodes).map((node) => [node.id, { masteryPct: 1 }])),
    collection: {
      "fraction-mul": { tier: 2 },
      "algebra-symbol": { tier: 2 },
    },
    rareStamps: {
      "stamp-fraction-mul": { at: 1 },
      "stamp-algebra-symbol": { at: 1 },
    },
  });

  assert.deepEqual(workshop.rooms.map((room) => room.repairPct), [100, 100, 100, 100, 100]);
  assert.equal(workshop.overallPct, 100);
  assert.equal(workshop.allRestored, true);
});

test("五塔導師口吻直接對應各領域的數學解題步驟", () => {
  const tree = { strands: [
    { id: "num-quantity", name: "數與量", nodes: [{ id: "n" }] },
    { id: "algebra", name: "代數", nodes: [{ id: "a" }] },
    { id: "space-shape", name: "空間與形狀", nodes: [{ id: "s" }] },
    { id: "relation-pattern", name: "關係與規律", nodes: [{ id: "r" }] },
    { id: "data-uncertainty", name: "資料與可能性", nodes: [{ id: "d" }] },
  ] };
  const voices = Object.fromEntries(computeWorkshop(tree).rooms.map((room) => [room.id, room.voice]));
  assert.match(voices["num-quantity"], /標單位.*統一單位.*列式.*估算/);
  assert.match(voices.algebra, /設未知數.*列等式.*等號兩邊.*代回/);
  assert.match(voices["space-shape"], /標出邊角.*對照定義.*公式.*單位/);
  assert.match(voices["relation-pattern"], /排前幾項.*比較相鄰.*寫出規則.*代回/);
  assert.match(voices["data-uncertainty"], /確認總數.*分類.*有利結果.*所有可能/);
});

test("每張神殿卡可回到神話星圖並捲動高亮對應領地", async () => {
  const [app, ui, css] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/skilltree-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /card\.dataset\.strandId = room\.id/);
  assert.match(app, /card\.addEventListener\("click", \(\) => navigateToStrand\(room\.id\)\)/);
  assert.match(app, /async function navigateToStrand/);
  assert.match(app, /scrollIntoView\(\{ block: "start", behavior: "smooth" \}\)/);
  assert.match(ui, /strandBox\.dataset\.strandId = strand\.id/);
  assert.match(css, /\.strand\.strand-highlight/);
});
