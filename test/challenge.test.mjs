import test from "node:test";
import assert from "node:assert/strict";
import { decodeChallenge, decodeReply, encodeChallenge, encodeReply, questionAccuracy } from "../js/challenge.js";

const catalog = Array.from({ length: 192 }, (_, i) => ({ id: `q-${i}` }));

test("五題挑戰包可編成短碼，並在相同本地題庫無損還原", () => {
  const picked = [catalog[1], catalog[17], catalog[63], catalog[128], catalog[191]];
  const code = encodeChallenge(picked, catalog);
  assert.match(code, /^BX-[0-9A-Z]{11}$/);
  assert.deepEqual(decodeChallenge(code, catalog).map((q) => q.id), picked.map((q) => q.id));
});

test("挑戰碼改一字即拒絕，避免亂碼開局", () => {
  const code = encodeChallenge(catalog.slice(0, 5), catalog);
  const bad = `${code.slice(0, -1)}${code.endsWith("Z") ? "Y" : "Z"}`;
  assert.equal(decodeChallenge(bad, catalog), null);
});

test("回擊碼只能回報原挑戰，並帶正確率與時間", () => {
  const challenge = encodeChallenge(catalog.slice(3, 8), catalog);
  const reply = encodeReply(challenge, 80, 47);
  assert.deepEqual(decodeReply(reply, challenge), { pct: 80, totalSec: 47 });
  assert.equal(decodeReply(reply, encodeChallenge(catalog.slice(8, 13), catalog)), null);
});

test("挑題時可看見自己對該題的歷史正確率", () => {
  const progress = { n1: { attempts: [
    { questionId: "q-1", correct: true },
    { questionId: "q-1", correct: false },
  ] } };
  assert.equal(questionAccuracy("q-1", progress), 0.5);
  assert.equal(questionAccuracy("q-2", progress), null);
});
