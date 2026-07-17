import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.className = "";
    this.style = {};
    this.listeners = new Map();
    this.hidden = false;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ type, target: this });
  }
}

globalThis.document = {
  createElement: (tagName) => new FakeElement(tagName),
  addEventListener: () => {},
  removeEventListener: () => {},
};

const { renderQuestion } = await import("../js/quiz-ui.js");

function basicQuestion(media) {
  return {
    type: "basic-mastery",
    stem: "請看圖作答",
    options: ["A", "B"],
    answer: 0,
    explanation: "解說",
    ...(media ? { media } : {}),
  };
}

test("題目媒體位於題型標籤後、題幹前，並具備懶載入與 alt", () => {
  const card = renderQuestion(
    basicQuestion({ src: "assets/geometry/example.webp", alt: "幾何圖例" }),
    () => {},
  );

  assert.deepEqual(card.children.slice(0, 3).map((child) => child.className), [
    "q-type", "q-media", "q-stem",
  ]);
  const img = card.children[1].children[0];
  assert.equal(img.src, "assets/geometry/example.webp");
  assert.equal(img.alt, "幾何圖例");
  assert.equal(img.loading, "lazy");
  assert.equal(img.decoding, "async");
  assert.equal(img.width, 1536);
  assert.equal(img.height, 1024);
});

test("題目圖片載入失敗會隱藏 figure，純文字題仍有題幹與選項", () => {
  const withMedia = renderQuestion(
    basicQuestion({ src: "missing.webp", alt: "" }),
    () => {},
  );
  const figure = withMedia.children[1];
  figure.children[0].dispatch("error");
  assert.equal(figure.hidden, true);

  const textOnly = renderQuestion(basicQuestion(), () => {});
  assert.equal(textOnly.children.some((child) => child.className === "q-media"), false);
  assert.ok(textOnly.children.some((child) => child.className === "q-stem"));
  assert.ok(textOnly.children.some((child) => child.className === "q-options"));
});

test("節點教學圖在心法頁建立，並在策略卡前插入", async () => {
  const source = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const mediaStart = source.indexOf("if (node.lessonMedia?.src)");
  const strategyStart = source.indexOf("const lastUsed", mediaStart);
  assert.ok(mediaStart > source.indexOf("function startQuiz(node)"));
  assert.ok(strategyStart > mediaStart);
  assert.match(source.slice(mediaStart, strategyStart), /loading = "lazy"/);
  assert.match(source.slice(mediaStart, strategyStart), /width = 1536/);
  assert.match(source.slice(mediaStart, strategyStart), /height = 1024/);
  assert.match(source.slice(mediaStart, strategyStart), /decoding = "async"/);
  assert.match(source.slice(mediaStart, strategyStart), /figure\.hidden = true/);
});
