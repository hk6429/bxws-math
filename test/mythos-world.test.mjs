import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeWorkshop } from "../js/workshop.js";
import { guardianImageForStrand } from "../js/quiz-ui.js";
import { MANUSCRIPTS, RARE_STAMPS, RARITY_MYTHOS } from "../js/collection.js";
import { BADGES } from "../js/achievements.js";
import { EXTRA_QUOTES, QUOTES } from "../js/quotes.js";

test("首頁與五座神殿使用奧林帕斯世界觀，站名維持步學吾數", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<h1>步學吾數<\/h1>/);
  assert.match(html, /奧林帕斯數術神殿/);
  assert.doesNotMatch(html, /星穹魔法學院|學院五塔|魔法星圖/);
  assert.match(app, /五座神殿甦醒計畫/);
  assert.doesNotMatch(app, /五塔復明計畫|學院五塔|星穹之光/);
});

test("五個既有分支依指定領地與守護者呈現", () => {
  const ids = ["num-quantity", "algebra", "space-shape", "relation-pattern", "data-uncertainty"];
  const tree = { strands: ids.map((id) => ({ id, name: id, nodes: [] })) };
  const rooms = Object.fromEntries(computeWorkshop(tree).rooms.map((room) => [room.id, room]));
  assert.deepEqual(
    ids.map((id) => [rooms[id].title, rooms[id].guardian]),
    [
      ["迷宮地底城", "米諾陶洛斯 Minotaur"],
      ["斯芬克斯神殿", "斯芬克斯 Sphinx"],
      ["獨眼巨人鍛造坊", "獨眼巨人 Cyclops"],
      ["命運三女神紡織殿", "命運三女神 Moirai"],
      ["德爾菲神諭殿", "皮媞亞與巨蟒 Pythia"],
    ]
  );
});

test("五個分支背景掛載指定神話素材並在載入失敗時隱藏", async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL("../js/skilltree-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  [
    "labyrinth-bg.png",
    "sphinx-temple-bg.png",
    "cyclops-forge-bg.png",
    "moirai-hall-bg.png",
    "delphi-oracle-bg.png",
  ].forEach((file) => assert.match(ui, new RegExp(`assets/mythos/realms/${file.replace(".", "\\.")}`)));
  assert.match(ui, /realmBackground\.onerror\s*=\s*\(\)\s*=>\s*\{\s*realmBackground\.hidden\s*=\s*true/);
  assert.match(css, /\.realm-background/);
  assert.match(css, /object-fit:\s*cover/);
});

test("答題反應與星圖依分支使用指定守護者圖片並保留容錯", async () => {
  assert.deepEqual(
    ["num-quantity", "algebra", "space-shape", "relation-pattern", "data-uncertainty"].map(guardianImageForStrand),
    [
      "assets/mythos/guardians/minotaur.png",
      "assets/mythos/guardians/sphinx.png",
      "assets/mythos/guardians/cyclops.png",
      "assets/mythos/guardians/moirai.png",
      "assets/mythos/guardians/pythia.png",
    ]
  );
  const [quizUi, app, skilltreeUi] = await Promise.all([
    readFile(new URL("../js/quiz-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/skilltree-ui.js", import.meta.url), "utf8"),
  ]);
  assert.match(quizUi, /guardianImageForStrand\(guardianStrand\)/);
  assert.match(quizUi, /img\.onerror\s*=\s*\(\)\s*=>\s*\{\s*box\.style\.display\s*=\s*"none"/);
  assert.match(app, /const guardianStrand = strandIdForNode/);
  assert.match(app, /guardianStrand\s*}/);
  assert.match(skilltreeUi, /GUARDIAN_IMAGES\[strand\.id\]/);
  assert.match(skilltreeUi, /img\.onerror\s*=\s*\(\)\s*=>\s*\{\s*mascot\.style\.display\s*=\s*"none"/);
});

test("收藏顯示改為神諭卷軸、神話印記與指定神獸稀有度", async () => {
  assert.deepEqual(RARITY_MYTHOS, {
    "普通": "半人馬／羊男",
    "稀有": "美杜莎／奇美拉",
    "傳說": "泰坦巨人",
  });
  assert.ok(MANUSCRIPTS.every((item) => item.name.includes("神諭卷軸")));
  assert.ok(RARE_STAMPS.every((item) => item.name.includes("印記") && !item.name.includes("徽記")));
  const [app, achievements] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/achievements.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /神諭卷軸集/);
  assert.match(app, /神話印記圖鑑/);
  assert.match(app, /RARITY_MYTHOS\[s\.rarity\]/);
  assert.doesNotMatch(achievements, /奇遇魔法陣|星穹之光|秘數塔|符文塔|稜光塔|藤紋塔|星卜塔/);
  assert.ok(BADGES.some((badge) => badge.name === "奧林帕斯之光"));
});

test("五位導師分流保留，對外台詞統一為雅典娜式智慧引路人", async () => {
  const quotes = [...QUOTES.praise, ...QUOTES.cheer, ...QUOTES.comfort, ...EXTRA_QUOTES];
  assert.ok(quotes.filter((quote) => quote.kind === "創作").every((quote) => quote.text.includes("雅典娜")));
  assert.deepEqual(new Set([...QUOTES.comfort.map((quote) => quote.mascot)]), new Set([
    "davinci", "gauss", "euclid", "fibonacci", "pascal",
  ]));
  const source = await readFile(new URL("../js/quotes.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /凡奇導師|格思導師|幾德導師|斐蘿導師|帕嵐導師|星穹學院/);
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /雅典娜的智慧引路人/);
});

test("首頁以風格總覽圖與 200 至 300 字介紹奧林帕斯數術神殿", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  ]);
  const lore = html.match(/<section id="mythos-lore"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(lore, /assets\/mythos\/style-guide\.png/);
  ["迷宮地底城", "斯芬克斯神殿", "獨眼巨人鍛造坊", "命運三女神紡織殿", "德爾菲神諭殿"].forEach((name) => {
    assert.match(lore, new RegExp(name));
  });
  const story = lore.match(/<p>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>|\s/g, "") ?? "";
  assert.ok(story.length >= 200 && story.length <= 300, `世界觀故事長度為 ${story.length} 字`);
  assert.match(app, /mythos-style-guide/);
  assert.match(app, /naturalWidth === 0/);
  assert.match(app, /mythosFigure\.hidden = true/);
});
