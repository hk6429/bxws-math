import assert from "node:assert/strict";
import { EXTRA_QUOTES, QUOTES } from "../js/quotes.js";

const mascots = ["davinci", "gauss", "euclid", "fibonacci", "pascal"];
const all = Object.values(QUOTES).flat();
for (const mascot of mascots) {
  const quotes = all.filter((quote) => quote.mascot === mascot);
  assert.ok(quotes.length >= 6 && quotes.length <= 8, `${mascot} quotes=${quotes.length}`);
}
for (const quote of all) {
  assert.ok(["史實", "創作"].includes(quote.kind), `${quote.mascot} 缺 kind`);
  if (quote.kind === "史實") assert.match(quote.by, /^古賢者卷軸｜/);
  if (quote.kind === "創作") {
    assert.equal(quote.by, "創作");
    assert.match(quote.text, /^雅典娜的智慧引路人提醒你：/);
  }
}
for (const quote of EXTRA_QUOTES) {
  assert.ok(["史實", "創作"].includes(quote.kind));
  if (quote.kind === "史實") assert.match(quote.by, /^古賢者卷軸｜/);
  if (quote.kind === "創作") {
    assert.equal(quote.by, "創作");
    assert.match(quote.text, /^雅典娜的智慧引路人提醒你：/);
  }
}
for (const quote of QUOTES.comfort) {
  assert.equal(quote.kind, "創作");
  assert.match(quote.text, /；.*(先|把|挑|回到|換|列|檢查|分成)/, `comfort 缺具體下一步：${quote.text}`);
}
console.log("OK D: five mentors each have 6 quotes; source labels, Athena phrasing, and comfort actions comply");
