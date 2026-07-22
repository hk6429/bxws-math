import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("星靈圖鑑只為已收服星靈提供名片下載入口", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const codexBlock = app.slice(app.indexOf("function renderCodexTab"), app.indexOf("function renderEquipTab"));
  assert.match(codexBlock, /className = "spirit-card-download"/);
  assert.match(codexBlock, /downloadSpiritCard\(n/);
  const lockedBranch = codexBlock.slice(codexBlock.indexOf("} else {"), codexBlock.indexOf("grid.appendChild(cell)"));
  assert.doesNotMatch(lockedBranch, /downloadSpiritCard/);
});

test("星靈名片沿用 800×460 羊皮卷 canvas 並下載 PNG", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const cardBlock = app.slice(app.indexOf("function downloadSpiritCard"), app.indexOf("function renderEquipTab"));
  assert.match(cardBlock, /const W = 800, H = 460/);
  assert.match(cardBlock, /canvas\.width = W/);
  assert.match(cardBlock, /canvas\.height = H/);
  assert.match(cardBlock, /data\.name/);
  assert.match(cardBlock, /data\.factorization/);
  assert.match(cardBlock, /data\.rarity/);
  assert.match(cardBlock, /data\.bonusPct/);
  assert.match(cardBlock, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(cardBlock, /a\.download = `步學吾數星靈名片-/);
  assert.match(cardBlock, /img\.onerror = finish/);
});

test("星靈名片入口有可辨識標籤且不撐破圖鑑格", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /download\.setAttribute\("aria-label", `下載\$\{spiritName\(n\)\}星靈名片`\)/);
  assert.match(css, /\.codex-cell\.owned \{ position: relative; \}/);
  assert.match(css, /\.spirit-card-download \{/);
  assert.match(css, /position: absolute/);
});
