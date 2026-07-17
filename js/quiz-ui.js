function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function autoAdvanceDelay(isCorrect) {
  return isCorrect ? 800 : null;
}

function renderMedia(media, className) {
  if (!media?.src) return null;
  const figure = el("figure", className);
  const img = document.createElement("img");
  img.src = media.src;
  img.alt = media.alt ?? "";
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 1536;
  img.height = 1024;
  img.addEventListener("error", () => {
    figure.hidden = true;
  }, { once: true });
  figure.appendChild(img);
  return figure;
}

function renderChoiceList(container, options, onPick) {
  const list = el("div", "q-options");
  options.forEach((opt, idx) => {
    const btn = el("button", "q-option", opt);
    btn.setAttribute?.("aria-label", `選項${String.fromCharCode(65 + idx)}，${opt}`);
    btn.addEventListener("click", () => onPick(idx, btn, list));
    list.appendChild(btn);
  });
  container.appendChild(list);
}

// 選項打散：回傳打散後的選項與新正解索引（正解不可固定在第一位）
function shuffleOptions(options, answerIdx) {
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    options: order.map((i) => options[i]),
    answer: order.indexOf(answerIdx),
  };
}

function markResult(list, btn, isCorrect, correctBtn) {
  [...list.children].forEach((child) => (child.disabled = true));
  btn.classList.add(isCorrect ? "q-correct" : "q-wrong");
  if (!isCorrect && correctBtn) correctBtn.classList.add("q-correct");
  const addMark = (button, mark, state) => {
    const index = [...list.children].indexOf(button);
    const text = button.textContent;
    const symbol = el("span", "q-result-mark", mark);
    symbol.setAttribute?.("aria-hidden", "true");
    button.appendChild(symbol);
    button.setAttribute?.("aria-label", `選項${String.fromCharCode(65 + index)}，${state}，${text}`);
  };
  if (isCorrect) addMark(btn, "✓", "正解");
  else {
    addMark(btn, "✕", "作答錯誤");
    if (correctBtn) addMark(correctBtn, "✓", "正解");
  }
}

function removeAfterAnimation(node, fallbackMs) {
  node.addEventListener("animationend", () => node.remove(), { once: true });
  setTimeout(() => node.remove(), fallbackMs);
}

// 答對彩鉛屑噴發：從正解按鈕位置隨機噴 12 顆（純 DOM 粒子，700ms 自毀）
const SHAVING_COLORS = ["var(--cp-red)", "var(--cp-green)", "var(--cp-blue)", "var(--cp-orange)", "var(--cp-yellow)"];
function burstShavings(wrap, originEl, count = 12) {
  const wrapRect = wrap.getBoundingClientRect();
  const rect = originEl?.getBoundingClientRect() ?? wrapRect;
  const ox = rect.left - wrapRect.left + rect.width / 2;
  const oy = rect.top - wrapRect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const p = el("span", "pshaving", ["✦", "✧", "⋆", "·"][i % 4]);
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 70;
    p.style.left = `${ox}px`;
    p.style.top = `${oy}px`;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist - 30}px`);
    p.style.setProperty("--rot", `${(Math.random() - 0.5) * 540}deg`);
    p.style.setProperty("--sc", `${0.6 + Math.random() * 0.9}`);
    p.style.color = SHAVING_COLORS[i % SHAVING_COLORS.length];
    wrap.appendChild(p);
    removeAfterAnimation(p, 800);
  }
}

function addMascotReaction(wrap, mascotVariant, isCorrect) {
  if (!mascotVariant) return;
  const box = el("div", `q-mascot-react react-${isCorrect ? "happy" : "sad"}`);
  const img = document.createElement("img");
  img.src = `assets/mascot/${mascotVariant}-${isCorrect ? "happy" : "sad"}.png`;
  img.alt = "駐塔導師反應";
  img.onerror = () => { box.style.display = "none"; };
  box.appendChild(img);
  wrap.style.position = "relative";
  wrap.appendChild(box);
}

export function renderQuestion(question, onAnswered, mascotVariant, opts = {}) {
  const wrap = el("div", `q-card type-${question.type}`);
  if (opts.encounter) {
    wrap.classList.add("q-encounter");
    wrap.appendChild(el("div", "encounter-banner", "✦ 魔法陣突現！答對有特別徽記 ✦"));
  }
  const typeLabel = {
    "basic-mastery": "基本精通題",
    "concept-id": "概念辨識題",
    "error-diagnosis": "錯誤診斷題",
    "context-application": "情境應用題",
  }[question.type];
  wrap.appendChild(el("div", "q-type", typeLabel));
  const media = renderMedia(question.media, "q-media");
  if (media) wrap.appendChild(media);

  const explain = el("div", "q-explain", question.explanation);
  explain.style.display = "none";

  const handleAnswered = (isCorrect, answerMeta) => {
    explain.style.display = "block";
    addMascotReaction(wrap, mascotVariant, isCorrect);
    if (isCorrect) {
      burstShavings(wrap, wrap.querySelector(".q-option.q-correct"));
    }
    if (opts.encounter) {
      if (isCorrect) {
        wrap.appendChild(el("div", "encounter-stamp", "✦ 星光徽記"));
        for (let i = 0; i < 8; i++) {
          const spark = el("span", "spark", "✦");
          spark.style.animationDelay = `${i * 0.08}s`;
          spark.style.right = `${20 + Math.random() * 120}px`;
          spark.style.bottom = `${20 + Math.random() * 60}px`;
          spark.style.setProperty("--spark-dx", `${(Math.random() - 0.5) * 60}px`);
          spark.style.fontSize = `${0.8 + Math.random() * 0.8}rem`;
          wrap.appendChild(spark);
          removeAfterAnimation(spark, 1400);
        }
      } else {
        wrap.querySelector(".encounter-banner")?.classList.add("banner-fade");
      }
    }
    onAnswered(isCorrect, { encounter: !!opts.encounter, ...answerMeta });
  };

  if (question.type === "basic-mastery") {
    wrap.appendChild(el("div", "q-stem", question.stem));
    const view = shuffleOptions(question.options, question.answer);
    renderChoiceList(wrap, view.options, (idx, btn, list) => {
      const isCorrect = idx === view.answer;
      markResult(list, btn, isCorrect, list.children[view.answer]);
      handleAnswered(isCorrect, {
        correctLabel: String.fromCharCode(65 + view.answer),
        correctText: view.options[view.answer],
      });
    });
  }

  if (question.type === "concept-id") {
    wrap.appendChild(el("div", "q-stem", question.statement));
    renderChoiceList(wrap, ["正確", "錯誤"], (idx, btn, list) => {
      const pickedTrue = idx === 0;
      const isCorrect = pickedTrue === question.correctAnswer;
      const correctIdx = question.correctAnswer ? 0 : 1;
      markResult(list, btn, isCorrect, list.children[correctIdx]);
      handleAnswered(isCorrect, {
        correctLabel: String.fromCharCode(65 + correctIdx),
        correctText: correctIdx === 0 ? "正確" : "錯誤",
      });
    });
  }

  if (question.type === "error-diagnosis") {
    wrap.appendChild(el("div", "q-stem", question.problem));
    wrap.appendChild(el("div", "q-wrong-solution", question.wrongSolution));
    const view = shuffleOptions(question.errorOptions, question.correctErrorIndex);
    renderChoiceList(wrap, view.options, (idx, btn, list) => {
      const isCorrect = idx === view.answer;
      markResult(list, btn, isCorrect, list.children[view.answer]);
      handleAnswered(isCorrect, {
        correctLabel: String.fromCharCode(65 + view.answer),
        correctText: view.options[view.answer],
      });
    });
  }

  if (question.type === "context-application") {
    wrap.appendChild(el("div", "q-scenario", question.scenario));
    wrap.appendChild(el("div", "q-stem", question.question));
    const view = shuffleOptions(question.options, question.answer);
    renderChoiceList(wrap, view.options, (idx, btn, list) => {
      const isCorrect = idx === view.answer;
      markResult(list, btn, isCorrect, list.children[view.answer]);
      handleAnswered(isCorrect, {
        correctLabel: String.fromCharCode(65 + view.answer),
        correctText: view.options[view.answer],
      });
    });
  }

  wrap.appendChild(explain);
  return wrap;
}
