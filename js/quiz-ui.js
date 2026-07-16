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
  img.alt = "數字精靈反應";
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
    renderChoiceList(wrap, question.options, (idx, btn, list) => {
      const isCorrect = idx === question.answer;
      markResult(list, btn, isCorrect, list.children[question.answer]);
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
    renderChoiceList(wrap, question.errorOptions, (idx, btn, list) => {
      const isCorrect = idx === question.correctErrorIndex;
      markResult(list, btn, isCorrect, list.children[question.correctErrorIndex]);
      handleAnswered(isCorrect);
    });
  }

  if (question.type === "context-application") {
    wrap.appendChild(el("div", "q-scenario", question.scenario));
    wrap.appendChild(el("div", "q-stem", question.question));
    renderChoiceList(wrap, question.options, (idx, btn, list) => {
      const isCorrect = idx === question.answer;
      markResult(list, btn, isCorrect, list.children[question.answer]);
      handleAnswered(isCorrect);
    });
  }

  wrap.appendChild(explain);
  return wrap;
}
