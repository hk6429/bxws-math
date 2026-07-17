import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, html, app, skilltreeUi, tree] = await Promise.all([
  readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../js/skilltree-ui.js", import.meta.url), "utf8"),
  readFile(new URL("../data/skilltree.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("手機 topbar、卷軸卡與教學泡泡具有窄螢幕覆寫", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 600px)"));
  assert.match(mobile, /flex-direction:\s*column/);
  assert.match(mobile, /main\s*\{\s*padding:\s*8px/);
  assert.match(mobile, /padding-left:\s*14px/);
  assert.match(mobile, /left:\s*6px/);
  assert.match(mobile, /\.tip-bubble[\s\S]*white-space:\s*nowrap/);
});

test("觸控、iOS 字級、overscroll 與行動版 SVG 降級規則存在", () => {
  assert.match(css, /input, select, textarea, button\s*\{\s*font:\s*inherit/);
  assert.match(css, /\.challenge-creator select\s*\{\s*font-size:\s*1rem/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.map-path, \.node-body\s*\{\s*filter:\s*none !important/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(skilltreeUi, /width < 600 \? 30 : MAX_BG_STARS/);
  assert.match(skilltreeUi, /pos\.y < 150/);
  assert.match(css, /\.lock-tap-tip-below/);
});

test("HTML 設有安全區、canonical、自架計數器與 modulepreload", () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /rel="canonical" href="https:\/\/bxws-math\.vercel\.app\/"/);
  assert.equal((html.match(/rel="modulepreload"/g) ?? []).length, 6);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /pointer-events:none/);
  assert.match(html, /bottom:calc\(14px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /src="js\/vendor\/count\.js"/);
  assert.doesNotMatch(html, /src="\/\/gc\.zgo\.at/);
});

test("畫面切換、作答流程與計時器具有捲動及清理管理", () => {
  assert.match(app, /window\.scrollTo\(0, 0\)/);
  assert.match(app, /card\.scrollIntoView\(\{ block: "start"/);
  assert.match(app, /nextBtnEl\?\.scrollIntoView\(\{ block: "nearest", behavior: "smooth" \}\)/);
  assert.match(app, /pendingTimers\.forEach\(clearTimeout\)/);
  assert.match(app, /scheduleTimer\(\(\) => sfx\.star/);
});

test("代碼輸入具有行動鍵盤屬性、貼上按鈕與舊格式提示", () => {
  assert.match(app, /input\.autocapitalize = "characters"/);
  assert.match(app, /input\.autocomplete = "off"/);
  assert.match(app, /input\.spellcheck = false/);
  assert.match(app, /navigator\.clipboard\.readText\(\)/);
  assert.match(app, /button\.textContent = "📋 貼上"/);
  assert.match(app, /格式太舊/);
});

test("暱稱、bestStreak 與非官方網域警示已硬化", () => {
  assert.match(app, /input\.maxLength = 12/);
  assert.match(app, /slice\(0, 12\)\.replace\(\/\[\\\/:\*\?"<>\|\\n\\r\]\/g, ""\)/);
  assert.ok((app.match(/Number\(store\.read\("bestStreak", 0\)\)/g) ?? []).length >= 2);
  assert.match(app, /allowedHosts = new Set/);
  assert.match(app, /clone-warning/);
});

test("題目名稱與工作室動態資料以 textContent 組裝", () => {
  assert.match(app, /questionText\.textContent = questionLabel\(question\)/);
  assert.match(app, /roomTitle\.textContent = room\.title/);
  assert.match(app, /roomStage\.textContent = stage\.label/);
  assert.doesNotMatch(app, /copy\.innerHTML = `<strong>\$\{questionLabel/);
});

test("技能樹只引用現有的 davinci 與 gauss 吉祥物族系", () => {
  assert.deepEqual(new Set(Object.values(tree.strandVisuals).map((item) => item.mascot)), new Set(["davinci", "gauss"]));
  assert.match(app, /preloadMascot\(session\.mascot\)/);
});
