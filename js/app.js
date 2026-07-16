import { loadSkillTree, allNodes, nodeState, getNodeMastery } from "./schema.js";
import { renderSkillTree, computeOverview } from "./skilltree-ui.js";
import { buildSession } from "./quiz-loader.js";
import { renderQuestion } from "./quiz-ui.js";
import { recordAnswer, overallMasteryPct, getNodeStats } from "./scoreEngine.js";
import { updateBox } from "./leitner.js";
import { addWrongQuestion, listWrongQuestions } from "./errorbook.js";
import { evaluateBadges, getUnlockedBadges, BADGES } from "./achievements.js";
import { getPlayerName, setPlayerName, submitScore, getLeaderboard } from "./leaderboard.js";

const views = {
  home: document.getElementById("view-home"),
  quiz: document.getElementById("view-quiz"),
  dashboard: document.getElementById("view-dashboard"),
};

let tree = null;
let session = { queue: [], index: 0, node: null, streak: 0, roundCorrect: 0, roundTotal: 0 };

function showView(name) {
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === name));
}

async function goHome() {
  tree = tree ?? (await loadSkillTree());
  renderSkillTree(document.getElementById("skilltree-container"), tree, startQuiz);
  showView("home");
}

async function startQuiz(node) {
  session = { queue: await buildSession(node.id), index: 0, node, streak: 0, roundCorrect: 0, roundTotal: 0 };
  showView("quiz");
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  document.getElementById("quiz-node-name").textContent = session.node.name;
  document.getElementById("quiz-progress").textContent = `第 ${session.index + 1} / ${session.queue.length} 題`;

  if (session.index >= session.queue.length) {
    finishSession();
    return;
  }

  const question = session.queue[session.index];
  const card = renderQuestion(question, (isCorrect) => handleAnswer(question, isCorrect));
  quizArea.appendChild(card);

  const nextBtn = document.createElement("button");
  nextBtn.className = "q-next";
  nextBtn.textContent = "下一題";
  nextBtn.addEventListener("click", () => {
    session.index += 1;
    renderCurrentQuestion();
  });
  quizArea.appendChild(nextBtn);
}

function handleAnswer(question, isCorrect) {
  recordAnswer(session.node.id, question.id, isCorrect, 0);
  updateBox(question.id, isCorrect);
  session.roundTotal += 1;
  if (isCorrect) {
    session.roundCorrect += 1;
    session.streak += 1;
  } else {
    session.streak = 0;
    addWrongQuestion(session.node.id, question);
  }
}

function finishSession() {
  const overview = computeOverview(tree);
  const ctx = {
    masteredCount: overview.masteredCount,
    totalNodes: overview.totalNodes,
    lastRoundAllCorrect: session.roundTotal > 0 && session.roundCorrect === session.roundTotal && session.roundTotal >= 5,
    currentStreak: session.streak,
  };
  const newBadges = evaluateBadges(ctx);

  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const stats = getNodeStats(session.node.id);
  quizArea.appendChild(makeSummary(stats, newBadges));

  const player = getPlayerName();
  if (player) {
    const nodeIds = allNodes(tree).map((n) => n.id);
    submitScore(player, overallMasteryPct(nodeIds));
  }

  const backBtn = document.createElement("button");
  backBtn.className = "q-next";
  backBtn.textContent = "回技能樹";
  backBtn.addEventListener("click", goHome);
  quizArea.appendChild(backBtn);
}

function makeSummary(stats, newBadges) {
  const box = document.createElement("div");
  box.className = "q-summary";
  box.innerHTML = `
    <h3>本節點精熟度：${Math.round(stats.masteryPct * 100)}%</h3>
    <p>累計作答 ${stats.totalAttempts} 題，答對 ${stats.correctAttempts} 題</p>
  `;
  if (newBadges.length > 0) {
    const badgeList = document.createElement("div");
    badgeList.className = "badge-unlock";
    badgeList.innerHTML = "🏅 新徽章解鎖：" + newBadges.map((b) => b.name).join("、");
    box.appendChild(badgeList);
  }
  return box;
}

async function showDashboard() {
  tree = tree ?? (await loadSkillTree());
  const overview = computeOverview(tree);
  const unlocked = new Set(getUnlockedBadges());

  const el = document.getElementById("dashboard-content");
  el.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "dash-summary";
  summary.innerHTML = `<h3>整體精熟進度</h3><p>${overview.masteredCount} / ${overview.totalNodes} 個學習點已精熟</p>`;
  el.appendChild(summary);

  const badgeSection = document.createElement("div");
  badgeSection.className = "dash-badges";
  badgeSection.innerHTML = "<h3>成就徽章</h3>";
  BADGES.forEach((b) => {
    const row = document.createElement("div");
    row.className = "badge-row" + (unlocked.has(b.id) ? " got" : "");
    row.textContent = `${unlocked.has(b.id) ? "🏅" : "⬜"} ${b.name} — ${b.desc}`;
    badgeSection.appendChild(row);
  });
  el.appendChild(badgeSection);

  const errorSection = document.createElement("div");
  errorSection.className = "dash-errorbook";
  const wrongList = listWrongQuestions();
  errorSection.innerHTML = `<h3>錯題本（${wrongList.length} 題）</h3>`;
  wrongList.slice(0, 10).forEach((entry) => {
    const q = entry.question;
    const stem = q.stem || q.statement || q.problem || q.question;
    const row = document.createElement("div");
    row.className = "errorbook-row";
    row.textContent = stem;
    errorSection.appendChild(row);
  });
  el.appendChild(errorSection);

  const boardSection = document.createElement("div");
  boardSection.className = "dash-leaderboard";
  boardSection.innerHTML = "<h3>班級排行榜</h3>";
  getLeaderboard().forEach((row, idx) => {
    const line = document.createElement("div");
    line.className = "leaderboard-row";
    line.textContent = `${idx + 1}. ${row.name} — ${Math.round(row.masteryPct * 100)}%`;
    boardSection.appendChild(line);
  });
  el.appendChild(boardSection);

  el.appendChild(makeNameEditor());

  showView("dashboard");
}

function makeNameEditor() {
  const box = document.createElement("div");
  box.className = "dash-name";
  const label = document.createElement("label");
  label.textContent = "排行榜暱稱：";
  const input = document.createElement("input");
  input.type = "text";
  input.value = getPlayerName() ?? "";
  input.placeholder = "輸入你的名字";
  input.addEventListener("change", () => {
    if (input.value.trim()) setPlayerName(input.value.trim());
  });
  box.appendChild(label);
  box.appendChild(input);
  return box;
}

document.getElementById("nav-home").addEventListener("click", goHome);
document.getElementById("nav-dashboard").addEventListener("click", showDashboard);

if (!getPlayerName()) setPlayerName("同學");
goHome();
