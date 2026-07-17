import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyAccessibilitySettings, getAccessibilitySettings, setAccessibilitySetting } from "../js/accessibility.js";

test("輔助設定三項狀態可持久化並套用字級與視覺效果開關", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  setAccessibilitySetting("fontSize", "large");
  setAccessibilitySetting("sprintWarning", false);
  setAccessibilitySetting("comboBreakEffect", false);
  assert.deepEqual(getAccessibilitySettings(), { fontSize: "large", sprintWarning: false, comboBreakEffect: false });
  const root = { style: { setProperty(name, value) { this[name] = value; } }, dataset: {} };
  applyAccessibilitySettings(root);
  assert.equal(root.style["--base-font-size"], "18px");
  assert.equal(root.dataset.sprintWarning, "off");
  assert.equal(root.dataset.comboBreakEffect, "off");
});

test("首頁提供可發現的輔助設定，倒數與連詠中斷效果遵守開關", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../css/style.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<summary>輔助設定<\/summary>/);
  assert.match(html, /標準[\s\S]*大[\s\S]*特大/);
  assert.match(app, /settings\.sprintWarning[\s\S]*timer-hot/);
  assert.match(app, /settings\.comboBreakEffect[\s\S]*combo-break/);
  assert.match(css, /--base-font-size/);
  assert.match(css, /data-sprint-warning="off"/);
  assert.match(css, /data-combo-break-effect="off"/);
});
