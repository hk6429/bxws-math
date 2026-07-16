import { loadSkillTree, allNodes, nodeState, getNodeMastery } from "./schema.js";
import { renderSkillTree, computeOverview } from "./skilltree-ui.js";
import { buildSession, buildMasterSession } from "./quiz-loader.js";
import { renderQuestion } from "./quiz-ui.js";
import { recordAnswer, overallMasteryPct, getNodeStats } from "./scoreEngine.js";
import { updateBox } from "./leitner.js";
import { addWrongQuestion, listWrongQuestions, removeWrongQuestion } from "./errorbook.js";
import { evaluateBadges, getUnlockedBadges, BADGES } from "./achievements.js";
import { getPlayerName, setPlayerName, submitScore, getLeaderboard } from "./leaderboard.js";
import { MANUSCRIPTS, getCollection, evaluateCollection } from "./collection.js";
import { pickQuote } from "./quotes.js";
import { store } from "./store.js";

const views = {
  home: document.getElementById("view-home"),
  quiz: document.getElementById("view-quiz"),
  dashboard: document.getElementById("view-dashboard"),
};

let tree = null;
let session = { queue: [], index: 0, node: null, mascot: null, streak: 0, maxStreak: 0, roundCorrect: 0, roundTotal: 0 };

const MASTER_TRIAL_ID = "master-trial";

// 大師心法：進節點前的練功策略（CD3）
const STRATEGIES = [
  { id: "slow", name: "慢筆細描", color: "--cp-blue", desc: "達文西心法：好線條是描出來的。答錯的題目，這一輪排到隊尾再描一次。" },
  { id: "repair", name: "補筆修稿", color: "--cp-red", desc: "手稿上還留著待修的筆跡。優先出你的錯題，答對就從復仇本清帳。" },
  { id: "sprint", name: "疾筆速寫", color: "--cp-orange", desc: "高斯心法：每題 20 秒內答對記一次疾筆。超時不算錯，只是不記疾筆。" },
];
const SPRINT_LIMIT_MS = 20000;

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
  const container = document.getElementById("skilltree-container");
  renderSkillTree(container, tree, startQuiz);
  maybeShowEndgame(container);
  showView("home");
  maybeShowOnboardingTip();
}

// 終局內容：全節點精熟後開放大師試煉
function maybeShowEndgame(container) {
  const overview = computeOverview(tree);
  if (overview.masteredCount < overview.totalNodes) return;
  const banner = document.createElement("div");
  banner.className = "endgame-banner";
  banner.innerHTML = `<div class="endgame-title">整本草稿都完稿了！達文西與高斯聯名邀請你——</div>`;
  const btn = document.createElement("button");
  btn.className = "q-next";
  btn.textContent = "⚔ 挑戰大師試煉（跨主題混合 10 題）";
  btn.addEventListener("click", startMasterTrial);
  banner.appendChild(btn);
  container.prepend(banner);
}

async function startMasterTrial() {
  const nodeIds = allNodes(tree).map((n) => n.id);
  session = {
    queue: await buildMasterSession(nodeIds),
    index: 0,
    node: { id: MASTER_TRIAL_ID, name: "大師試煉" },
    mascot: "davinci",
    strategy: null,
    retryDone: 0,
    fastCount: 0,
    repairTotal: 0,
    repairedCount: 0,
    encounterIdx: -1,
    qStartAt: 0,
    streak: 0,
    maxStreak: 0,
    roundCorrect: 0,
    roundTotal: 0,
  };
  showView("quiz");
  renderCurrentQuestion();
}

// 疾筆速寫倒數計時
let sprintInterval = null;
function clearSprintTimer() {
  if (sprintInterval) {
    clearInterval(sprintInterval);
    sprintInterval = null;
  }
  document.getElementById("quiz-timer")?.remove();
}

function startSprintTimer() {
  clearSprintTimer();
  const el = document.createElement("div");
  el.id = "quiz-timer";
  el.className = "quiz-timer";
  document.getElementById("quiz-progressbar").after(el);
  const deadline = Date.now() + SPRINT_LIMIT_MS;
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (left > 0) {
      el.textContent = `⏱ 疾筆倒數 ${left} 秒`;
      el.classList.toggle("timer-hot", left <= 5);
    } else {
      el.textContent = "超時了？沒關係，這題慢慢想，只是不記疾筆";
      el.classList.remove("timer-hot");
      clearInterval(sprintInterval);
      sprintInterval = null;
    }
  };
  tick();
  sprintInterval = setInterval(tick, 250);
}

function maybeShowOnboardingTip() {
  if (sessionStorage.getItem("bxws:seenTip")) return;
  const root = document.getElementById("tip-bubble-root");
  const box = document.createElement("div");
  box.className = "tip-bubble";
  box.innerHTML = `大師的草稿本攤開了！點一下發亮的手稿，接下達文西畫到一半的題目吧。<br /><button>知道了</button>`;
  box.querySelector("button").addEventListener("click", () => {
    box.remove();
    sessionStorage.setItem("bxws:seenTip", "1");
  });
  root.appendChild(box);
}

// 進節點先翻「心法頁」選策略，再開局
function startQuiz(node) {
  showView("quiz");
  clearSprintTimer();
  document.getElementById("quiz-node-name").textContent = node.name;
  document.getElementById("quiz-progressbar").innerHTML = "";
  document.getElementById("quiz-streak").innerHTML = "";
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";

  const picker = document.createElement("div");
  picker.className = "strategy-picker";
  picker.appendChild(Object.assign(document.createElement("div"), {
    className: "strategy-picker-title",
    textContent: "翻開大師的心法頁——這一輪要怎麼練？",
  }));

  const lastUsed = store.read("lastStrategy", "slow");
  const nodeErrorCount = listWrongQuestions().filter((e) => e.nodeId === node.id).length;
  STRATEGIES.forEach((s) => {
    const card = document.createElement("button");
    const unavailable = s.id === "repair" && nodeErrorCount === 0;
    card.className = "strategy-card" + (!unavailable && s.id === lastUsed ? " last-used" : "");
    card.style.setProperty("--strategy-color", `var(${s.color})`);
    card.disabled = unavailable;
    const title = document.createElement("strong");
    title.textContent = s.name;
    const desc = document.createElement("span");
    desc.textContent = unavailable ? "這本手稿目前沒有待修筆跡" : s.desc;
    card.appendChild(title);
    card.appendChild(desc);
    if (!unavailable) card.addEventListener("click", () => startQuizWithStrategy(node, s.id));
    picker.appendChild(card);
  });
  quizArea.appendChild(picker);
}

async function startQuizWithStrategy(node, strategyId) {
  store.write("lastStrategy", strategyId);
  const errorEntries = strategyId === "repair"
    ? listWrongQuestions().filter((e) => e.nodeId === node.id)
    : [];
  const queue = await buildSession(node.id, 8, strategyId, errorEntries);
  session = {
    queue,
    index: 0,
    node,
    mascot: mascotVariantFor(node.id),
    strategy: strategyId,
    retryDone: 0,
    fastCount: 0,
    repairTotal: queue.filter((q) => q._fromErrorbook).length,
    repairedCount: 0,
    encounterIdx: Math.random() < 0.35 ? Math.floor(Math.random() * queue.length) : -1,
    qStartAt: 0,
    streak: 0,
    maxStreak: 0,
    roundCorrect: 0,
    roundTotal: 0,
  };
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
  session.qStartAt = Date.now();
  if (session.strategy === "sprint") startSprintTimer();
  else clearSprintTimer();
  const opts = { encounter: session.index === session.encounterIdx };
  const card = renderQuestion(question, (isCorrect, meta) => handleAnswer(question, isCorrect, meta), session.mascot, opts);
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

function handleAnswer(question, isCorrect, meta = {}) {
  const nodeId = question._nodeId ?? session.node.id;
  recordAnswer(nodeId, question.id, isCorrect, 0);
  updateBox(question.id, isCorrect);
  session.roundTotal += 1;
  if (isCorrect) {
    session.roundCorrect += 1;
    session.streak += 1;
    session.maxStreak = Math.max(session.maxStreak, session.streak);
    if (question._retry) session.retryDone += 1;
    if (session.strategy === "sprint" && Date.now() - session.qStartAt <= SPRINT_LIMIT_MS) {
      session.fastCount += 1;
    }
    if (session.strategy === "repair" && question._fromErrorbook) {
      removeWrongQuestion(question.id);
      session.repairedCount += 1;
    }
    if (meta.encounter) handleEncounterWin();
  } else {
    session.streak = 0;
    addWrongQuestion(nodeId, question);
    // 慢筆細描：答錯排到隊尾再描一次（每題限一次）
    if (session.strategy === "slow" && !question._retry) {
      session.queue.push({ ...question, _retry: true });
    }
  }
  renderStreakBadge();
}

function handleEncounterWin() {
  store.write("encounterWins", store.read("encounterWins", 0) + 1);
  if (Math.random() < 0.05) {
    const stampId = session.mascot === "gauss" ? "gauss-signature" : "davinci-manuscript";
    const stamps = new Set(store.read("rareStamps", []));
    stamps.add(stampId);
    store.write("rareStamps", [...stamps]);
    const card = document.querySelector("#quiz-area .q-card");
    if (card) {
      const rare = document.createElement("div");
      rare.className = "rare-stamp";
      rare.textContent = stampId === "gauss-signature" ? "Σ 高斯親筆章" : "🪶 達文西手稿章";
      card.appendChild(rare);
    }
  }
}

function finishSession() {
  clearSprintTimer();
  const overview = computeOverview(tree);
  const isMasterTrial = session.node.id === MASTER_TRIAL_ID;
  const roundPct = session.roundTotal > 0 ? session.roundCorrect / session.roundTotal : 0;
  const ctx = {
    masteredCount: overview.masteredCount,
    totalNodes: overview.totalNodes,
    lastRoundAllCorrect: session.roundTotal >= 5 && session.roundCorrect === session.roundTotal,
    currentStreak: session.maxStreak,
    masterTrialPassed: isMasterTrial && session.roundTotal > 0 && roundPct >= 0.9,
    encounterWins: store.read("encounterWins", 0),
  };
  const newBadges = evaluateBadges(ctx);

  document.getElementById("quiz-streak").innerHTML = "";
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const stats = isMasterTrial
    ? { masteryPct: roundPct, totalAttempts: session.roundTotal }
    : getNodeStats(session.node.id);
  const newDrops = evaluateCollection(session.node.id, stats, ctx);
  quizArea.appendChild(makeSummary(stats, newBadges, newDrops));

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

function strategySummaryBits() {
  if (!session.strategy) return { tile: "", note: "" };
  if (session.strategy === "slow") {
    return {
      tile: `<div class="report-tile"><strong>${session.retryDone}</strong><div>補描成功</div></div>`,
      note: session.retryDone > 0 ? "線條描實了——補描成功的題目，就是你的了。" : "達文西：好線條是描出來的。",
    };
  }
  if (session.strategy === "repair") {
    return {
      tile: `<div class="report-tile"><strong>${session.repairedCount}/${session.repairTotal}</strong><div>修復舊筆跡</div></div>`,
      note: session.repairedCount > 0 ? "錯題復仇本變薄了！" : "待修筆跡還在等你回來。",
    };
  }
  return {
    tile: `<div class="report-tile"><strong>${session.fastCount}/${session.roundTotal}</strong><div>疾筆</div></div>`,
    note: session.fastCount >= 6 ? "高斯點頭了。" : "筆速會越練越快。",
  };
}

function makeSummary(stats, newBadges, newDrops = []) {
  const box = document.createElement("div");
  box.className = "q-summary";

  const stars = roundStars(session.roundTotal, session.roundCorrect);
  const mascotState = stars >= 2 ? "celebrate" : stars >= 1 ? "happy" : "idle";
  if (session.mascot) {
    const mascotBox = document.createElement("div");
    mascotBox.className = "summary-mascot";
    const img = document.createElement("img");
    img.src = `assets/mascot/${session.mascot}-${mascotState}.png`;
    img.alt = "大師吉祥物";
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

  // 大師的一句話（40% 機率）
  const quote = pickQuote(stars, session.mascot);
  if (quote) {
    const note = document.createElement("div");
    note.className = "quote-note";
    note.innerHTML = `<div class="quote-text"></div><div class="quote-by"></div>`;
    note.querySelector(".quote-text").textContent = quote.text;
    note.querySelector(".quote-by").textContent = quote.by ? `——${quote.by}` : "";
    box.appendChild(note);
  }

  box.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `本節點戰力值：${Math.round(stats.masteryPct * 100)}%`,
  }));

  // 新手稿入冊／大師落款演出
  newDrops.forEach((d) => {
    const drop = document.createElement("div");
    drop.className = "ms-drop" + (d.tier === 2 ? " ms-drop-sealed" : "");
    const sym = document.createElement("div");
    sym.className = "ms-sym";
    sym.textContent = d.item.sym;
    const text = document.createElement("div");
    text.className = "ms-drop-text";
    text.textContent = d.tier === 2
      ? `🖋 大師落款：${d.item.name}——這一頁，正式是你的了`
      : `📜 新手稿入冊：${d.item.name}`;
    drop.appendChild(sym);
    drop.appendChild(text);
    if (d.tier === 2) drop.appendChild(Object.assign(document.createElement("div"), { className: "ms-seal", textContent: "落款" }));
    box.appendChild(drop);
  });

  const strategyBits = strategySummaryBits();
  const reports = document.createElement("div");
  reports.className = "summary-reports";
  reports.innerHTML = `
    <div class="report-tile"><strong>${Math.round((session.roundCorrect / session.roundTotal) * 100) || 0}%</strong><div>本輪正確率</div></div>
    <div class="report-tile"><strong>${stats.totalAttempts}</strong><div>累計作答</div></div>
    <div class="report-tile"><strong>${session.maxStreak}</strong><div>最長連對</div></div>
    ${strategyBits.tile}
  `;
  box.appendChild(reports);

  if (strategyBits.note) {
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "strategy-note",
      textContent: strategyBits.note,
    }));
  }

  if (newBadges.length > 0) {
    const badgeList = document.createElement("div");
    badgeList.className = "badge-unlock";
    badgeList.textContent = "【蓋章認證】" + newBadges.map((b) => b.name).join("、");
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

  // 大師手稿收藏冊
  const col = getCollection();
  const ownedCount = Object.keys(col).length;
  const sealedCount = Object.values(col).filter((c) => c.tier >= 2).length;
  const colSection = document.createElement("div");
  colSection.className = "dash-collection";
  colSection.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `大師手稿收藏冊（${ownedCount} / ${MANUSCRIPTS.length} 入冊 · ${sealedCount} 落款）`,
  }));
  const grid = document.createElement("div");
  grid.className = "collection-grid";
  MANUSCRIPTS.forEach((m) => {
    const tier = col[m.id]?.tier ?? 0;
    const card = document.createElement("div");
    card.className = "ms-card" + (tier === 0 ? " locked" : "");
    const sym = document.createElement("div");
    sym.className = "ms-sym";
    sym.textContent = tier === 0 ? "？" : m.sym;
    card.appendChild(sym);
    const name = document.createElement("div");
    name.className = "ms-name";
    name.textContent = tier === 0 ? m.hint : m.name;
    card.appendChild(name);
    if (tier > 0) {
      card.appendChild(Object.assign(document.createElement("div"), { className: "ms-desc", textContent: m.desc }));
    }
    if (tier >= 2) {
      card.appendChild(Object.assign(document.createElement("div"), { className: "ms-seal", textContent: "落款" }));
    }
    grid.appendChild(card);
  });
  colSection.appendChild(grid);
  el.appendChild(colSection);

  const badgeSection = document.createElement("div");
  badgeSection.className = "dash-badges";
  badgeSection.innerHTML = "<h3>成就徽章</h3>";
  BADGES.forEach((b) => {
    const row = document.createElement("div");
    row.className = "badge-row" + (unlocked.has(b.id) ? " got" : "");
    row.textContent = `${unlocked.has(b.id) ? "🏅" : "⬜"} ${b.name} — ${b.desc}`;
    badgeSection.appendChild(row);
  });
  const rareStamps = store.read("rareStamps", []);
  if (rareStamps.length > 0) {
    const names = { "davinci-manuscript": "🪶 達文西手稿章", "gauss-signature": "Σ 高斯親筆章" };
    const row = document.createElement("div");
    row.className = "badge-row got";
    row.textContent = `✦ 稀有章：${rareStamps.map((id) => names[id] ?? id).join("、")}`;
    badgeSection.appendChild(row);
  }
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
