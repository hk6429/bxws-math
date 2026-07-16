import { store } from "./store.js";

export function addWrongQuestion(nodeId, question) {
  const book = store.read("errorbook", {});
  book[question.id] = { nodeId, question, missedAt: Date.now() };
  store.write("errorbook", book);
}

export function removeWrongQuestion(questionId) {
  const book = store.read("errorbook", {});
  delete book[questionId];
  store.write("errorbook", book);
}

export function listWrongQuestions() {
  const book = store.read("errorbook", {});
  return Object.values(book).sort((a, b) => b.missedAt - a.missedAt);
}
