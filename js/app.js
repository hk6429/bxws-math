import { loadSkillTree, allNodes, nodeState, getNodeMastery, isNodePlayable } from "./schema.js";
import { renderSkillTree, computeOverview } from "./skilltree-ui.js";
import { buildSession, buildMasterSession, buildReviewSession, countDueReviews } from "./quiz-loader.js";
import { renderQuestion } from "./quiz-ui.js";
import { recordAnswer, overallMasteryPct, getNodeStats } from "./scoreEngine.js";
import { updateBox, hasRecord, isDue } from "./leitner.js";
import { addWrongQuestion, listWrongQuestions, removeWrongQuestion } from "./errorbook.js";
import { evaluateBadges, getUnlockedBadges, unlockBadge, BADGES } from "./achievements.js";
import { getPlayerName, setPlayerName, submitScore, getLeaderboard } from "./leaderboard.js";
import {
  MANUSCRIPTS, getCollection, evaluateCollection,
  RARE_STAMPS, stampForNode, getRareStamps, ownRareStamp,
  manuscriptDustStatus, addManuscriptCare,
} from "./collection.js";
import { pickQuote, unlockedExtraQuotes } from "./quotes.js";
import { store, exportNamespace, importNamespace } from "./store.js";
import { sfx, isSfxOn, setSfxOn } from "./sfx.js";
import { getDaily, bumpDaily, dailyTasks, maybeDropInk, getInkDays, inkThisMonth } from "./daily.js";
import { isoWeekKey, buildWeeklySession, getWeeklyBest, submitWeeklyResult, decodeResult } from "./weekly.js";
import { computeWorkshop, WORKSHOP_STAGES } from "./workshop.js";
import {
  buildChallengeCatalog, decodeChallenge, decodeReply, encodeChallenge, encodeReply,
  questionAccuracy, questionLabel,
} from "./challenge.js";

const views = {
  home: document.getElementById("view-home"),
  quiz: document.getElementById("view-quiz"),
  dashboard: document.getElementById("view-dashboard"),
  workshop: document.getElementById("view-workshop"),
};

let tree = null;
let session = { queue: [], index: 0, node: null, mascot: null, streak: 0, streakShielded: false, maxStreak: 0, roundCorrect: 0, roundTotal: 0 };
let nextBtnEl = null;

const MASTER_TRIAL_ID = "master-trial";
const REVIEW_ID = "daily-review";
const WEEKLY_ID = "weekly-cup";

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

function newSession(fields) {
  return {
    queue: [],
    index: 0,
    node: null,
    mascot: "davinci",
    kind: "node", // node | master | review | weekly
    strategy: null,
    retryDone: 0,
    fastCount: 0,
    repairTotal: 0,
    repairedCount: 0,
    encounterIdx: -1,
    qStartAt: 0,
    elapsedTotal: 0,
    perQuestion: [],
    rareDrops: [],
    challengeCode: null,
    streak: 0,
    streakShielded: false,
    maxStreak: 0,
    roundCorrect: 0,
    roundTotal: 0,
    ...fields,
  };
}

// ── session 斷點續傳：每答一題落盤，關掉分頁也不蒸發 ──
// 作答完成後存 index+1（該題已記錄，續傳從下一題開始）
function saveActiveSession(indexOffset = 0) {
  const idx = session.index + indexOffset;
  if (!session.node || idx >= session.queue.length) {
    if (indexOffset > 0) clearActiveSession();
    return;
  }
  const { qStartAt, ...rest } = session;
  store.write("activeSession", { ...rest, index: idx, savedAt: Date.now() });
}

function clearActiveSession() {
  store.write("activeSession", null);
}

function resumeActiveSession() {
  const saved = store.read("activeSession", null);
  if (!saved || !saved.queue || saved.index >= saved.queue.length) return;
  session = { ...newSession({}), ...saved, qStartAt: 0 };
  clearActiveSession();
  showView("quiz");
  renderCurrentQuestion();
}

async function goHome() {
  tree = tree ?? (await loadSkillTree());
  const container = document.getElementById("skilltree-container");
  renderSkillTree(container, tree, startQuiz);
  maybeShowEndgame(container);

  // 首頁降噪：每週盃/續讀/修稿單/工作室四張卡收進單一可收合看板，先讓學生看到星圖本體
  const dock = document.createElement("details");
  dock.className = "home-brief-dock";
  const summary = document.createElement("summary");
  summary.textContent = "📋 今日看板——每週盃・續讀・修稿單・工作室";
  dock.appendChild(summary);
  const dockBody = document.createElement("div");
  dockBody.className = "home-brief-dock-body";
  dock.appendChild(dockBody);
  container.prepend(dock);

  makeWeeklyCard(dockBody);
  makeResumeCard(dockBody);
  await makeDailyBoard(dockBody);
  makeWorkshopTeaser(dockBody);
  if (!dockBody.hasChildNodes()) dock.remove();
  showView("home");
  maybeShowOnboardingTip();
}

// ── P0：今日修稿單＋星墨瓶 ──
async function makeDailyBoard(container) {
  const nodeIds = allNodes(tree)
    .filter((n) => isNodePlayable(n, tree))
    .map((n) => n.id);
  const dueCount = nodeIds.length > 0 ? await countDueReviews(nodeIds) : 0;
  const errorCount = listWrongQuestions().length;
  const daily = getDaily();
  const tasks = dailyTasks(daily, { dueCount, errorCount });
  const justInked = maybeDropInk(tasks);
  const allDone = tasks.every((t) => t.satisfied);

  const board = document.createElement("div");
  board.className = "daily-board" + (allDone ? " daily-done" : "");
  const title = document.createElement("div");
  title.className = "daily-title";
  title.textContent = allDone
    ? "今日修稿單：完稿！可以安心闔上草稿本了"
    : dueCount > 0
      ? `今日修稿單——有 ${dueCount} 頁手稿的墨跡等你補`
      : "今日修稿單";
  board.appendChild(title);

  const list = document.createElement("div");
  list.className = "daily-tasks";
  tasks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "daily-task" + (t.satisfied ? " task-done" : "");
    const mark = t.satisfied ? "☑" : "☐";
    const progress = t.satisfied ? "" : `（${Math.min(t.done, t.target)}/${t.target}）`;
    row.textContent = `${mark} ${t.label}${progress}`;
    list.appendChild(row);
  });
  board.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "daily-actions";
  if (dueCount > 0) {
    const btn = document.createElement("button");
    btn.className = "daily-btn";
    btn.textContent = `🖋 一鍵補墨（${Math.min(dueCount, 6)} 題）`;
    btn.addEventListener("click", startReviewSession);
    actions.appendChild(btn);
  }
  const ink = document.createElement("span");
  ink.className = "ink-bottle";
  ink.textContent = `🫙 星墨瓶：本月 ${inkThisMonth()} 滴（共 ${getInkDays().length} 滴）`;
  actions.appendChild(ink);
  board.appendChild(actions);

  if (allDone) {
    const stamp = document.createElement("div");
    stamp.className = "daily-stamp" + (justInked ? " stamp-fresh" : "");
    stamp.textContent = "完稿章";
    board.appendChild(stamp);
  }

  const lastPlayed = store.read("lastPlayed", null);
  if (lastPlayed) {
    const days = Math.floor((Date.now() - lastPlayed.at) / 86400000);
    const when = days === 0 ? "今天" : `${days} 天前`;
    const line = document.createElement("div");
    line.className = "daily-lastplayed";
    line.textContent = `上次練習：${when} · ${lastPlayed.nodeName}`;
    board.appendChild(line);
  }
  container.prepend(board);
}

function workshopSnapshot() {
  return computeWorkshop(tree, {
    progress: store.read("progress", {}),
    collection: getCollection(),
    rareStamps: getRareStamps(),
  });
}

function makeWorkshopTeaser(container) {
  const workshop = workshopSnapshot();
  const card = document.createElement("button");
  card.className = "workshop-teaser";
  card.innerHTML = `<span>🏛</span><strong>大師工作室修復計畫</strong><span>${workshop.overallPct}% 重光</span>`;
  card.addEventListener("click", showWorkshop);
  container.prepend(card);
}

async function showWorkshop() {
  tree = tree ?? (await loadSkillTree());
  const workshop = workshopSnapshot();
  if (workshop.allRestored) unlockBadge("workshop-friend");
  const root = document.getElementById("workshop-content");
  root.innerHTML = "";

  const hero = document.createElement("section");
  hero.className = `workshop-hero${workshop.allRestored ? " workshop-complete" : ""}`;
  hero.innerHTML = `<div class="workshop-kicker">每一頁你完成的手稿，都在把工作室修回來。</div>
    <h2>${workshop.allRestored ? "大師工作室・全數重光" : "大師工作室修復計畫"}</h2>
    <div class="workshop-meter"><span style="width:${workshop.overallPct}%"></span></div>
    <p>目前已開放房間總修復度 ${workshop.overallPct}%。精熟手稿、獲得落款、找回稀有章，光就會一層層回來。</p>`;
  if (workshop.allRestored) {
    const finale = document.createElement("div");
    finale.className = "workshop-finale";
    finale.textContent = "✦ 燈一盞一盞亮起，大師把門牌翻到了「工作室之友」。這裡已經不只是大師的工作室，也是你的。";
    hero.appendChild(finale);
  }
  root.appendChild(hero);

  const grid = document.createElement("div");
  grid.className = "workshop-grid";
  workshop.rooms.forEach((room) => {
    const stage = WORKSHOP_STAGES[room.stage];
    const card = document.createElement("article");
    card.className = `workshop-room room-${room.stage}`;
    card.innerHTML = `<div class="room-scene"><span>${room.icon}</span></div>
      <div class="room-copy"><div class="room-stage">${stage.label}</div><h3>${room.title}</h3>
      <p>${stage.message}</p><div class="room-meter"><span style="width:${room.repairPct}%"></span></div>
      <strong>${room.available ? `${room.repairPct}%` : "待開放"}</strong></div>`;
    grid.appendChild(card);
  });
  root.appendChild(grid);
  showView("workshop");
}

async function startReviewSession() {
  const nodeIds = allNodes(tree)
    .filter((n) => isNodePlayable(n, tree))
    .map((n) => n.id);
  const queue = await buildReviewSession(nodeIds, 6);
  if (queue.length === 0) return;
  session = newSession({
    queue,
    node: { id: REVIEW_ID, name: "今日補墨" },
    mascot: "davinci",
    kind: "review",
    encounterIdx: Math.random() < 0.35 ? Math.floor(Math.random() * queue.length) : -1,
  });
  showView("quiz");
  renderCurrentQuestion();
}

// ── 斷點續傳卡 ──
function makeResumeCard(container) {
  const saved = store.read("activeSession", null);
  if (!saved || !saved.queue || saved.index >= saved.queue.length) return;
  const card = document.createElement("div");
  card.className = "resume-card";
  const text = document.createElement("div");
  text.textContent = `上次的草稿還攤在桌上——${saved.node.name} · 第 ${saved.index + 1}/${saved.queue.length} 題`;
  card.appendChild(text);
  const go = document.createElement("button");
  go.className = "daily-btn";
  go.textContent = "接著畫";
  go.addEventListener("click", resumeActiveSession);
  const drop = document.createElement("button");
  drop.className = "daily-btn resume-drop";
  drop.textContent = "重新開始";
  drop.addEventListener("click", () => {
    clearActiveSession();
    card.remove();
  });
  card.appendChild(go);
  card.appendChild(drop);
  container.prepend(card);
}

// ── 每週大師盃 ──
function makeWeeklyCard(container) {
  const card = document.createElement("div");
  card.className = "weekly-card";
  const best = getWeeklyBest();
  const title = document.createElement("div");
  title.className = "weekly-title";
  title.textContent = `🏆 本週大師盃 ${isoWeekKey()}——全班同一套題，敢來嗎？`;
  card.appendChild(title);

  if (best) {
    const mine = document.createElement("div");
    mine.className = "weekly-best";
    mine.textContent = `我的最佳：${best.pct}%・${best.totalSec} 秒・連對 ${best.maxStreak}`;
    card.appendChild(mine);
    const codeRow = document.createElement("div");
    codeRow.className = "weekly-code-row";
    const code = document.createElement("code");
    code.textContent = best.code;
    codeRow.appendChild(code);
    const copy = document.createElement("button");
    copy.className = "daily-btn";
    copy.textContent = "複製戰績碼";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(best.code);
        copy.textContent = "已複製！";
        setTimeout(() => (copy.textContent = "複製戰績碼"), 1500);
      } catch { /* 剪貼簿不可用時保持原樣 */ }
    });
    codeRow.appendChild(copy);
    card.appendChild(codeRow);
  }

  const actions = document.createElement("div");
  actions.className = "daily-actions";
  const go = document.createElement("button");
  go.className = "daily-btn weekly-go";
  go.textContent = best ? "⚔ 再戰一場（刷新紀錄）" : "⚔ 開打（10 題計時）";
  go.addEventListener("click", startWeeklySession);
  actions.appendChild(go);
  card.appendChild(actions);

  // 同學互報戰績碼比一比
  const cmp = document.createElement("div");
  cmp.className = "weekly-compare";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "輸入同學的戰績碼比一比";
  const result = document.createElement("div");
  result.className = "weekly-compare-result";
  const btn = document.createElement("button");
  btn.className = "daily-btn";
  btn.textContent = "比一比";
  btn.addEventListener("click", () => {
    const other = decodeResult(input.value);
    if (!other) {
      result.textContent = "這組戰績碼看不懂，再核對一次？";
      return;
    }
    if (other.week !== isoWeekKey()) {
      result.textContent = `這是 ${other.week} 的舊戰績碼，本週是 ${isoWeekKey()}。`;
      return;
    }
    const mineBest = getWeeklyBest();
    if (!mineBest) {
      result.textContent = `對方 ${other.pct}%・${other.totalSec} 秒。你還沒出賽——先打一場！`;
      return;
    }
    const win = mineBest.pct > other.pct || (mineBest.pct === other.pct && mineBest.totalSec < other.totalSec);
    const tie = mineBest.pct === other.pct && mineBest.totalSec === other.totalSec;
    result.textContent = tie
      ? `平手！雙方都是 ${other.pct}%・${other.totalSec} 秒。`
      : win
        ? `你贏了！${mineBest.pct}%・${mineBest.totalSec}s vs 對方 ${other.pct}%・${other.totalSec}s`
        : `對方領先：${other.pct}%・${other.totalSec}s vs 你 ${mineBest.pct}%・${mineBest.totalSec}s——再戰一場討回來！`;
  });
  cmp.appendChild(input);
  cmp.appendChild(btn);
  cmp.appendChild(result);
  card.appendChild(cmp);

  container.prepend(card);
}

async function startWeeklySession() {
  const nodeIds = allNodes(tree).filter((n) => !n.contentPending).map((n) => n.id);
  session = newSession({
    queue: await buildWeeklySession(nodeIds, 10),
    node: { id: WEEKLY_ID, name: `本週大師盃 ${isoWeekKey()}` },
    mascot: "gauss",
    kind: "weekly",
  });
  showView("quiz");
  renderCurrentQuestion();
}

// 終局內容：全節點精熟後開放大師試煉（可重複挑戰、保留最佳紀錄）
function maybeShowEndgame(container) {
  const overview = computeOverview(tree);
  if (overview.masteredCount < overview.totalNodes) return;
  const best = store.read("masterTrialBest", null);
  const banner = document.createElement("div");
  banner.className = "endgame-banner" + (best ? " endgame-cleared" : "");
  banner.innerHTML = best
    ? `<div class="endgame-title">大師試煉最佳紀錄：${Math.round(best.pct * 100)}%——雙大師在等你刷新它</div>`
    : `<div class="endgame-title">整本草稿都完稿了！達文西與高斯聯名邀請你——</div>`;
  const btn = document.createElement("button");
  btn.className = "q-next";
  btn.textContent = best ? "⚔ 再戰大師試煉" : "⚔ 挑戰大師試煉（跨主題混合 10 題）";
  btn.addEventListener("click", startMasterTrial);
  banner.appendChild(btn);
  container.prepend(banner);
}

async function startMasterTrial() {
  const nodeIds = allNodes(tree).filter((n) => !n.contentPending).map((n) => n.id);
  session = newSession({
    queue: await buildMasterSession(nodeIds),
    node: { id: MASTER_TRIAL_ID, name: "大師試煉" },
    mascot: "davinci",
    kind: "master",
  });
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
  let lastShown = null;
  const tick = () => {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (left > 0) {
      el.textContent = `⏱ 疾筆倒數 ${left} 秒`;
      el.classList.toggle("timer-hot", left <= 5);
      if (left <= 5 && left !== lastShown) sfx.tick();
      lastShown = left;
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
  if (store.read("seenTip", false)) return;
  const root = document.getElementById("tip-bubble-root");
  const box = document.createElement("div");
  box.className = "tip-bubble";
  box.innerHTML = `大師的草稿本攤開了！點一下發亮的手稿，接下達文西畫到一半的題目吧。<br /><button>知道了</button>`;
  box.querySelector("button").addEventListener("click", () => {
    box.remove();
    store.write("seenTip", true);
  });
  root.appendChild(box);
}

// 進節點先翻「心法頁」選策略，再開局
function startQuiz(node) {
  if (!isNodePlayable(node, tree)) return;
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

  if (node.lessonMedia?.src) {
    const figure = document.createElement("figure");
    figure.className = "lesson-media";
    const img = document.createElement("img");
    img.src = node.lessonMedia.src;
    img.alt = node.lessonMedia.alt ?? "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      figure.hidden = true;
    }, { once: true });
    figure.appendChild(img);
    picker.appendChild(figure);
  }

  const lastUsedRaw = store.read("lastStrategy", null);
  const isFirstTime = lastUsedRaw === null;
  const lastUsed = lastUsedRaw ?? "slow";
  const nodeErrorCount = listWrongQuestions().filter((e) => e.nodeId === node.id).length;
  STRATEGIES.forEach((s) => {
    const card = document.createElement("button");
    const unavailable = s.id === "repair" && nodeErrorCount === 0;
    const isRecommended = !unavailable && s.id === lastUsed;
    card.className = "strategy-card" + (isRecommended ? " last-used" : "");
    card.style.setProperty("--strategy-color", `var(${s.color})`);
    card.disabled = unavailable;
    const title = document.createElement("strong");
    title.textContent = s.name;
    const desc = document.createElement("span");
    desc.textContent = unavailable ? "這本手稿目前沒有待修筆跡" : s.desc;
    card.appendChild(title);
    card.appendChild(desc);
    if (isRecommended) {
      const tag = document.createElement("em");
      tag.className = "strategy-recommend-tag";
      tag.textContent = isFirstTime ? "新手推薦先選這個" : "上次的心法";
      card.appendChild(tag);
    }
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
  const queue = await buildSession(node.id, 8, strategyId, errorEntries, node);
  session = newSession({
    queue,
    node,
    mascot: mascotVariantFor(node.id),
    kind: "node",
    strategy: strategyId,
    repairTotal: queue.filter((q) => q._fromErrorbook).length,
    encounterIdx: Math.random() < 0.35 ? Math.floor(Math.random() * queue.length) : -1,
  });
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
    badge.className = "streak-badge" + (session.streak >= 5 ? " streak-badge-hot" : "");
    badge.textContent = `🔥 連對 ${session.streak}`;
    el.appendChild(badge);
  }
}

// Ghost Run：跟上一輪的自己比累計秒數
function renderGhostLine() {
  document.getElementById("quiz-ghost")?.remove();
  if (session.kind !== "node") return;
  const ghost = store.read(`ghost:${session.node.id}`, null);
  if (!ghost || !ghost.perQuestion || session.index === 0) return;
  const idx = Math.min(session.index, ghost.perQuestion.length) - 1;
  if (idx < 0) return;
  const ghostMs = ghost.perQuestion.slice(0, idx + 1).reduce((acc, q) => acc + q.ms, 0);
  const diffSec = Math.round((ghostMs - session.elapsedTotal) / 1000);
  const el = document.createElement("div");
  el.id = "quiz-ghost";
  el.className = "quiz-ghost";
  el.textContent = diffSec >= 0
    ? `👻 領先上次的你 ${diffSec} 秒`
    : `👻 落後上次的你 ${-diffSec} 秒——追！`;
  document.getElementById("quiz-progressbar").after(el);
}

function renderCurrentQuestion() {
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  document.getElementById("quiz-node-name").textContent = session.node.name;
  renderProgressBar();
  renderStreakBadge();
  renderGhostLine();

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
  if (session.streak >= 5) card.classList.add("streak-hot");
  quizArea.appendChild(card);

  // 作答後才解鎖「下一題」——不能跳過作答
  const nextBtn = document.createElement("button");
  nextBtn.className = "q-next q-next-hidden";
  nextBtn.textContent = session.index === session.queue.length - 1 ? "看成果" : "下一題";
  nextBtn.addEventListener("click", () => {
    session.index += 1;
    saveActiveSession();
    renderCurrentQuestion();
  });
  quizArea.appendChild(nextBtn);
  nextBtnEl = nextBtn;
}

function handleAnswer(question, isCorrect, meta = {}) {
  const nodeId = question._nodeId ?? session.node.id;
  const elapsed = Math.max(0, Date.now() - session.qStartAt);
  const wasReviewDue = hasRecord(question.id) && isDue(question.id);
  const node = allNodes(tree).find((item) => item.id === nodeId) ?? {};
  recordAnswer(nodeId, question, isCorrect, elapsed, node);
  updateBox(question.id, isCorrect);
  session.roundTotal += 1;
  session.elapsedTotal += elapsed;
  session.perQuestion.push({ c: isCorrect ? 1 : 0, ms: elapsed });
  if (wasReviewDue) bumpDaily("review");
  if (isCorrect) {
    session.roundCorrect += 1;
    session.streak += 1;
    session.maxStreak = Math.max(session.maxStreak, session.streak);
    const best = store.read("bestStreak", 0);
    if (session.streak > best) store.write("bestStreak", session.streak);
    sfx.correct(session.streak);
    if (question._retry) session.retryDone += 1;
    if (session.strategy === "sprint" && elapsed <= SPRINT_LIMIT_MS) {
      session.fastCount += 1;
    }
    if (question._fromErrorbook) {
      removeWrongQuestion(question.id);
      session.repairedCount += 1;
      bumpDaily("repair");
    }
    if (wasReviewDue && (getCollection()[nodeId]?.tier ?? 0) >= 2) addManuscriptCare(nodeId);
    if (meta.encounter) handleEncounterWin();
  } else {
    if (session.streak >= 5 && !session.streakShielded) {
      session.streakShielded = true;
      session.streak = Math.max(0, session.streak - 2);
    } else {
      session.streak = 0;
      session.streakShielded = false;
    }
    sfx.wrong();
    addWrongQuestion(nodeId, question);
    // 慢筆細描：答錯排到隊尾再描一次（每題限一次）
    if (session.strategy === "slow" && !question._retry) {
      session.queue.push({ ...question, _retry: true });
    }
  }
  renderStreakBadge();
  saveActiveSession(1);
  nextBtnEl?.classList.remove("q-next-hidden");
}

// 奇遇答對：5% 掉大師印章，10 次未掉保底必掉（掉當前節點主題章，已擁有則遞補未擁有的）
function handleEncounterWin() {
  store.write("encounterWins", store.read("encounterWins", 0) + 1);
  let pity = store.read("encounterPity", 0) + 1;
  const shouldDrop = Math.random() < 0.05 || pity >= 10;
  if (shouldDrop) {
    const owned = getRareStamps();
    const nodeId = session.queue[session.index]?._nodeId ?? session.node.id;
    let stamp = stampForNode(nodeId, session.mascot);
    if (owned[stamp.id]) stamp = RARE_STAMPS.find((s) => !owned[s.id]) ?? null;
    if (stamp) {
      pity = 0;
      ownRareStamp(stamp.id);
      session.rareDrops.push(stamp);
      sfx.rare();
      const card = document.querySelector("#quiz-area .q-card");
      if (card) {
        const rare = document.createElement("div");
        rare.className = "rare-stamp";
        rare.textContent = `${stamp.sym} ${stamp.name}`;
        card.appendChild(rare);
      }
    }
  }
  store.write("encounterPity", pity);
}

function finishSession() {
  clearSprintTimer();
  clearActiveSession();
  bumpDaily("rounds");
  store.write("lastPlayed", { at: Date.now(), nodeName: session.node.name });

  const overview = computeOverview(tree);
  const workshop = workshopSnapshot();
  const isMasterTrial = session.kind === "master";
  const roundPct = session.roundTotal > 0 ? session.roundCorrect / session.roundTotal : 0;
  const ctx = {
    masteredCount: overview.masteredCount,
    totalNodes: overview.totalNodes,
    lastRoundAllCorrect: session.roundTotal >= 5 && session.roundCorrect === session.roundTotal,
    currentStreak: session.maxStreak,
    masterTrialPassed: isMasterTrial && session.roundTotal > 0 && roundPct >= 0.9,
    encounterWins: store.read("encounterWins", 0),
    workshopRestored: workshop.allRestored,
    sparring: session.kind === "challenge",
  };
  const newBadges = evaluateBadges(ctx);

  // Ghost Run 存檔：一般節點輪存「這一輪的我」給下一輪追
  if (session.kind === "node" && session.perQuestion.length > 0) {
    store.write(`ghost:${session.node.id}`, {
      perQuestion: session.perQuestion,
      totalMs: session.elapsedTotal,
      at: Date.now(),
    });
  }

  // 大師試煉最佳紀錄（可重刷）
  if (isMasterTrial && session.roundTotal > 0) {
    const best = store.read("masterTrialBest", null);
    if (!best || roundPct > best.pct) {
      store.write("masterTrialBest", { pct: roundPct, at: Date.now() });
    }
  }

  // 每週大師盃：submit 最佳成績＋戰績碼
  let weeklyRecord = null;
  if (session.kind === "weekly" && session.roundTotal > 0) {
    weeklyRecord = submitWeeklyResult(
      Math.round(roundPct * 100),
      Math.round(session.elapsedTotal / 1000),
      session.maxStreak
    );
  }

  let challengeReply = null;
  if (session.kind === "challenge" && session.challengeCode) {
    challengeReply = {
      code: encodeReply(session.challengeCode, Math.round(roundPct * 100), Math.round(session.elapsedTotal / 1000)),
      pct: Math.round(roundPct * 100),
      totalSec: Math.round(session.elapsedTotal / 1000),
    };
    store.write("lastChallengeResult", { ...challengeReply, challengeCode: session.challengeCode, at: Date.now() });
    unlockBadge("sparring");
  }

  document.getElementById("quiz-streak").innerHTML = "";
  document.getElementById("quiz-ghost")?.remove();
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const stats = session.kind === "node"
    ? getNodeStats(session.node.id)
    : { masteryPct: roundPct, totalAttempts: session.roundTotal };
  const newDrops = session.kind === "node" || isMasterTrial
    ? evaluateCollection(session.node.id, stats, ctx)
    : [];
  quizArea.appendChild(makeSummary(stats, newBadges, newDrops, weeklyRecord, challengeReply));

  const player = getPlayerName();
  if (player) {
    const nodeIds = allNodes(tree).filter((n) => !n.contentPending).map((n) => n.id);
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

function makeSummary(stats, newBadges, newDrops = [], weeklyRecord = null, challengeReply = null) {
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
    if (i < stars) setTimeout(() => sfx.star(i), 150 * i + 200);
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

  if (stats.feedback && !stats.mastered) {
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "strategy-note",
      textContent: stats.feedback,
    }));
  }

  // 每週大師盃戰績碼（結算頁最顯眼位置）
  if (weeklyRecord) {
    const w = document.createElement("div");
    w.className = "weekly-result";
    const isNewBest = weeklyRecord.pct === Math.round((session.roundCorrect / session.roundTotal) * 100);
    w.innerHTML = `<div class="weekly-result-title">🏆 ${isNewBest ? "本週戰績碼" : "本週最佳戰績碼（這場沒刷新）"}</div>`;
    const code = document.createElement("code");
    code.textContent = weeklyRecord.code;
    w.appendChild(code);
    const copy = document.createElement("button");
    copy.className = "daily-btn";
    copy.textContent = "複製給同學";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(weeklyRecord.code);
        copy.textContent = "已複製！";
      } catch { /* noop */ }
    });
    w.appendChild(copy);
    box.appendChild(w);
  }


  if (challengeReply) {
    const result = document.createElement("div");
    result.className = "challenge-result";
    result.innerHTML = `<div class="weekly-result-title">⚔ 回擊碼・${challengeReply.pct}% ・ ${challengeReply.totalSec} 秒</div>
      <code>${challengeReply.code}</code><p>複製給出題同學，他輸入後也會獲得「切磋章」。</p>`;
    const copy = document.createElement("button");
    copy.className = "daily-btn";
    copy.textContent = "複製回擊碼";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(challengeReply.code);
        copy.textContent = "已複製！";
      } catch { /* 剪貼簿不可用時仍可手動複製 */ }
    });
    result.appendChild(copy);
    box.appendChild(result);
  }

  // 稀有章出貨：結算頁鄭重重播（不再被下一題吃掉）
  session.rareDrops.forEach((stamp) => {
    const drop = document.createElement("div");
    drop.className = "ms-drop rare-drop";
    const sym = document.createElement("div");
    sym.className = "ms-sym";
    sym.textContent = stamp.sym;
    const text = document.createElement("div");
    text.className = "ms-drop-text";
    text.textContent = `✦ 稀有章出土：${stamp.name}！收進大師印章簿了`;
    drop.appendChild(sym);
    drop.appendChild(text);
    box.appendChild(drop);
  });

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
  const totalSec = Math.round(session.elapsedTotal / 1000);
  const reports = document.createElement("div");
  reports.className = "summary-reports";
  reports.innerHTML = `
    <div class="report-tile"><strong>${Math.round((session.roundCorrect / session.roundTotal) * 100) || 0}%</strong><div>本輪正確率</div></div>
    <div class="report-tile"><strong>${totalSec}s</strong><div>本輪用時</div></div>
    <div class="report-tile"><strong>${session.maxStreak}</strong><div>最長連對</div></div>
    ${strategyBits.tile || `<div class="report-tile"><strong>${stats.totalAttempts}</strong><div>累計作答</div></div>`}
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

let challengeCatalogPromise = null;
function getChallengeCatalog() {
  if (!challengeCatalogPromise) {
    challengeCatalogPromise = buildChallengeCatalog(
      allNodes(tree).filter((node) => !node.contentPending).map((node) => node.id)
    );
  }
  return challengeCatalogPromise;
}

function startChallengeSession(code, queue) {
  session = newSession({
    queue,
    node: { id: "peer-challenge", name: "同學出題挑戰包" },
    mascot: "gauss",
    kind: "challenge",
    challengeCode: code,
  });
  showView("quiz");
  renderCurrentQuestion();
}

async function makeChallengeHub() {
  const catalog = await getChallengeCatalog();
  const collection = getCollection();
  const sealedIds = new Set(Object.entries(collection)
    .filter(([id, record]) => id !== MASTER_TRIAL_ID && record.tier >= 2)
    .map(([id]) => id));
  const eligible = catalog.filter((question) => sealedIds.has(question._nodeId));
  const nodeNames = Object.fromEntries(allNodes(tree).map((node) => [node.id, node.name]));
  const section = document.createElement("section");
  section.className = "challenge-hub";
  section.innerHTML = `<h3>🎯 學徒出題所・五題挑戰包</h3>
    <p>手稿獲得大師落款後，你就有資格從該頁挑五題考同學。從自己最容易上當的題挑起，才是真正的出題人。</p>`;

  const creator = document.createElement("div");
  creator.className = "challenge-creator";
  if (eligible.length === 0) {
    creator.innerHTML = `<div class="challenge-locked">🔒 先讓任一張手稿獲得「大師落款」，就能解鎖學徒出題權。</div>`;
  } else {
    const selected = new Map();
    const filter = document.createElement("select");
    [...new Set(eligible.map((q) => q._nodeId))].forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = nodeNames[id] ?? id;
      filter.appendChild(option);
    });
    const count = document.createElement("strong");
    count.textContent = "已挑 0 / 5 題";
    const list = document.createElement("div");
    list.className = "challenge-question-list";
    const output = document.createElement("div");
    output.className = "challenge-code-output";
    const make = document.createElement("button");
    make.className = "daily-btn";
    make.textContent = "編成挑戰碼";
    make.disabled = true;

    const renderList = () => {
      list.innerHTML = "";
      eligible.filter((q) => q._nodeId === filter.value).forEach((question) => {
        const label = document.createElement("label");
        label.className = "challenge-question";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(question.id);
        checkbox.disabled = !checkbox.checked && selected.size >= 5;
        const accuracy = questionAccuracy(question.id, store.read("progress", {}));
        const accuracyText = accuracy === null ? "尚未作答" : `歷史正確率 ${Math.round(accuracy * 100)}%`;
        const copy = document.createElement("span");
        copy.innerHTML = `<strong>${questionLabel(question)}</strong><small>${accuracyText}</small>`;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.set(question.id, question);
          else selected.delete(question.id);
          count.textContent = `已挑 ${selected.size} / 5 題`;
          make.disabled = selected.size !== 5;
          renderList();
        });
        label.appendChild(checkbox);
        label.appendChild(copy);
        list.appendChild(label);
      });
    };
    filter.addEventListener("change", renderList);
    make.addEventListener("click", async () => {
      const code = encodeChallenge([...selected.values()], catalog);
      store.write("lastCreatedChallenge", { code, questionIds: [...selected.keys()], at: Date.now() });
      output.innerHTML = `<strong>你的挑戰碼：</strong><code>${code}</code>`;
      try { await navigator.clipboard.writeText(code); output.append("（已複製）"); } catch { /* 可手動複製 */ }
    });
    creator.append(filter, count, list, make, output);
    renderList();
  }
  section.appendChild(creator);

  const receiver = document.createElement("div");
  receiver.className = "challenge-receiver";
  receiver.innerHTML = "<h4>收下同學的挑戰</h4>";
  const input = document.createElement("input");
  input.placeholder = "輸入 BX- 開頭的挑戰碼";
  const result = document.createElement("div");
  result.className = "challenge-message";
  const play = document.createElement("button");
  play.className = "daily-btn";
  play.textContent = "開始接招";
  play.addEventListener("click", () => {
    const queue = decodeChallenge(input.value, catalog);
    if (!queue) { result.textContent = "這組挑戰碼看不懂，請再核對一次。"; return; }
    startChallengeSession(input.value.trim().toUpperCase(), queue);
  });
  receiver.append(input, play, result);
  section.appendChild(receiver);

  const reply = document.createElement("div");
  reply.className = "challenge-receiver";
  reply.innerHTML = "<h4>查看同學的回擊</h4>";
  const replyInput = document.createElement("input");
  replyInput.placeholder = "輸入 XR- 開頭的回擊碼";
  const replyResult = document.createElement("div");
  replyResult.className = "challenge-message";
  const inspect = document.createElement("button");
  inspect.className = "daily-btn";
  inspect.textContent = "拆開回擊";
  inspect.addEventListener("click", () => {
    const mine = store.read("lastCreatedChallenge", null);
    const decoded = mine ? decodeReply(replyInput.value, mine.code) : null;
    if (!decoded) { replyResult.textContent = mine ? "這不是這一包的回擊碼。" : "這台裝置還沒有你出過的挑戰包。"; return; }
    unlockBadge("sparring");
    replyResult.textContent = `同學答對 ${decoded.pct}%，用了 ${decoded.totalSec} 秒。你也獲得「切磋章」！`;
  });
  reply.append(replyInput, inspect, replyResult);
  section.appendChild(reply);
  return section;
}

function makeTravelCase() {
  const section = document.createElement("section");
  section.className = "travel-case";
  section.innerHTML = `<h3>🧳 旅行皮箱</h3><p>把這台裝置上的手稿、精熟進度、印章與錯題全部打包，到另一台電腦繼續寫。</p>`;
  const actions = document.createElement("div");
  actions.className = "travel-actions";
  const pack = document.createElement("button");
  pack.className = "daily-btn";
  pack.textContent = "📦 打包我的草稿本";
  pack.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportNamespace(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `步學吾數-草稿本-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  const label = document.createElement("label");
  label.className = "daily-btn travel-import";
  label.textContent = "🧳 打開旅行皮箱";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "application/json,.json";
  file.hidden = true;
  file.addEventListener("change", async () => {
    const picked = file.files?.[0];
    if (!picked) return;
    try {
      const bundle = JSON.parse(await picked.text());
      if (!confirm("匯入會覆蓋這台裝置的同名進度，要繼續嗎？")) return;
      const count = importNamespace(bundle);
      alert(`已打開旅行皮箱，帶回 ${count} 項紀錄。`);
      location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "這個檔案無法匯入。");
    } finally {
      file.value = "";
    }
  });
  label.appendChild(file);
  actions.append(pack, label);
  section.appendChild(actions);
  return section;
}

async function showDashboard() {
  tree = tree ?? (await loadSkillTree());
  const overview = computeOverview(tree);
  const unlocked = new Set(getUnlockedBadges());
  const challengeCatalog = await getChallengeCatalog();
  const leitnerState = store.read("leitner", {});
  const careState = store.read("manuscriptCare", {});

  const el = document.getElementById("dashboard-content");
  el.innerHTML = "";

  const bestStreak = store.read("bestStreak", 0);
  const trialBest = store.read("masterTrialBest", null);
  const summary = document.createElement("div");
  summary.className = "dash-summary";
  summary.innerHTML = `<h3>整體戰力值</h3><p>${overview.masteredCount} / ${overview.totalNodes} 個學習點已開通</p>
    <p class="dash-records">歷史最長連對：${bestStreak}${trialBest ? ` ・ 大師試煉最佳：${Math.round(trialBest.pct * 100)}%` : ""}</p>`;
  el.appendChild(summary);

  // 大師手稿收藏冊（含完成度與入手日期）
  const col = getCollection();
  const ownedCount = Object.keys(col).length;
  const sealedCount = Object.values(col).filter((c) => c.tier >= 2).length;
  const tierSum = Object.values(col).reduce((acc, c) => acc + c.tier, 0);
  const colPct = Math.round((tierSum / (MANUSCRIPTS.length * 2)) * 100);
  const colSection = document.createElement("div");
  colSection.className = "dash-collection";
  colSection.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `大師手稿收藏冊（${ownedCount} / ${MANUSCRIPTS.length} 入冊 · ${sealedCount} 落款 · 完成度 ${colPct}%）`,
  }));
  const grid = document.createElement("div");
  grid.className = "collection-grid";
  MANUSCRIPTS.forEach((m) => {
    const record = col[m.id];
    const tier = record?.tier ?? 0;
    const card = document.createElement("div");
    card.className = "ms-card" + (tier === 0 ? " locked" : "");
    const dust = manuscriptDustStatus(
      m.id,
      col,
      leitnerState,
      challengeCatalog.filter((q) => q._nodeId === m.id).map((q) => q.id),
      careState[m.id]
    );
    if (dust.dusty) card.classList.add("manuscript-dusty");
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
      if (record?.at) {
        const d = new Date(record.at);
        card.appendChild(Object.assign(document.createElement("div"), {
          className: "ms-date",
          textContent: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 入冊`,
        }));
      }
    }
    if (tier >= 2) {
      card.appendChild(Object.assign(document.createElement("div"), { className: "ms-seal", textContent: "落款" }));
    }
    if (dust.dusty) {
      card.appendChild(Object.assign(document.createElement("div"), {
        className: "dust-note",
        textContent: `手稿蒙塵・補 ${3 - dust.careCount} 題到期墨跡即重新發亮`,
      }));
    }
    grid.appendChild(card);
  });
  colSection.appendChild(grid);
  el.appendChild(colSection);

  // 大師印章簿（稀有章圖鑑：全 10 枚含未解鎖剪影＋入手日期）
  const stampBook = getRareStamps();
  const legacy = store.read("rareStamps", []);
  legacy.forEach((id) => { if (!stampBook[id]) stampBook[id] = { at: null }; });
  const stampCount = Object.keys(stampBook).length;
  const stampSection = document.createElement("div");
  stampSection.className = "dash-stampbook";
  stampSection.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `大師印章簿（${stampCount} / ${RARE_STAMPS.length}）——奇遇題答對有機會出土`,
  }));
  const stampGrid = document.createElement("div");
  stampGrid.className = "stamp-grid";
  RARE_STAMPS.forEach((s) => {
    const owned = stampBook[s.id];
    const cell = document.createElement("div");
    cell.className = "stamp-cell" + (owned ? " stamp-owned" : " stamp-locked");
    const sym = document.createElement("div");
    sym.className = "stamp-sym";
    sym.textContent = owned ? s.sym : "？";
    cell.appendChild(sym);
    const name = document.createElement("div");
    name.className = "stamp-name";
    name.textContent = owned ? s.name : s.hint;
    cell.appendChild(name);
    if (owned?.at) {
      const d = new Date(owned.at);
      cell.appendChild(Object.assign(document.createElement("div"), {
        className: "ms-date",
        textContent: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
      }));
    }
    stampGrid.appendChild(cell);
  });
  stampSection.appendChild(stampGrid);
  el.appendChild(stampSection);

  // 星墨瓶與番外語錄
  const inkTotal = getInkDays().length;
  const extras = unlockedExtraQuotes(inkTotal);
  const inkSection = document.createElement("div");
  inkSection.className = "dash-ink";
  inkSection.innerHTML = `<h3>星墨瓶（共 ${inkTotal} 滴 · 每 7 滴解鎖一則大師番外）</h3>`;
  if (extras.length === 0) {
    inkSection.appendChild(Object.assign(document.createElement("p"), {
      className: "ink-hint",
      textContent: "完成每日修稿單就滴一滴墨。斷了也不會倒掉——瓶子只進不出。",
    }));
  }
  extras.forEach((q) => {
    const note = document.createElement("div");
    note.className = "quote-note";
    note.innerHTML = `<div class="quote-text"></div><div class="quote-by"></div>`;
    note.querySelector(".quote-text").textContent = q.text;
    note.querySelector(".quote-by").textContent = q.by ? `——${q.by}` : "";
    inkSection.appendChild(note);
  });
  el.appendChild(inkSection);

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

  el.appendChild(await makeChallengeHub());
  el.appendChild(makeTravelCase());
  el.appendChild(makeShareCard());
  el.appendChild(makeNameEditor());

  showView("dashboard");
}

// 收藏分享卡：canvas 畫泛黃草稿紙戰績卡，一鍵下載
function makeShareCard() {
  const box = document.createElement("div");
  box.className = "dash-share";
  const btn = document.createElement("button");
  btn.className = "daily-btn";
  btn.textContent = "🖼 產生我的手稿冊卡片（下載炫耀）";
  btn.addEventListener("click", () => renderShareCard());
  box.appendChild(btn);
  return box;
}

function renderShareCard() {
  const col = getCollection();
  const ownedCount = Object.keys(col).length;
  const sealedCount = Object.values(col).filter((c) => c.tier >= 2).length;
  const stampBook = getRareStamps();
  const legacy = store.read("rareStamps", []);
  legacy.forEach((id) => { if (!stampBook[id]) stampBook[id] = { at: null }; });
  const ownedStamps = RARE_STAMPS.filter((s) => stampBook[s.id]);
  const bestStreak = store.read("bestStreak", 0);
  const name = getPlayerName() ?? "同學";

  const W = 800, H = 460;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // 泛黃草稿紙底
  ctx.fillStyle = "#f4ead2";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(140,110,70,0.18)";
  for (let y = 60; y < H; y += 34) {
    ctx.beginPath();
    ctx.moveTo(30, y + Math.sin(y) * 1.5);
    ctx.lineTo(W - 30, y + Math.cos(y) * 1.5);
    ctx.stroke();
  }
  ctx.strokeStyle = "#6b5335";
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  ctx.fillStyle = "#4a3620";
  ctx.font = "bold 34px 'Noto Sans TC', sans-serif";
  ctx.fillText("步學吾數・大師工作室手稿冊", 44, 74);
  ctx.font = "24px 'Noto Sans TC', sans-serif";
  ctx.fillText(`學徒：${name}`, 44, 130);

  ctx.font = "22px 'Noto Sans TC', sans-serif";
  const lines = [
    `📜 手稿入冊 ${ownedCount} / ${MANUSCRIPTS.length}　🖋 大師落款 ${sealedCount}`,
    `✦ 稀有印章 ${ownedStamps.length} / ${RARE_STAMPS.length}　🔥 歷史最長連對 ${bestStreak}`,
  ];
  lines.forEach((t, i) => ctx.fillText(t, 44, 184 + i * 44));

  // 印章區
  ctx.font = "20px 'Noto Sans TC', sans-serif";
  ctx.fillText("印章簿：", 44, 296);
  ownedStamps.slice(0, 8).forEach((s, i) => {
    const x = 70 + (i % 4) * 175;
    const y = 330 + Math.floor(i / 4) * 56;
    ctx.strokeStyle = "#a33b2e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#a33b2e";
    ctx.font = "18px 'Noto Sans TC', sans-serif";
    ctx.fillText(s.sym, x - 9, y + 7);
    ctx.fillStyle = "#4a3620";
    ctx.fillText(s.name, x + 30, y + 7);
  });
  if (ownedStamps.length === 0) {
    ctx.fillStyle = "#8a7455";
    ctx.fillText("（還沒有印章——去奇遇題裡挖！）", 130, 334);
  }

  const d = new Date();
  ctx.fillStyle = "#8a7455";
  ctx.font = "16px 'Noto Sans TC', sans-serif";
  ctx.fillText(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} · bxws-math`, W - 230, H - 40);

  const finish = () => {
    const a = document.createElement("a");
    a.download = `步學吾數手稿冊-${name}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  // 吉祥物蓋台（載得到就畫，載不到直接出卡）
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, W - 190, H - 210, 150, 150);
    finish();
  };
  img.onerror = finish;
  img.src = "assets/mascot/davinci-celebrate.png";
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

// 音效／震動開關（預設關：教室情境）
function setupSfxToggle() {
  const btn = document.getElementById("nav-sfx");
  const sync = () => {
    btn.textContent = isSfxOn() ? "🔊" : "🔇";
    btn.title = isSfxOn() ? "音效開（點擊關閉）" : "音效關（點擊開啟）";
  };
  btn.addEventListener("click", () => {
    setSfxOn(!isSfxOn());
    sync();
    if (isSfxOn()) sfx.correct(0);
  });
  sync();
}

document.getElementById("nav-home").addEventListener("click", goHome);
document.getElementById("nav-workshop").addEventListener("click", showWorkshop);
document.getElementById("nav-dashboard").addEventListener("click", showDashboard);
setupSfxToggle();

if (!getPlayerName()) setPlayerName("同學");
goHome();
