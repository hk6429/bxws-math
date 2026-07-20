import test from "node:test";
import assert from "node:assert/strict";

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
  key(index) { return [...this.data.keys()][index] ?? null; }
  get length() { return this.data.size; }
}

globalThis.localStorage = new FakeStorage();
const sanctuary = await import("../js/sanctuary.js");
const {
  PEDESTAL_COUNT, DECORATIONS, TITLES,
  decorationById, totalMasteredCount, unlockedDecorationIds,
  getSanctuaryLayout, placeDecoration, clearPedestal,
  unlockedTitles, getInscription, setInscription, inscriptionText,
} = sanctuary;

// 五領域 id，各 4 節點；額外一個 relation-pattern 之外的空領域不建。
const STRAND_IDS = ["num-quantity", "algebra", "space-shape", "relation-pattern", "data-uncertainty"];

// 造一棵 fake 技能樹：每個領域 nodeCount 個節點，id 唯一。
function fakeTree(nodeCount = 4) {
  return {
    strands: STRAND_IDS.map((id) => ({
      id,
      nodes: Array.from({ length: nodeCount }, (_, i) => ({ id: `${id}-n${i}` })),
    })),
  };
}

// 造精熟 progress：masteredMap 形如 { "num-quantity": 2 } 代表該領域前 2 個節點精熟。
function fakeProgress(masteredMap) {
  const progress = {};
  Object.entries(masteredMap).forEach(([strandId, count]) => {
    for (let i = 0; i < count; i += 1) {
      progress[`${strandId}-n${i}`] = { masteryVersion: 2, mastered: true };
    }
  });
  return progress;
}

test("DECORATIONS 結構：23 件、center 3 件、五領域各 4 件，且每件有 id/name/glyph", () => {
  assert.equal(PEDESTAL_COUNT, 8);
  assert.equal(DECORATIONS.length, 23);

  const center = DECORATIONS.filter((d) => d.strand === "center");
  assert.equal(center.length, 3);

  STRAND_IDS.forEach((id) => {
    assert.equal(DECORATIONS.filter((d) => d.strand === id).length, 4, `${id} 應有 4 件`);
  });

  DECORATIONS.forEach((d) => {
    assert.equal(typeof d.id, "string");
    assert.equal(typeof d.name, "string");
    assert.equal(typeof d.glyph, "string");
    assert.ok(d.id.length > 0 && d.name.length > 0 && d.glyph.length > 0);
  });

  // decorationById 命中與未命中
  assert.equal(decorationById(DECORATIONS[0].id).id, DECORATIONS[0].id);
  assert.equal(decorationById("does-not-exist"), null);
});

test("裝飾解鎖綁精熟比例：num-quantity 4 節點，0→0 件、1→0.25、2→0.25+0.5、4→全解鎖", () => {
  const tree = fakeTree(4);
  const decorFor = (n) =>
    DECORATIONS.filter((d) => d.strand === "num-quantity" && n.has(d.id))
      .map((d) => d.tierRatio)
      .sort((a, b) => a - b);

  // 0 個精熟：該領域 0 件
  assert.deepEqual(decorFor(unlockedDecorationIds(tree, fakeProgress({ "num-quantity": 0 }))), []);

  // 1 個 (25%)：解鎖 tierRatio 0.25
  assert.deepEqual(decorFor(unlockedDecorationIds(tree, fakeProgress({ "num-quantity": 1 }))), [0.25]);

  // 2 個 (50%)：解鎖 0.25 + 0.5
  assert.deepEqual(decorFor(unlockedDecorationIds(tree, fakeProgress({ "num-quantity": 2 }))), [0.25, 0.5]);

  // 4 個 (100%)：四件全解鎖
  assert.deepEqual(decorFor(unlockedDecorationIds(tree, fakeProgress({ "num-quantity": 4 }))), [0.25, 0.5, 0.75, 1]);

  // 精熟只屬於自己的領域，不會外溢到別的領域
  const only = unlockedDecorationIds(tree, fakeProgress({ "num-quantity": 4 }));
  STRAND_IDS.filter((id) => id !== "num-quantity").forEach((id) => {
    assert.equal([...only].some((d) => decorationById(d)?.strand === id), false, `${id} 不應被解鎖`);
  });
});

test("center 里程碑：totalMasteredCount 達 10 / 25 / 50 分別解鎖三件中心裝飾", () => {
  const tree = fakeTree(20); // 每領域 20 節點，湊得出大 total
  const centerUnlocked = (total) => {
    // 把 total 分散到各領域（每領域最多 20），避免單一領域超額
    const per = {};
    let left = total;
    for (const id of STRAND_IDS) {
      const take = Math.min(20, left);
      per[id] = take;
      left -= take;
    }
    const set = unlockedDecorationIds(tree, fakeProgress(per));
    return DECORATIONS.filter((d) => d.strand === "center" && set.has(d.id))
      .map((d) => d.milestone)
      .sort((a, b) => a - b);
  };

  assert.equal(totalMasteredCount(tree, fakeProgress({ "num-quantity": 9 })), 9);
  assert.deepEqual(centerUnlocked(9), []);
  assert.deepEqual(centerUnlocked(10), [10]);
  assert.deepEqual(centerUnlocked(25), [10, 25]);
  assert.deepEqual(centerUnlocked(50), [10, 25, 50]);
});

test("placeDecoration / clearPedestal：合法才寫入、越界或未解鎖不寫、清除移除基座", () => {
  localStorage.data.clear();
  const tree = fakeTree(4);
  const unlocked = unlockedDecorationIds(tree, fakeProgress({ "num-quantity": 4 }));
  const validId = DECORATIONS.find((d) => d.strand === "num-quantity" && d.tierRatio === 0.25).id;

  // 起始 layout 為空物件
  assert.deepEqual(getSanctuaryLayout(), {});

  // 合法擺放
  placeDecoration(0, validId, unlocked);
  assert.equal(getSanctuaryLayout()["0"], validId);

  // pedestalIndex 越界（-1 / 8）不寫
  placeDecoration(-1, validId, unlocked);
  placeDecoration(8, validId, unlocked);
  assert.equal(getSanctuaryLayout()["-1"], undefined);
  assert.equal(getSanctuaryLayout()["8"], undefined);

  // decorationId 未解鎖不寫
  const lockedId = DECORATIONS.find((d) => d.strand === "algebra").id;
  placeDecoration(1, lockedId, unlocked);
  assert.equal(getSanctuaryLayout()["1"], undefined);

  // 不存在的 decorationId 不寫
  placeDecoration(2, "no-such-decor", unlocked);
  assert.equal(getSanctuaryLayout()["2"], undefined);

  // clearPedestal 移除該基座
  clearPedestal(0);
  assert.equal(getSanctuaryLayout()["0"], undefined);
});

test("門楣銘文：unlockedTitles 依 total 門檻過濾（0/5/15/30/50）", () => {
  const tree = fakeTree(20);
  const per = (total) => {
    const map = {}; let left = total;
    for (const id of STRAND_IDS) { const take = Math.min(20, left); map[id] = take; left -= take; }
    return map;
  };
  const ids = (total) => unlockedTitles(tree, fakeProgress(per(total))).map((t) => t.id);

  assert.deepEqual(TITLES.map((t) => t.need), [0, 5, 15, 30, 50]);
  assert.deepEqual(ids(0), ["title-novice"]);
  assert.deepEqual(ids(5), ["title-novice", "title-seeker"]);
  assert.deepEqual(ids(15), ["title-novice", "title-seeker", "title-adept"]);
  assert.deepEqual(ids(30), ["title-novice", "title-seeker", "title-adept", "title-sage"]);
  assert.deepEqual(ids(50), ["title-novice", "title-seeker", "title-adept", "title-sage", "title-oracle"]);
});

test("setInscription 只在已解鎖時寫入、未解鎖保持原值；inscriptionText 回對應文字", () => {
  localStorage.data.clear();
  const tree = fakeTree(20);

  // 預設為 title-novice
  assert.equal(getInscription(), "title-novice");
  assert.equal(inscriptionText("title-novice"), "初醒的學徒");

  // total=5 只解鎖到 seeker；設定 seeker 成功
  const unlocked5 = unlockedTitles(tree, fakeProgress({ "num-quantity": 5 }));
  setInscription("title-seeker", unlocked5);
  assert.equal(getInscription(), "title-seeker");
  assert.equal(inscriptionText(), "神諭的追尋者");

  // 嘗試設定尚未解鎖的 title-oracle → 保持原值 title-seeker
  setInscription("title-oracle", unlocked5);
  assert.equal(getInscription(), "title-seeker");

  // inscriptionText 對未知 id 回退到第一個稱號文字
  assert.equal(inscriptionText("no-such-title"), TITLES[0].text);
});
