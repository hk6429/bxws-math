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
const fusion = await import("../js/fusion.js");

// 直接灌星屑餘額：getStardustCount() = inkDays.length + stardustBonus，
// 這裡只動 stardustBonus 這顆 key（store 走 bxws: 命名空間，值以 JSON 存）。
function seedStardust(amount) {
  localStorage.setItem("bxws:stardustBonus", String(amount));
}

// ---- 1. 數學正確性 ----
test("isPrime 對質數為 true、對非質數為 false", () => {
  for (const n of [2, 3, 7, 11, 97]) assert.equal(fusion.isPrime(n), true, `${n} 應為質數`);
  for (const n of [1, 4, 12, 100]) assert.equal(fusion.isPrime(n), false, `${n} 應非質數`);
});

test("divisorCount 正確計算因數個數", () => {
  assert.equal(fusion.divisorCount(12), 6); // 1,2,3,4,6,12
  assert.equal(fusion.divisorCount(7), 2); // 1,7
});

test("isPerfect 對完全數為 true", () => {
  assert.equal(fusion.isPerfect(6), true);
  assert.equal(fusion.isPerfect(28), true);
  assert.equal(fusion.isPerfect(12), false);
});

test("isSquare 對平方數為 true", () => {
  assert.equal(fusion.isSquare(9), true);
  assert.equal(fusion.isSquare(100), true);
  assert.equal(fusion.isSquare(12), false);
});

test("divisors 回傳排序後的完整因數列表", () => {
  assert.deepEqual(fusion.divisors(12), [1, 2, 3, 4, 6, 12]);
});

// ---- 2. classify ----
test("classify 依數學性質判定 kind 與 rarity", () => {
  assert.deepEqual(fusion.classify(6), { kind: "perfect", rarity: "傳說" });
  assert.deepEqual(fusion.classify(7), { kind: "prime", rarity: "稀有" });
  assert.deepEqual(fusion.classify(9), { kind: "square", rarity: "稀有" });
  assert.deepEqual(fusion.classify(12), { kind: "composite", rarity: "普通" });
});

test("spiritName / spiritArt：英雄星靈有專屬名與立繪，其餘程序化", () => {
  assert.equal(fusion.spiritName(6), "赫菲斯托斯・完美之靈");
  assert.equal(fusion.spiritArt(6), "spirit-6");
  assert.equal(fusion.spiritArt(15), null); // 非英雄星靈
  assert.equal(fusion.spiritName(13), "13 質靈");
  assert.equal(fusion.spiritName(9), "9 方靈");
  assert.equal(fusion.spiritName(15), "15 之靈");
});

// ---- 3. 質數無法由融合誕生（模組核心教學點）----
test("所有合法融合的乘積恆為合成數——質數星靈永遠無法由融合產出", () => {
  let productCount = 0;
  for (let a = fusion.SPIRIT_MIN; a <= fusion.SPIRIT_MAX; a += 1) {
    for (let b = fusion.SPIRIT_MIN; b <= fusion.SPIRIT_MAX; b += 1) {
      const check = fusion.canFuse(a, b);
      if (!check.ok) continue;
      productCount += 1;
      assert.equal(
        fusion.isPrime(check.product),
        false,
        `${a}×${b}=${check.product} 竟被判為質數，違反融合鐵律`
      );
    }
  }
  assert.ok(productCount > 0, "應至少存在一組合法融合");
});

// ---- 4. canFuse 上限 ----
test("canFuse：乘積超過上限拒絕，合法乘積放行", () => {
  const over = fusion.canFuse(12, 9); // 108 > 100
  assert.equal(over.ok, false);
  assert.equal(over.product, 108);

  const ok = fusion.canFuse(3, 4);
  assert.equal(ok.ok, true);
  assert.equal(ok.product, 12);
  assert.equal(fusion.fuse(3, 4), 12);
  assert.equal(fusion.fuse(12, 9), null);
});

// ---- 5. 星屑錢包 ----
test("spendStardust：扣款成功餘額減少、餘額不足回 false 且帳本不變", () => {
  localStorage.data.clear();
  seedStardust(10); // 餘額 10（inkDays 空）
  assert.equal(fusion.stardustBalance(), 10);
  assert.equal(fusion.getStardustSpent(), 0);

  assert.equal(fusion.spendStardust(3), true);
  assert.equal(fusion.stardustBalance(), 7);
  assert.equal(fusion.getStardustSpent(), 3);

  // 餘額不足：不扣、帳本不動
  assert.equal(fusion.spendStardust(100), false);
  assert.equal(fusion.stardustBalance(), 7);
  assert.equal(fusion.getStardustSpent(), 3);
});

// ---- 6. resolveFusion ----
test("resolveFusion：猜對免費、猜錯扣 1 星屑，兩者都成功捕獲並入圖鑑", () => {
  localStorage.data.clear();
  seedStardust(10);

  const right = fusion.resolveFusion(3, 4, 12);
  assert.equal(right.ok, true);
  assert.equal(right.product, 12);
  assert.equal(right.correct, true);
  assert.equal(right.cost, 0);
  assert.ok(right.captured);
  assert.equal(fusion.ownsSpirit(12), true);
  assert.equal(fusion.getStardustSpent(), 0); // 猜對不扣

  const wrong = fusion.resolveFusion(3, 5, 99); // 正解 15
  assert.equal(wrong.ok, true);
  assert.equal(wrong.product, 15);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.cost, fusion.WRONG_GUESS_COST);
  assert.ok(wrong.captured);
  assert.equal(fusion.ownsSpirit(15), true);
  assert.equal(fusion.getStardustSpent(), fusion.WRONG_GUESS_COST); // 猜錯扣星屑
});

test("resolveFusion：不合法融合回 ok:false 不入圖鑑", () => {
  localStorage.data.clear();
  const bad = fusion.resolveFusion(12, 9, 108);
  assert.equal(bad.ok, false);
  assert.equal(fusion.ownsSpirit(108), false);
});

// ---- 7. captureSpirit ----
test("captureSpirit：新捕獲 isNew:true，重捕同一隻 isNew:false 且 count+1", () => {
  localStorage.data.clear();
  const first = fusion.captureSpirit(24);
  assert.equal(first.isNew, true);
  assert.equal(fusion.ownsSpirit(24), true);
  assert.equal(fusion.getSpiritBook()["24"].count, 1);

  const again = fusion.captureSpirit(24);
  assert.equal(again.isNew, false);
  assert.equal(fusion.getSpiritBook()["24"].count, 2);
});

test("captureSpirit：超出星界範圍回 null", () => {
  localStorage.data.clear();
  assert.equal(fusion.captureSpirit(1), null);
  assert.equal(fusion.captureSpirit(101), null);
});

// ---- 8. 裝備 ----
test("setEquippedSpirits：只留已擁有、去重、上限 EQUIP_MAX", () => {
  localStorage.data.clear();
  [12, 6, 4, 9].forEach((n) => fusion.captureSpirit(n));

  // 含未擁有(50)、重複(12)、超量——應被過濾/去重/截斷
  const equipped = fusion.setEquippedSpirits([12, 12, 6, 4, 9, 50]);
  assert.equal(equipped.length, fusion.EQUIP_MAX);
  assert.equal(new Set(equipped).size, equipped.length); // 已去重
  assert.ok(equipped.every((n) => fusion.ownsSpirit(n))); // 全為已擁有
  assert.ok(!equipped.includes(50)); // 未擁有被剔除
});

test("spiritBonusFor：加成上限 0.10、空裝備為 0", () => {
  localStorage.data.clear();
  assert.equal(fusion.spiritBonusFor([]), 0);
  // 12(6因)→0.06, 6(4因)→0.04, 4(3因)→0.03 合計 0.13，封頂 0.10
  assert.equal(fusion.spiritBonusFor([12, 6, 4]), 0.1);
});
