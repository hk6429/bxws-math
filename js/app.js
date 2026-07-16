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
let session = { queue: [], index: 0, node: null, mascot: null, streak: 0, roundCorrect: 0, roundTotal: 0 };

function showView(name) {
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === name));
}

function mascotVariantFor(nodeId) {
  const full = allNodes(tree).find((n) => n.id === nodeId);
  if (!full) return null;
  return tree.strandVisuals?.[full.strandId]?.mascot ?? null;
}

async function goHome() {
  tree = tree ?? (await loadSkillTree());
  renderSkillTree(document.getElementById("skilltree-container"), tree, startQuiz);
  showView("home");
  maybeShowOnboardingTip();
}

function maybeShowOnboardingTip() {
  if (sessionStorage.getItem("bxws:seenTip")) return;
  const root = document.getElementById("tip-bubble-root");
  const box = document.createElement("div");
  box.className = "tip-bubble";
  box.innerHTML = `數字精靈在等你！點一下發亮的節點開始第一場挑戰吧。<br /><button>知道了</button>`;
  box.querySelector("button").addEventListener("click", () => {
    box.remove();
    sessionStorage.setItem("bxws:seenTip", "1");
  });
  root.appendChild(box);
}

async function startQuiz(node) {
  session = {
    queue: await buildSession(node.id),
    index: 0,
    node,
    mascot: mascotVariantFor(node.id),
    streak: 0,
    roundCorrect: 0,
    roundTotal: 0,
  };
  showView("quiz");
  renderCurrentQuestion();
}

function renderProgressBar() {
  const bar = document.getElementById("quiz-progressbar");
  bar.innerHTML = "";
  session.queue.forEach((_, idx) => {
    const seg = document.createElement("div");
    seg.className = "seg" + (idx < session.index ? " filled" : "");
    bar.appendChild(seg);
  });
}

function renderStreakBadge() {
  const el = document.getElementById("quiz-streak");
  el.innerHTML = "";
  if (session.streak >= 3) {
    const badge = document.createElement("span");
    badge.className = "streak-badge";
    badge.textContent = `🔥 連對 ${session.streak}`;
    el.appendChild(badge);
  }
}

function renderCurrentQuestion() {
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  document.getElementById("quiz-node-name").textContent = session.node.name;
  renderProgressBar();
  renderStreakBadge();

  if (session.index >= session.queue.length) {
    finishSession();
    return;
  }

  const question = session.queue[session.index];
  const card = renderQuestion(question, (isCorrect) => handleAnswer(question, isCorrect), session.mascot);
  if (session.streak >= 3) card.classList.add("streak-active");
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
  renderStreakBadge();
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

  document.getElementById("quiz-streak").innerHTML = "";
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

function roundStars(roundTotal, roundCorrect) {
  if (roundTotal === 0) return 0;
  const pct = roundCorrect / roundTotal;
  if (pct >= 0.95) return 3;
  if (pct >= 0.8) return 2;
  if (pct >= 0.6) return 1;
  return 0;
}

function makeSummary(stats, newBadges) {
  const box = document.createElement("div");
  box.className = "q-summary";

  const stars = roundStars(session.roundTotal, session.roundCorrect);
  const mascotState = stars >= 2 ? "celebrate" : stars >= 1 ? "happy" : "idle";
  if (session.mascot) {
    const mascotBox = document.createElement("div");
    mascotBox.className = "summary-mascot";
    const img = document.createElement("img");
    img.src = `assets/mascot/${session.mascot}-${mascotState}.png`;
    img.alt = "數字精靈";
    img.onerror = () => { mascotBox.style.display = "none"; };
    mascotBox.appendChild(img);
    box.appendChild(mascotBox);
  }

  const starsBox = document.createElement("div");
  starsBox.className = "summary-stars";
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("span");
    s.className = "star" + (i < stars ? " lit" : "");
    s.textContent = "★";
    s.style.animationDelay = `${i * 0.15}s`;
    starsBox.appendChild(s);
  }
  box.appendChild(starsBox);

  box.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `本節點戰力值：${Math.round(stats.masteryPct * 100)}%`,
  }));

  const reports = document.createElement("div");
  reports.className = "summary-reports";
  reports.innerHTML = `
    <div class="report-tile"><strong>${Math.round((session.roundCorrect / session.roundTotal) * 100) || 0}%</strong><div>本輪正確率</div></div>
    <div class="report-tile"><strong>${stats.totalAttempts}</strong><div>累計作答</div></div>
    <div class="report-tile"><strong>${session.streak}</strong><div>最終連對</div></div>
  `;
  box.appendChild(reports);

  if (newBadges.length > 0) {
    const badgeList = document.createElement("div");
    badgeList.className = "badge-unlock";
    badgeList.textContent = "叮！你解鎖了新徽章：" + newBadges.map((b) => b.name).join("、");
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
  summary.innerHTML = `<h3>整體戰力值</h3><p>${overview.masteredCount} / ${overview.totalNodes} 個學習點已開通</p>`;
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
  errorSection.innerHTML = `<h3>錯題復仇本（${wrongList.length} 題）</h3>`;
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
