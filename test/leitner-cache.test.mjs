import test from "node:test";
import assert from "node:assert/strict";

let reads = 0;
let written = null;
globalThis.localStorage = {
  getItem() { reads += 1; return '{"q1":{"box":2,"lastSeen":0,"nodeId":"n1"}}'; },
  setItem(key, value) { written = [key, JSON.parse(value)]; },
};

const { getBoxState, updateBox } = await import("../js/leitner.js");

test("Leitner 狀態只從 localStorage 載入一次並同步更新記憶體快取", () => {
  assert.equal(getBoxState().q1.box, 2);
  assert.equal(getBoxState().q1.box, 2);
  assert.equal(reads, 1);
  updateBox("q1", true, "n1");
  assert.equal(getBoxState().q1.box, 3);
  assert.equal(written[0], "bxws:leitner");
  assert.equal(written[1].q1.nodeId, "n1");
});
