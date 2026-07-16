function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderChoiceList(container, options, onPick) {
  const list = el("div", "q-options");
  options.forEach((opt, idx) => {
    const btn = el("button", "q-option", opt);
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
}

function addMascotReaction(wrap, mascotVariant, isCorrect) {
  if (!mascotVariant) return;
  const box = el("div", `q-mascot-react react-${isCorrect ? "happy" : "sad"}`);
  const img = document.createElement("img");
  img.src = `assets/mascot/${mascotVariant}-${isCorrect ? "happy" : "sad"}.png`;
  img.alt = "大師吉祥物反應";
  img.onerror = () => { box.style.display = "none"; };
  box.appendChild(img);
  wrap.style.position = "relative";
  wrap.appendChild(box);
}

export function renderQuestion(question, onAnswered, mascotVariant) {
  const wrap = el("div", `q-card type-${question.type}`);
  const typeLabel = {
    "basic-mastery": "基本精熟題",
    "concept-id": "概念辨識題",
    "error-diagnosis": "錯誤診斷題",
    "context-application": "情境應用題",
  }[question.type];
  wrap.appendChild(el("div", "q-type", typeLabel));

  const explain = el("div", "q-explain", question.explanation);
  explain.style.display = "none";

  const handleAnswered = (isCorrect) => {
    explain.style.display = "block";
    addMascotReaction(wrap, mascotVariant, isCorrect);
    onAnswered(isCorrect);
  };

  if (question.type === "basic-mastery") {
    wrap.appendChild(el("div", "q-stem", question.stem));
    const view = shuffleOptions(question.options, question.answer);
    renderChoiceList(wrap, view.options, (idx, btn, list) => {
      const isCorrect = idx === view.answer;
      markResult(list, btn, isCorrect, list.children[view.answer]);
      handleAnswered(isCorrect);
    });
  }

  if (question.type === "concept-id") {
    wrap.appendChild(el("div", "q-stem", question.statement));
    renderChoiceList(wrap, ["正確", "錯誤"], (idx, btn, list) => {
      const pickedTrue = idx === 0;
      const isCorrect = pickedTrue === question.correctAnswer;
      const correctIdx = question.correctAnswer ? 0 : 1;
      markResult(list, btn, isCorrect, list.children[correctIdx]);
      handleAnswered(isCorrect);
    });
  }

  if (question.type === "error-diagnosis") {
    wrap.appendChild(el("div", "q-stem", question.problem));
    wrap.appendChild(el("div", "q-wrong-solution", question.wrongSolution));
    const view = shuffleOptions(question.errorOptions, question.correctErrorIndex);
    renderChoiceList(wrap, view.options, (idx, btn, list) => {
      const isCorrect = idx === view.answer;
      markResult(list, btn, isCorrect, list.children[view.answer]);
      handleAnswered(isCorrect);
    });
  }

  if (question.type === "context-application") {
    wrap.appendChild(el("div", "q-scenario", question.scenario));
    wrap.appendChild(el("div", "q-stem", question.question));
    const view = shuffleOptions(question.options, question.answer);
    renderChoiceList(wrap, view.options, (idx, btn, list) => {
      const isCorrect = idx === view.answer;
      markResult(list, btn, isCorrect, list.children[view.answer]);
      handleAnswered(isCorrect);
    });
  }

  wrap.appendChild(explain);
  return wrap;
}
