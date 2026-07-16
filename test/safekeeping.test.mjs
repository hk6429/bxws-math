import test from "node:test";
import assert from "node:assert/strict";
import { manuscriptDustStatus } from "../js/collection.js";
import { exportNamespace, importNamespace } from "../js/store.js";

const DAY = 86400000;

test("落款手稿連續逾期三天才蒙塵，不降階也不刪資料", () => {
  const now = 20 * DAY;
  const collection = { n1: { tier: 2 } };
  const leitner = { q1: { box: 2, lastSeen: 10 * DAY } }; // box 2 隔 1 天，已逾期 9 天
  const status = manuscriptDustStatus("n1", collection, leitner, ["q1"], null, now);
  assert.equal(status.dusty, true);
  assert.equal(collection.n1.tier, 2);
  assert.deepEqual(leitner.q1, { box: 2, lastSeen: 10 * DAY });
});

test("蒙塵後補三題墨即恢復明亮", () => {
  const now = 20 * DAY;
  const status = manuscriptDustStatus(
    "n1",
    { n1: { tier: 2 } },
    { q1: { box: 2, lastSeen: 10 * DAY } },
    ["q1"],
    { count: 3, at: now },
    now
  );
  assert.equal(status.dusty, false);
  assert.equal(status.careCount, 3);
});

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
}

test("旅行皮箱只打包 bxws namespace，並可完整匯入另一裝置", () => {
  const source = fakeStorage({ "bxws:progress": '{"n1":{"masteryPct":1}}', "other:secret": "no" });
  const bundle = exportNamespace(source);
  assert.deepEqual(Object.keys(bundle.data), ["bxws:progress"]);

  const target = fakeStorage();
  const count = importNamespace(bundle, target);
  assert.equal(count, 1);
  assert.equal(target.getItem("bxws:progress"), '{"n1":{"masteryPct":1}}');
  assert.equal(target.getItem("other:secret"), null);
});
