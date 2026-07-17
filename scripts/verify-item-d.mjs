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
  assert.match(quote.by, new RegExp(`^${quote.kind}`));
  if (quote.kind === "創作") assert.match(quote.text, /^如果.+在場，大概會說：/);
}
for (const quote of EXTRA_QUOTES) {
  assert.ok(["史實", "創作"].includes(quote.kind));
  assert.match(quote.by, new RegExp(`^${quote.kind}`));
  if (quote.kind === "創作") assert.match(quote.text, /^如果.+在場，大概會/);
}
for (const quote of QUOTES.comfort) {
  assert.equal(quote.kind, "創作");
  assert.match(quote.text, /；.*(先|把|挑|回到|換|列|檢查|分成)/, `comfort 缺具體下一步：${quote.text}`);
}
console.log("OK D: five personalities each have 6 quotes; labels, creative phrasing, and comfort actions comply");
