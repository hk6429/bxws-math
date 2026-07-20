import test from "node:test";
import assert from "node:assert/strict";
import {
  isMarketOpen, nextMarketText, reconcileEconomy,
  MARKET_MIN_PRICE, MARKET_MAX_PRICE, MAX_ACTIVE_LISTINGS, MAX_BUYS_PER_DAY,
} from "../js/market.js";

test("週五開市，其他天休市", () => {
  assert.equal(isMarketOpen(new Date(2026, 6, 17)), true, "2026-07-17 是週五");
  assert.equal(isMarketOpen(new Date(2026, 6, 20)), false, "週一休市");
  assert.equal(nextMarketText(new Date(2026, 6, 17)), "赫米斯市集日・開市中");
  assert.equal(nextMarketText(new Date(2026, 6, 20)), "下次開市：本週五");
});

test("經濟對帳：P2P 交易是重分配、不通膨（買方付＝賣方收）", () => {
  // 賺 100，NPC 花 30，P2P 買別人 20、賣出得 15 → 餘額 = 100-30-20+15 = 65
  const r = reconcileEconomy({ earned: 100, npcSpent: 30, p2pBought: 20, p2pSold: 15 });
  assert.equal(r.balance, 65);
  assert.equal(r.faucet, 100);
  assert.equal(r.sinks, 50);
  assert.equal(r.inflow, 15);

  // 全班加總：所有人的 p2pBought 總和 === 所有人的 p2pSold 總和（星屑守恆），
  // 故班級層級 P2P 淨額為 0，不新增星屑。
  const classA = reconcileEconomy({ earned: 0, p2pBought: 20 }); // 買方餘額 -20
  const classB = reconcileEconomy({ earned: 0, p2pSold: 20 });   // 賣方餘額 +20
  assert.equal(classA.balance + classB.balance, 0, "A 的 -20 與 B 的 +20 相抵，班級星屑守恆");
});

test("經濟對帳：預設參數安全", () => {
  assert.deepEqual(reconcileEconomy(), { balance: 0, faucet: 0, sinks: 0, inflow: 0 });
});

test("市集常數在合理範圍", () => {
  assert.ok(MARKET_MIN_PRICE >= 1 && MARKET_MIN_PRICE < MARKET_MAX_PRICE);
  assert.equal(MARKET_MAX_PRICE, 100);
  assert.equal(MAX_ACTIVE_LISTINGS, 3);
  assert.equal(MAX_BUYS_PER_DAY, 3);
});
