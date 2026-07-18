import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map((part) => Number.parseInt(part, 16));
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("教師連結與 radio 採用全站導覽和金色 token", async () => {
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");
  assert.match(css, /\.topbar nav \.teacher-link/);
  assert.match(css, /input\[type="radio"\]\s*\{\s*accent-color:\s*var\(--star-gold\)/);
});

test("窄螢幕導覽不斷詞並可橫向捲動", async () => {
  const css = await readFile(new URL("../css/style.css", import.meta.url), "utf8");
  const mobile = css.slice(css.lastIndexOf("@media (max-width: 600px)"));
  assert.match(mobile, /\.topbar nav\s*\{[\s\S]*flex-wrap:\s*nowrap[\s\S]*overflow-x:\s*auto/);
  assert.match(mobile, /white-space:\s*nowrap/);
});

test("跨平台正體字型與 CSP 設定完整", async () => {
  const [html, css, headers, vercel] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
    readFile(new URL("../_headers", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=LXGW\+WenKai\+TC/);
  assert.match(css, /--font-hand:\s*"LXGW WenKai TC"/);
  assert.match(css, /--font-sans:\s*"LXGW WenKai TC"/);
  for (const policy of [headers, vercel]) {
    assert.match(policy, /style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    assert.match(policy, /font-src[^;]*https:\/\/fonts\.gstatic\.com/);
  }
});

test("三組一般文字配色皆達 WCAG AA 4.5:1", () => {
  assert.ok(contrast("#7A3E00", "#FFE2B8") >= 4.5);
  assert.ok(contrast("#5A5044", "#FAF4E0") >= 4.5);
  assert.ok(contrast("#8A4200", "#FAF4E0") >= 4.5);
});

test("神話印記圖鑑的三種稀有度有不同卡框", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /stamp-owned[\s\S]*cardRevealClass\(s\.rarity\)/);
  assert.match(css, /\.stamp-cell\.stamp-owned\.reveal-common/);
  assert.match(css, /\.stamp-cell\.stamp-owned\.reveal-rare/);
  assert.match(css, /\.stamp-cell\.stamp-owned\.reveal-legendary/);
});
