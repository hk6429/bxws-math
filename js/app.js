import {
  loadSkillTree, allNodes, nodeState, getNodeMastery, isNodePlayable, recommendedNextNode,
} from "./schema.js";
import { renderSkillTree, computeOverview } from "./skilltree-ui.js";
import {
  buildSession, buildMasterSession, buildReviewSession, countDueReviews,
  insertMentorCoachingQuestion, loadQuestionBank, mentorCoachingTransition,
} from "./quiz-loader.js";
import {
  autoAdvanceDelay, cardRevealClass, guardianImageForStrand, masteryEncouragement,
  renderQuestion, streakMilestone,
} from "./quiz-ui.js";
import { recordAnswer, overallMasteryPct, getNodeStats } from "./scoreEngine.js";
import { updateBox, hasRecord, isDue } from "./leitner.js";
import { addWrongQuestion, listWrongQuestions, removeWrongQuestion } from "./errorbook.js";
import { evaluateBadges, getUnlockedBadges, unlockBadge, BADGES } from "./achievements.js";
import { getPlayerName, setPlayerName, submitScore, getLeaderboard } from "./leaderboard.js";
import {
  MANUSCRIPTS, getCollection, evaluateCollection,
  RARE_STAMPS, getRareStamps, resolveEncounterReward,
  RARITY_MYTHOS, manuscriptDustStatus, addManuscriptCare,
} from "./collection.js";
import { pickQuote, QUOTES, unlockedExtraQuotes } from "./quotes.js";
import {
  store, exportNamespace, importNamespace, isStorageBroken, recordActivityStreak, runMigrations,
} from "./store.js";
import { sfx, isSfxOn, setSfxOn } from "./sfx.js";
import { applyAccessibilitySettings, getAccessibilitySettings, setAccessibilitySetting } from "./accessibility.js";
import {
  getDaily, bumpDaily, dailyTasks, maybeDropInk, getInkDays, getStardustCount,
  addStardust, claimStardustMilestones, inkThisMonth, returningWelcome,
} from "./daily.js";
import {
  isoWeekKey, buildWeeklySession, getWeeklyBest, submitWeeklyResult, decodeClassResults, decodeResult,
  getRoomCode, setRoomCode, syncWeeklyResultToServer, fetchWeeklyBoard,
} from "./weekly.js";
import { computeWorkshop, workshopWeeklyGoal, WORKSHOP_STAGES } from "./workshop.js";
import {
  MASTER_TRIAL_TIERS, masterTrialTierState, nextStepRecommendation, settleMasterTrialTier,
} from "./mastery-engine.js";
import {
  buildChallengeCatalog, decodeChallenge, decodeReply, encodeChallenge, encodeReply,
  questionAccuracy, questionLabel,
} from "./challenge.js";
import {
  applyDiagnosticResult, buildPrerequisiteDiagnostic, evaluatePrerequisiteDiagnostic,
} from "./prereq-diagnostic.js";
import {
  applyPlacementDiagnostic, buildPlacementDiagnostic, hasMeaningfulProgress,
} from "./placement-diagnostic.js";

const views = {
  home: document.getElementById("view-home"),
  quiz: document.getElementById("view-quiz"),
  dashboard: document.getElementById("view-dashboard"),
  workshop: document.getElementById("view-workshop"),
};

let tree = null;
let session = { queue: [], index: 0, node: null, mascot: null, streak: 0, streakShielded: false, maxStreak: 0, roundCorrect: 0, roundTotal: 0 };
let nextBtnEl = null;
const pendingTimers = new Set();
const preloadedMascots = new Set();
let migrationsRun = false;
let storageNoticeShown = false;

function announce(message) {
  const live = document.getElementById("quiz-live");
  if (live) live.textContent = message;
}

function showToast(message, tone = "success") {
  document.querySelector(".action-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `action-toast toast-${tone}`;
  toast.role = "status";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function showStreakMilestone(streak) {
  const milestone = streakMilestone(streak);
  if (!milestone) return;
  const quizArea = document.getElementById("quiz-area");
  const card = quizArea?.querySelector(".q-card");
  const celebration = document.createElement("div");
  celebration.className = `streak-celebration streak-celebration-${milestone}`;
  celebration.setAttribute("aria-live", "polite");
  celebration.textContent = milestone === 8
    ? "✦ 神話連詠 ×8！智慧火炬全亮 ✦"
    : `🔥 連詠里程碑 ×${milestone}！`;
  quizArea?.appendChild(celebration);
  card?.classList.add("streak-milestone-hit");
  scheduleTimer(() => {
    celebration.remove();
    card?.classList.remove("streak-milestone-hit");
  }, 900);
}

function showCardReveal(item, rarity = "普通") {
  if (!item) return;
  document.querySelector(".card-reveal-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "card-reveal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", `解鎖${item.name}`);
  const card = document.createElement("div");
  card.className = `card-reveal ${cardRevealClass(rarity)}`;
  const rarityLabel = document.createElement("span");
  rarityLabel.className = "card-reveal-rarity";
  rarityLabel.textContent = rarity;
  const symbol = document.createElement("strong");
  symbol.textContent = item.sym;
  const title = document.createElement("h3");
  title.textContent = item.name;
  const hint = document.createElement("p");
  hint.textContent = "已收入你的收藏，點一下繼續";
  card.append(rarityLabel, symbol, title, hint);
  overlay.appendChild(card);
  const close = () => overlay.remove();
  overlay.addEventListener("click", close, { once: true });
  document.body.appendChild(overlay);
  setTimeout(close, 2200);
}

function showStorageNoticeIfNeeded() {
  if (!isStorageBroken() || storageNoticeShown) return;
  storageNoticeShown = true;
  const notice = document.createElement("div");
  notice.className = "storage-notice";
  notice.role = "status";
  notice.textContent = "這台裝置無法儲存進度（可能是私密瀏覽模式），本次練習不會保留";
  document.body.prepend(notice);
}

function scheduleTimer(callback, delay) {
  const id = setTimeout(() => {
    pendingTimers.delete(id);
    callback();
  }, delay);
  pendingTimers.add(id);
  return id;
}

function clearPendingTimers() {
  pendingTimers.forEach(clearTimeout);
  pendingTimers.clear();
}

const MASTER_TRIAL_ID = "master-trial";
const REVIEW_ID = "daily-review";
const WEEKLY_ID = "weekly-cup";

// 雅典娜智慧引路人的練功策略（CD3）
const STRATEGIES = [
  { id: "slow", name: "沉思描解", color: "--cp-blue", desc: "雅典娜的智慧引路人提醒：穩定的推理是一筆一筆描出的。答錯的題目，這一輪排到隊尾再想一次。" },
  { id: "repair", name: "智慧回溯", color: "--cp-red", desc: "雅典娜的智慧引路人提醒：神諭卷軸還留著待釐清的痕跡。優先練習錯題，答對就解開一處迷霧。" },
  { id: "sprint", name: "飛翼疾行", color: "--cp-orange", desc: "雅典娜的智慧引路人提醒：每題 20 秒內答對記一次疾行。超時不算錯，只是不記疾行。" },
];
const SPRINT_LIMIT_MS = 20000;

function showView(name) {
  const changed = !views[name]?.classList.contains("active");
  if (changed) clearPendingTimers();
  if (name !== "quiz") clearSprintTimer();
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === name));
  const navByView = { home: "nav-home", workshop: "nav-workshop", dashboard: "nav-dashboard" };
  Object.values(navByView).forEach((id) => document.getElementById(id)?.removeAttribute("aria-current"));
  if (navByView[name]) document.getElementById(navByView[name])?.setAttribute("aria-current", "page");
  window.scrollTo(0, 0);
  const labels = { home: "神話星圖", quiz: "練習題", dashboard: "我的儀表板", workshop: "奧林帕斯五座神殿" };
  const heading = views[name]?.querySelector("h2");
  if (heading) {
    heading.focus({ preventScroll: true });
    announce(`已進入：${labels[name]}`);
  }
}

function preloadMascot(variant) {
  if (!variant || preloadedMascots.has(variant)) return;
  preloadedMascots.add(variant);
  ["happy", "sad"].forEach((state) => {
    const image = new Image();
    image.src = `assets/mascot/${variant}-${state}.png`;
  });
}

function makePasteButton(input) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "daily-btn paste-btn";
  button.textContent = "📋 貼上";
  button.addEventListener("click", async () => {
    try { input.value = await navigator.clipboard.readText(); } catch { /* 靜默失敗 */ }
  });
  return button;
}

function secureCodeInput(input) {
  input.autocapitalize = "characters";
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
}

function mascotVariantFor(nodeId) {
  const full = allNodes(tree).find((n) => n.id === nodeId);
  if (!full) return null;
  return tree.strandVisuals?.[full.strandId]?.mascot ?? null;
}

function strandIdForNode(nodeId) {
  return allNodes(tree).find((node) => node.id === nodeId)?.strandId ?? null;
}

function newSession(fields) {
  return {
    queue: [],
    index: 0,
    node: null,
    mascot: "davinci",
    kind: "node", // node | diagnostic | placement | master | review | weekly
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
    stardustEarned: 0,
    challengeCode: null,
    streak: 0,
    streakShielded: false,
    maxStreak: 0,
    roundCorrect: 0,
    roundTotal: 0,
    wasMasteredAtStart: false,
    consecutiveWrong: 0,
    mentorRetryUsed: false,
    mentorPool: [],
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
  const { qStartAt, consecutiveWrong, mentorRetryUsed, mentorPool, ...rest } = session;
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
  const container = document.getElementById("skilltree-container");
  try {
    tree = tree ?? (await loadSkillTree());
    if (!migrationsRun) {
      const fromVersion = store.read("schemaVersion", 0);
      runMigrations(fromVersion, tree);
      migrationsRun = true;
    }
    renderSkillTree(container, tree, startQuiz, startPrerequisiteDiagnostic);
    maybeShowEndgame(container);
    makePlacementEntry(container);

  // 首頁降噪：神殿盃/續讀/喚醒單/五座神殿四張卡收進單一可收合看板，先讓學生看到星圖本體
    const dock = document.createElement("details");
    dock.className = "home-brief-dock";
    dock.open = true;
    const summary = document.createElement("summary");
    summary.textContent = "今日看板——神殿盃・續讀・喚醒單・五座神殿";
    dock.appendChild(summary);
    const dockBody = document.createElement("div");
    dockBody.className = "home-brief-dock-body";
    dock.appendChild(dockBody);
    container.prepend(dock);

    makeWeeklyCard(dockBody);
    makeResumeCard(dockBody);
    const dailySnapshot = await makeDailyBoard(dockBody);
    makeWorkshopTeaser(dockBody);
    if (!dockBody.hasChildNodes()) dock.remove();
    makeTodayFirstStep(container, dailySnapshot.dueCount);
    showView("home");
    maybeShowOnboardingTip(dailySnapshot.dueCount);
  } catch {
    container.innerHTML = "";
    const errorCard = document.createElement("div");
    errorCard.className = "load-error-card";
    errorCard.textContent = "題庫載入失敗，請重新整理";
    container.appendChild(errorCard);
    showView("home");
  } finally {
    showStorageNoticeIfNeeded();
  }
}

function makePlacementEntry(container) {
  if (hasMeaningfulProgress(store.read("progress", {}))) return;
  const card = document.createElement("section");
  card.className = "placement-entry";
  const copy = document.createElement("div");
  copy.innerHTML = "<strong>第一次來，不必從頭慢慢刷</strong><span>用跨年級題目找到最接近你的起點，答對的技能會依定位結果提早點亮。</span>";
  const button = document.createElement("button");
  button.className = "q-next placement-start";
  button.textContent = "不知道從哪開始？先做 5 分鐘定位測驗";
  button.addEventListener("click", startPlacementDiagnostic);
  card.append(copy, button);
  container.prepend(card);
}

// ── P0：今日喚醒單＋星屑瓶 ──
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
  const lastPlayed = store.read("lastPlayed", null);
  const welcome = returningWelcome(lastPlayed, dueCount);
  const activityStreak = recordActivityStreak();

  const board = document.createElement("div");
  board.className = "daily-board" + (allDone ? " daily-done" : "");
  const title = document.createElement("div");
  title.className = "daily-title";
  title.textContent = allDone
    ? "今日喚醒單：完成！今晚的星光全亮了"
    : welcome.headline;
  board.appendChild(title);
  board.appendChild(Object.assign(document.createElement("div"), {
    className: "activity-streak-home",
    textContent: `🔥 連續返校 ${activityStreak.count} 天`,
  }));

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
    btn.textContent = `✨ 一鍵注光（${Math.min(dueCount, 6)} 題）`;
    btn.addEventListener("click", startReviewSession);
    actions.appendChild(btn);
  }
  const ink = document.createElement("span");
  ink.className = "ink-bottle";
  ink.textContent = `🫙 星屑瓶：本月 ${inkThisMonth()} 粒（共 ${getStardustCount()} 粒）`;
  actions.appendChild(ink);
  board.appendChild(actions);

  const milestones = claimStardustMilestones(getStardustCount());
  if (milestones.newlyUnlocked.length > 0) {
    sfx.rare();
    board.appendChild(Object.assign(document.createElement("div"), {
      className: "stardust-milestone-celebration",
      textContent: `✦ 星屑里程碑：瓶中已聚集 ${milestones.newlyUnlocked.at(-1)} 粒星光！`,
    }));
  }

  if (allDone) {
    const stamp = document.createElement("div");
    stamp.className = "daily-stamp" + (justInked ? " stamp-fresh" : "");
    stamp.textContent = "喚醒章";
    board.appendChild(stamp);
  }

  if (lastPlayed) {
    const days = Math.floor((Date.now() - lastPlayed.at) / 86400000);
    const when = days === 0 ? "今天" : `${days} 天前`;
    const line = document.createElement("div");
    line.className = "daily-lastplayed";
    line.textContent = `上次練習：${when} · ${lastPlayed.nodeName}`;
    board.appendChild(line);
  }
  container.prepend(board);
  return { dueCount, welcome };
}

function makeTodayFirstStep(container, dueCount) {
  const button = document.createElement("button");
  button.className = "q-next today-first-step";
  button.textContent = "今日第一步";
  button.addEventListener("click", () => takeTodayFirstStep(dueCount));
  container.prepend(button);
}

async function takeTodayFirstStep(dueCount) {
  const saved = store.read("activeSession", null);
  if (saved?.queue && saved.index < saved.queue.length) {
    resumeActiveSession();
    return;
  }
  if (dueCount > 0) {
    await startReviewSession();
    return;
  }
  const recommended = recommendedNextNode(tree);
  if (!recommended) return;
  const lastStrategy = store.read("lastStrategy", null);
  if (lastStrategy === null) {
    startQuiz(recommended);
    return;
  }
  await startQuizWithStrategy(recommended, lastStrategy);
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
  card.innerHTML = `<span>🏛</span><strong>五座神殿甦醒計畫</strong><span>${workshop.overallPct}% 甦醒</span>`;
  card.addEventListener("click", showWorkshop);
  container.prepend(card);
}

async function navigateToStrand(strandId) {
  await goHome();
  const strand = document.querySelector(`.strand[data-strand-id="${strandId}"]`);
  if (!strand) return;
  strand.classList.remove("strand-highlight");
  requestAnimationFrame(() => strand.classList.add("strand-highlight"));
  strand.scrollIntoView({ block: "start", behavior: "smooth" });
  scheduleTimer(() => strand.classList.remove("strand-highlight"), 1800);
  strand.querySelector(".strand-name")?.setAttribute("tabindex", "-1");
  strand.querySelector(".strand-name")?.focus({ preventScroll: true });
  announce(`已定位到${strand.querySelector(".strand-name")?.textContent ?? "對應領地"}`);
}

async function showWorkshop() {
  tree = tree ?? (await loadSkillTree());
  const workshop = workshopSnapshot();
  if (workshop.allRestored) unlockBadge("workshop-friend");
  const root = document.getElementById("workshop-content");
  root.innerHTML = "";

  const hero = document.createElement("section");
  hero.className = `workshop-hero${workshop.allRestored ? " workshop-complete" : ""}`;
  const kicker = document.createElement("div");
  kicker.className = "workshop-kicker";
  kicker.textContent = "每一卷你讀懂的神諭，都在喚醒一座沉睡的神殿。";
  const heading = document.createElement("h2");
  heading.textContent = workshop.allRestored ? "奧林帕斯五座神殿・全數甦醒" : "五座神殿甦醒計畫";
  const meter = document.createElement("div");
  meter.className = "workshop-meter";
  const meterFill = document.createElement("span");
  meterFill.style.width = `${Number(workshop.overallPct) || 0}%`;
  meter.appendChild(meterFill);
  const weeklyGoal = document.createElement("div");
  weeklyGoal.className = "workshop-weekly-goal";
  weeklyGoal.textContent = workshopWeeklyGoal(workshop.overallPct);
  const intro = document.createElement("p");
  intro.textContent = `目前五座神殿總甦醒度為 ${Number(workshop.overallPct) || 0}%。精通神諭卷軸、取得印記，奧林帕斯的智慧之光就會一層層回來。`;
  hero.append(kicker, heading, meter, weeklyGoal, intro);
  if (workshop.allRestored) {
    const finale = document.createElement("div");
    finale.className = "workshop-finale";
    finale.textContent = "✦ 五座神殿依序甦醒，雅典娜將你的名字刻入「奧林帕斯智者錄」。這片神話領地，也有了你守護的一席之地。";
    hero.appendChild(finale);
  }
  root.appendChild(hero);

  const grid = document.createElement("div");
  grid.className = "workshop-grid";
  workshop.rooms.forEach((room) => {
    const stage = WORKSHOP_STAGES[room.stage];
    const card = document.createElement("article");
    card.className = `workshop-room room-${room.stage}`;
    card.dataset.strandId = room.id;
    card.tabIndex = 0;
    card.role = "link";
    card.setAttribute("aria-label", `前往神話星圖的${room.title}`);
    card.addEventListener("click", () => navigateToStrand(room.id));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigateToStrand(room.id);
    });
    const scene = document.createElement("div");
    scene.className = "room-scene";
    scene.appendChild(Object.assign(document.createElement("span"), { textContent: room.icon }));
    const copy = document.createElement("div");
    copy.className = "room-copy";
    const roomStage = document.createElement("div");
    roomStage.className = "room-stage";
    roomStage.textContent = stage.label;
    const roomTitle = document.createElement("h3");
    roomTitle.textContent = room.title;
    const roomGuardian = document.createElement("div");
    roomGuardian.className = "room-guardian";
    roomGuardian.textContent = `守護者：${room.guardian}`;
    const roomMessage = document.createElement("p");
    roomMessage.textContent = stage.message;
    const roomMeter = document.createElement("div");
    roomMeter.className = "room-meter";
    const roomFill = document.createElement("span");
    roomFill.style.width = `${Number(room.repairPct) || 0}%`;
    roomMeter.appendChild(roomFill);
    const roomScore = document.createElement("strong");
    roomScore.textContent = room.available ? `${Number(room.repairPct) || 0}%` : "待開放";
    copy.append(roomStage, roomTitle, roomGuardian, roomMessage, roomMeter, roomScore);
    card.append(scene, copy);
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
    node: { id: REVIEW_ID, name: "今日注光" },
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
  text.textContent = `上次的神諭卷軸還攤在桌上——${saved.node.name} · 第 ${saved.index + 1}/${saved.queue.length} 題`;
  card.appendChild(text);
  const go = document.createElement("button");
  go.className = "daily-btn";
  go.textContent = "接著喚醒";
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

// ── 每週神殿盃 ──
function makeWeeklyCard(container) {
  const card = document.createElement("div");
  card.className = "weekly-card";
  const best = getWeeklyBest();
  const title = document.createElement("div");
  title.className = "weekly-title";
  title.textContent = `🏆 本週神殿盃 ${isoWeekKey()}——全班同一套題，敢來嗎？`;
  card.appendChild(title);
  card.appendChild(Object.assign(document.createElement("p"), {
    className: "score-disclosure",
    textContent: "這裡是學生自行回報成績，未經伺服器驗證；標記僅供教師與家長決定是否複驗。",
  }));

  if (best) {
    const mine = document.createElement("div");
    mine.className = "weekly-best";
    mine.textContent = `我的最佳：${best.pct}%・${best.totalSec} 秒・連詠 ${best.maxStreak}${best.flagged ? `・${best.flagLabel}` : ""}`;
    card.appendChild(mine);
    const codeRow = document.createElement("div");
    codeRow.className = "weekly-code-row";
    const code = document.createElement("code");
    code.textContent = best.code;
    codeRow.appendChild(code);
    const copy = document.createElement("button");
    copy.className = "daily-btn";
    copy.textContent = "複製戰績神諭";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(best.code);
        copy.textContent = "已複製！";
        scheduleTimer(() => (copy.textContent = "複製戰績神諭"), 1500);
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

  // 同學互報戰績神諭比一比
  const cmp = document.createElement("div");
  cmp.className = "weekly-compare";
  const compareLabel = document.createElement("label");
  compareLabel.htmlFor = "weekly-compare-code";
  compareLabel.textContent = "同學的戰績神諭";
  const input = document.createElement("input");
  input.id = "weekly-compare-code";
  input.type = "text";
  input.placeholder = "例如：2026W29-V2…";
  secureCodeInput(input);
  const result = document.createElement("div");
  result.className = "weekly-compare-result";
  const btn = document.createElement("button");
  btn.className = "daily-btn";
  btn.textContent = "比一比";
  btn.addEventListener("click", () => {
    const other = decodeResult(input.value);
    if (!other) {
      result.textContent = "這組戰績神諭看不懂，再核對一次？";
      return;
    }
    if (other.error === "too-old") {
      result.textContent = "這組戰績神諭格式太舊，請同學重新打一場產生新版神諭。";
      return;
    }
    if (other.week !== isoWeekKey()) {
      result.textContent = `這是 ${other.week} 的舊戰績神諭，本週是 ${isoWeekKey()}。`;
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
  cmp.appendChild(compareLabel);
  cmp.appendChild(input);
  cmp.appendChild(makePasteButton(input));
  cmp.appendChild(btn);
  cmp.appendChild(result);
  card.appendChild(cmp);

  const roomBox = document.createElement("div");
  roomBox.className = "room-sync-box";
  const roomLabel = document.createElement("label");
  roomLabel.htmlFor = "room-code-input";
  roomLabel.textContent = "班級代碼（同代碼的人會出現在同一張真排行榜）";
  const roomInput = document.createElement("input");
  roomInput.id = "room-code-input";
  roomInput.type = "text";
  roomInput.maxLength = 40;
  roomInput.placeholder = "例如：301班";
  roomInput.value = getRoomCode() || "";
  const roomSyncBtn = document.createElement("button");
  roomSyncBtn.className = "daily-btn";
  roomSyncBtn.textContent = "同步真排行榜";
  const roomOutput = document.createElement("div");
  roomOutput.className = "room-sync-output";
  roomSyncBtn.addEventListener("click", async () => {
    const code = setRoomCode(roomInput.value);
    if (!code) {
      roomOutput.textContent = "請先輸入班級代碼";
      return;
    }
    roomOutput.textContent = "同步中…";
    const results = await fetchWeeklyBoard(code, isoWeekKey());
    if (!results) {
      roomOutput.textContent = "暫時連不上伺服器，改用下方手動貼上模式吧";
      return;
    }
    roomOutput.innerHTML = "";
    const note = document.createElement("p");
    note.className = "score-disclosure";
    note.textContent = "✅ 已伺服器同步（同班同代碼即時可見）";
    roomOutput.appendChild(note);
    if (results.length === 0) {
      roomOutput.appendChild(Object.assign(document.createElement("p"), { textContent: "這個代碼本週還沒有人交出成績" }));
    } else {
      const list = document.createElement("ol");
      results.forEach((entry) => {
        const row = document.createElement("li");
        row.textContent = `${entry.name}・${entry.pct}%・${entry.totalSec} 秒・連詠 ${entry.maxStreak}${entry.flagged ? "・⚠️ 建議複驗" : ""}`;
        if (entry.flagged) row.title = entry.flagReasons.join("、");
        list.appendChild(row);
      });
      roomOutput.appendChild(list);
    }
  });
  roomBox.append(roomLabel, roomInput, roomSyncBtn, roomOutput);
  card.appendChild(roomBox);

  const wall = document.createElement("div");
  wall.className = "class-leaderboard-wall";
  const wallLabel = document.createElement("label");
  wallLabel.htmlFor = "class-result-codes";
  wallLabel.textContent = "班級戰績牆（手動貼上模式・離線備援）";
  const textarea = document.createElement("textarea");
  textarea.id = "class-result-codes";
  textarea.rows = 5;
  textarea.placeholder = "每行輸入：姓名,戰績神諭（也可用空白分隔；舊的純神諭仍可用）";
  secureCodeInput(textarea);
  const renderWall = document.createElement("button");
  renderWall.className = "daily-btn";
  renderWall.textContent = "排出班級戰績";
  const wallOutput = document.createElement("div");
  wallOutput.className = "class-leaderboard-output";
  renderWall.addEventListener("click", () => {
    const parsed = decodeClassResults(textarea.value);
    wallOutput.innerHTML = "";
    const list = document.createElement("ol");
    parsed.results.forEach((entry) => {
      const row = document.createElement("li");
      const studentLabel = entry.name || `第 ${entry.lineNumber} 行`;
      row.textContent = `${studentLabel}・${entry.pct}%・${entry.totalSec} 秒・連詠 ${entry.maxStreak}${entry.flagged ? `・${entry.flagLabel}` : ""}`;
      if (entry.flagged) row.title = entry.reasons.join("、");
      list.appendChild(row);
    });
    if (parsed.results.length > 0) wallOutput.appendChild(list);
    else wallOutput.appendChild(Object.assign(document.createElement("p"), { textContent: "還沒有可辨識的戰績" }));
    if (parsed.invalidCount > 0) {
      wallOutput.appendChild(Object.assign(document.createElement("p"), {
        className: "class-leaderboard-invalid",
        textContent: `有 ${parsed.invalidCount} 行無法辨識`,
      }));
    }
  });
  wall.append(wallLabel, textarea, renderWall, wallOutput);
  card.appendChild(wall);

  container.prepend(card);
}

async function startWeeklySession() {
  const nodeIds = allNodes(tree).filter((n) => !n.contentPending).map((n) => n.id);
  session = newSession({
    queue: await buildWeeklySession(nodeIds, 10),
    node: { id: WEEKLY_ID, name: `本週神殿盃 ${isoWeekKey()}` },
    mascot: "gauss",
    kind: "weekly",
  });
  showView("quiz");
  renderCurrentQuestion();
}

// 終局內容：全節點精熟後開放賢者試煉（可重複挑戰、保留最佳紀錄）
function maybeShowEndgame(container) {
  const overview = computeOverview(tree);
  if (overview.masteredCount < overview.totalNodes) return;
  const records = store.read("masterTrialTiers", {});
  const tiers = masterTrialTierState(records);
  const banner = document.createElement("div");
  banner.className = "endgame-banner" + (tiers.some((tier) => tier.cleared) ? " endgame-cleared" : "");
  banner.innerHTML = `<div class="endgame-title">整片神話星圖都點亮了！賢者試煉現在有銅、銀、金三階可持續挑戰。</div>`;
  tiers.forEach((tier) => {
    const btn = document.createElement("button");
    btn.className = "q-next";
    btn.disabled = !tier.unlocked;
    btn.textContent = tier.unlocked
      ? `${tier.cleared ? "✓" : "⚔"} ${tier.name}・${tier.questionCount} 題・${Math.round(tier.passPct * 100)}% 過關・首通 ${tier.reward.stardust} 星屑`
      : `🔒 ${tier.name}（先通過${MASTER_TRIAL_TIERS.find((item) => item.id === tier.requires)?.name}）`;
    if (tier.unlocked) btn.addEventListener("click", () => startMasterTrial(tier.id));
    banner.appendChild(btn);
  });
  container.prepend(banner);
}

async function startMasterTrial(tierId = "bronze") {
  const tier = masterTrialTierState(store.read("masterTrialTiers", {})).find((item) => item.id === tierId);
  if (!tier?.unlocked) return;
  const nodeIds = allNodes(tree).filter((n) => !n.contentPending).map((n) => n.id);
  session = newSession({
    queue: await buildMasterSession(nodeIds, tier.questionCount),
    node: { id: MASTER_TRIAL_ID, name: tier.name },
    mascot: "davinci",
    kind: "master",
    trialTier: tier.id,
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
      const settings = getAccessibilitySettings();
      el.classList.toggle("timer-hot", settings.sprintWarning && left <= 5);
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

function maybeShowOnboardingTip(dueCount = 0) {
  if (store.read("seenTip", false)) return;
  const activeSession = store.read("activeSession", null);
  const lastStrategy = store.read("lastStrategy", null);
  const noStrategy = store.read("lastStrategy", null) === null;
  const isBrandNew = !activeSession && dueCount === 0 && lastStrategy === null;
  if (isBrandNew && noStrategy) {
    const steps = [
      { title: "1 / 3・今日看板", text: "今日看板會顯示到期複習、本日任務、神殿盃與五座神殿進度；它已預設展開。" },
      { title: "2 / 3・今日第一步", text: "首頁上方的「今日第一步」是固定起點，不知道先練什麼時就按它。" },
      { title: "3 / 3・雅典娜帶路", text: "按下後，會依序接回未完測驗、到期複習，或推薦星圖上的下一個學習點。" },
    ];
    const dialog = document.createElement("dialog");
    dialog.className = "onboarding-walkthrough";
    dialog.setAttribute("aria-labelledby", "onboarding-title");
    dialog.addEventListener("cancel", (event) => event.preventDefault());
    let index = 0;
    const renderStep = () => {
      const step = steps[index];
      dialog.innerHTML = `<h3 id="onboarding-title"></h3><p></p><button type="button"></button>`;
      dialog.querySelector("h3").textContent = step.title;
      dialog.querySelector("p").textContent = step.text;
      const button = dialog.querySelector("button");
      button.textContent = index === steps.length - 1 ? "完成導覽，開始探索" : "下一步";
      button.addEventListener("click", () => {
        if (index < steps.length - 1) {
          index += 1;
          renderStep();
          return;
        }
        store.write("seenTip", true);
        dialog.close();
        dialog.remove();
        document.querySelector(".today-first-step")?.focus();
      });
    };
    renderStep();
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return;
  }
  let root = document.getElementById("tip-bubble-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "tip-bubble-root";
  }
  document.querySelector(".home-brief-dock")?.after(root);
  const message = "想接著練？點上面的「今日第一步」，智慧引路人會帶你走到最適合的地方。";
  const box = document.createElement("div");
  box.className = "tip-bubble";
  box.innerHTML = `${message}<br /><button>知道了</button>`;
  box.querySelector("button").addEventListener("click", () => {
    box.remove();
    store.write("seenTip", true);
  });
  root.appendChild(box);
}

// 進節點先翻「秘傳頁」選策略，再開局
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
    textContent: "翻開智慧引路人的引導頁——這一輪要怎麼練？",
  }));

  if (node.lessonMedia?.src) {
    const figure = document.createElement("figure");
    figure.className = "lesson-media";
    const img = document.createElement("img");
    img.src = node.lessonMedia.src;
    img.alt = node.lessonMedia.alt ?? "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 1536;
    img.height = 1024;
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
    desc.textContent = unavailable ? "這卷神諭目前沒有黯淡處" : s.desc;
    card.appendChild(title);
    card.appendChild(desc);
    if (isRecommended) {
      const tag = document.createElement("em");
      tag.className = "strategy-recommend-tag";
      tag.textContent = isFirstTime ? "新手推薦先選這個" : "上次的秘傳";
      card.appendChild(tag);
    }
    if (!unavailable) card.addEventListener("click", () => startQuizWithStrategy(node, s.id));
    picker.appendChild(card);
  });
  quizArea.appendChild(picker);
}

async function startQuizWithStrategy(node, strategyId) {
  showView("quiz");
  store.write("lastStrategy", strategyId);
  const errorEntries = strategyId === "repair"
    ? listWrongQuestions().filter((e) => e.nodeId === node.id)
    : [];
  const bank = await loadQuestionBank(node.id);
  const queue = await buildSession(node.id, 8, strategyId, errorEntries, node);
  session = newSession({
    queue,
    node,
    mascot: mascotVariantFor(node.id),
    kind: "node",
    strategy: strategyId,
    wasMasteredAtStart: getNodeStats(node.id).mastered,
    mentorPool: (bank.basicMastery ?? []).map((question) => ({ ...question, _nodeId: node.id })),
    repairTotal: queue.filter((q) => q._fromErrorbook).length,
    encounterIdx: Math.random() < 0.35 ? Math.floor(Math.random() * queue.length) : -1,
  });
  preloadMascot(session.mascot);
  renderCurrentQuestion();
}

async function startPrerequisiteDiagnostic(node) {
  showView("quiz");
  clearSprintTimer();
  document.getElementById("quiz-node-name").textContent = `${node.name}・先備診斷`;
  document.getElementById("quiz-progressbar").innerHTML = "";
  document.getElementById("quiz-streak").innerHTML = "";
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  try {
    const queue = await buildPrerequisiteDiagnostic(node, loadQuestionBank, 5);
    session = newSession({
      queue,
      node,
      mascot: mascotVariantFor(node.id),
      kind: "diagnostic",
    });
    renderCurrentQuestion();
  } catch {
    quizArea.appendChild(Object.assign(document.createElement("p"), {
      className: "strategy-note",
      textContent: "先備診斷題暫時不足，請先走一般精熟路徑。",
    }));
    const backBtn = document.createElement("button");
    backBtn.className = "q-next";
    backBtn.textContent = "回神話星圖";
    backBtn.addEventListener("click", goHome);
    quizArea.appendChild(backBtn);
    announce("先備診斷題暫時不足，請先走一般精熟路徑");
  }
}

async function startPlacementDiagnostic() {
  showView("quiz");
  clearSprintTimer();
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  try {
    const queue = await buildPlacementDiagnostic(tree, loadQuestionBank, 15);
    session = newSession({
      queue,
      node: { id: "placement-diagnostic", name: "5 分鐘快速定位" },
      mascot: "gauss",
      kind: "placement",
    });
    renderCurrentQuestion();
  } catch {
    quizArea.appendChild(Object.assign(document.createElement("p"), {
      className: "strategy-note",
      textContent: "定位題目暫時不足，請先從神話星圖選擇可挑戰的技能。",
    }));
    const backBtn = document.createElement("button");
    backBtn.className = "q-next";
    backBtn.textContent = "回神話星圖";
    backBtn.addEventListener("click", goHome);
    quizArea.appendChild(backBtn);
  }
}

function renderProgressBar() {
  const bar = document.getElementById("quiz-progressbar");
  bar.innerHTML = "";
  const total = Math.max(1, session.queue.length);
  const current = Math.min(total, session.index + 1);
  bar.setAttribute("aria-valuemin", "1");
  bar.setAttribute("aria-valuemax", String(total));
  bar.setAttribute("aria-valuenow", String(current));
  bar.setAttribute("aria-label", `第 ${current} 題，共 ${total} 題`);
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
    badge.textContent = `🔥 連詠 ×${session.streak}`;
    el.appendChild(badge);
  }
}

function renderMasteryProgress(nodeId = session.node?.id) {
  document.getElementById("mastery-progress-live")?.remove();
  if (session.kind !== "node" || !nodeId) return;
  const criteriaProgress = getNodeStats(nodeId).criteriaProgress;
  if (!criteriaProgress) return;
  const panel = document.createElement("section");
  panel.id = "mastery-progress-live";
  panel.className = "mastery-progress-live";
  panel.setAttribute("aria-label", "精熟進度");
  panel.appendChild(Object.assign(document.createElement("strong"), { textContent: "精熟進度 A–E" }));
  Object.entries(criteriaProgress).forEach(([key, criterion]) => {
    const row = document.createElement("div");
    row.className = "mastery-progress-row";
    row.innerHTML = `<span>${key}</span><meter min="0" max="100" value="${criterion.pct}"></meter><small></small>`;
    row.querySelector("small").textContent = criterion.label;
    const encouragement = document.createElement("span");
    encouragement.className = "mastery-encouragement";
    encouragement.textContent = masteryEncouragement(criterion.pct);
    row.appendChild(encouragement);
    panel.appendChild(row);
  });
  document.getElementById("quiz-progressbar").after(panel);
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

function renderCurrentQuestion(focusStem = false) {
  const quizArea = document.getElementById("quiz-area");
  preloadMascot(session.mascot);
  quizArea.innerHTML = "";
  document.getElementById("quiz-node-name").textContent = session.node.name;
  renderProgressBar();
  renderMasteryProgress();
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
  const guardianStrand = strandIdForNode(question._nodeId ?? question._placementNodeId ?? session.node?.id);
  const opts = { encounter: session.index === session.encounterIdx, guardianStrand };
  if (question._mentorCoaching) {
    quizArea.appendChild(Object.assign(document.createElement("div"), {
      className: "mentor-coaching-line",
      textContent: question._mentorLine,
    }));
  }
  const card = renderQuestion(question, (isCorrect, meta) => handleAnswer(question, isCorrect, meta), session.mascot, opts);
  if (question._mentorCoaching) card.classList.add("mentor-coaching-question");
  if (session.streak >= 3) card.classList.add("streak-active");
  if (session.streak >= 5) card.classList.add("streak-hot");
  quizArea.appendChild(card);
  card.scrollIntoView({ block: "start", behavior: "auto" });
  if (focusStem) {
    const stem = card.querySelector(".q-stem");
    if (stem) {
      stem.tabIndex = -1;
      stem.focus({ preventScroll: true });
    }
  }

  // 作答後才解鎖「下一題」——不能跳過作答
  const nextBtn = document.createElement("button");
  nextBtn.className = "q-next q-next-hidden";
  nextBtn.textContent = session.index === session.queue.length - 1 ? "看成果" : "下一題";
  let advanced = false;
  nextBtn.addEventListener("click", () => {
    if (advanced) return;
    advanced = true;
    session.index += 1;
    saveActiveSession();
    renderCurrentQuestion(true);
  });
  quizArea.appendChild(nextBtn);
  nextBtnEl = nextBtn;
}

function handleAnswer(question, isCorrect, meta = {}) {
  recordActivityStreak();
  const nodeId = question._nodeId ?? question._placementNodeId ?? session.node.id;
  const elapsed = Math.max(0, Date.now() - session.qStartAt);
  const isAssessment = session.kind === "diagnostic" || session.kind === "placement";
  const wasReviewDue = !isAssessment && hasRecord(question.id) && isDue(question.id);
  const node = allNodes(tree).find((item) => item.id === nodeId) ?? {};
  if (!isAssessment) {
    recordAnswer(nodeId, question, isCorrect, elapsed, node);
    updateBox(question.id, isCorrect, nodeId);
  }
  session.roundTotal += 1;
  session.elapsedTotal += elapsed;
  session.perQuestion.push({ c: isCorrect ? 1 : 0, ms: elapsed, at: Date.now() });
  if (wasReviewDue) bumpDaily("review");
  if (isCorrect) {
    if (question._mentorCoaching) {
      const transition = mentorCoachingTransition({
        consecutiveWrong: session.consecutiveWrong,
        retryUsed: session.mentorRetryUsed,
      }, true);
      session.consecutiveWrong = transition.consecutiveWrong;
      session.mentorRetryUsed = transition.retryUsed;
    } else {
      session.consecutiveWrong = 0;
      session.mentorRetryUsed = false;
    }
    session.roundCorrect += 1;
    session.streak += 1;
    session.maxStreak = Math.max(session.maxStreak, session.streak);
    const best = Number(store.read("bestStreak", 0)) || 0;
    if (session.streak > best) store.write("bestStreak", session.streak);
    sfx.correct(session.streak);
    showStreakMilestone(session.streak);
    if (question._retry) session.retryDone += 1;
    if (session.strategy === "sprint" && elapsed <= SPRINT_LIMIT_MS) {
      session.fastCount += 1;
    }
    if (!isAssessment && question._fromErrorbook) {
      removeWrongQuestion(question.id);
      session.repairedCount += 1;
      bumpDaily("repair");
    }
    if (wasReviewDue && (getCollection()[nodeId]?.tier ?? 0) >= 2) addManuscriptCare(nodeId);
    if (meta.encounter) meta.encounterReward = handleEncounterWin();
  } else {
    const streakBeforeWrong = session.streak;
    const mentorTransition = question._mentorCoaching
      ? mentorCoachingTransition({
        consecutiveWrong: session.consecutiveWrong,
        retryUsed: session.mentorRetryUsed,
      }, false)
      : null;
    session.consecutiveWrong = mentorTransition?.consecutiveWrong ?? session.consecutiveWrong + 1;
    if (mentorTransition) session.mentorRetryUsed = mentorTransition.retryUsed;
    if (session.streak >= 5 && !session.streakShielded) {
      session.streakShielded = true;
      session.streak = Math.max(0, session.streak - 2);
    } else {
      session.streak = 0;
      session.streakShielded = false;
    }
    sfx.wrong();
    const settings = getAccessibilitySettings();
    if (streakBeforeWrong > 0 && settings.comboBreakEffect) {
      const quizArea = document.getElementById("quiz-area");
      quizArea?.classList.remove("combo-break");
      requestAnimationFrame(() => quizArea?.classList.add("combo-break"));
      scheduleTimer(() => quizArea?.classList.remove("combo-break"), 500);
    }
    if (!isAssessment) addWrongQuestion(nodeId, question);
    // 慢筆細描：答錯排到隊尾再描一次（每題限一次）
    if (!isAssessment && session.strategy === "slow" && !question._retry) {
      session.queue.push({ ...question, _retry: true });
    }
    if (mentorTransition?.insertRetry) {
      insertMentorCoachingQuestion(
        session.queue,
        session.index,
        [question],
        question._mentorLine,
        Math.random,
        { nodeId, nodeName: node.name ?? nodeId }
      );
    } else if (!isAssessment && !question._mentorCoaching && session.consecutiveWrong >= 3) {
      const comfort = QUOTES.comfort.filter((quote) => quote.mascot === session.mascot);
      const candidates = comfort.length > 0 ? comfort : QUOTES.comfort;
      const quote = candidates[Math.floor(Math.random() * candidates.length)];
      const inserted = insertMentorCoachingQuestion(
        session.queue,
        session.index,
        [...session.mentorPool, ...session.queue],
        quote?.text ?? "別急，我們先喘口氣，練一題簡單的",
        Math.random,
        { nodeId, nodeName: node.name ?? nodeId }
      );
      if (inserted) session.mentorRetryUsed = false;
    }
  }
  renderStreakBadge();
  renderMasteryProgress(nodeId);
  saveActiveSession(1);
  nextBtnEl?.classList.remove("q-next-hidden");
  nextBtnEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const answeredNextButton = nextBtnEl;
  const autoDelay = autoAdvanceDelay(isCorrect);
  if (autoDelay !== null && answeredNextButton) {
    scheduleTimer(() => answeredNextButton.click(), autoDelay);
  }
  const messages = [isCorrect
    ? "答對了！"
    : `答錯了，正解是：選項${meta.correctLabel ?? ""}「${meta.correctText ?? ""}」`];
  if (session.streak >= 3) messages.push(`連詠 ${session.streak}`);
  if (meta.encounterReward?.type === "stamp") messages.push(`發現稀有印記：${meta.encounterReward.stamp.name}`);
  if (meta.encounterReward?.type === "stardust") messages.push(meta.encounterReward.message);
  messages.push(isCorrect ? "即將自動進入下一題" : "下一題按鈕已出現");
  announce(messages.join("。"));
  showStorageNoticeIfNeeded();
}

// 神諭啟示答對：普通／稀有／傳說三階各自機率與保底。
function handleEncounterWin() {
  const nodeId = session.queue[session.index]?._nodeId ?? session.node.id;
  const reward = resolveEncounterReward(nodeId, session.mascot);
  if (!reward) return null;

  sfx.rare();
  const card = document.querySelector("#quiz-area .q-card");
  if (reward.type === "stamp") {
    session.rareDrops.push(reward.stamp);
    showCardReveal(reward.stamp, reward.stamp.rarity);
    if (card) {
      const rare = document.createElement("div");
      rare.className = "rare-stamp";
      rare.textContent = `${reward.stamp.sym} ${reward.stamp.name}・${reward.stamp.rarity}`;
      card.appendChild(rare);
    }
  } else {
    session.stardustEarned += reward.amount;
    if (card) {
      const stardust = document.createElement("div");
      stardust.className = "stardust-drop";
      stardust.textContent = reward.message;
      card.appendChild(stardust);
    }
  }
  return reward;
}

function finishSession() {
  clearSprintTimer();
  clearActiveSession();
  if (session.kind === "diagnostic") {
    finishPrerequisiteDiagnostic();
    return;
  }
  if (session.kind === "placement") {
    finishPlacementDiagnostic();
    return;
  }
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
    rooms: workshop.rooms,
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

  // 賢者試煉最佳紀錄（可重刷）
  if (isMasterTrial && session.roundTotal > 0) {
    const best = store.read("masterTrialBest", null);
    if (!best || roundPct > best.pct) {
      store.write("masterTrialBest", { pct: roundPct, at: Date.now() });
    }
  }

  let trialSettlement = null;
  if (isMasterTrial && session.roundTotal > 0) {
    trialSettlement = settleMasterTrialTier(
      session.trialTier ?? "bronze",
      roundPct,
      store.read("masterTrialTiers", {})
    );
    store.write("masterTrialTiers", trialSettlement.records);
    if (trialSettlement.rewardStardust > 0) {
      addStardust(trialSettlement.rewardStardust);
      session.stardustEarned += trialSettlement.rewardStardust;
    }
  }

  // 每週神殿盃：submit 最佳成績＋戰績神諭
  let weeklyRecord = null;
  if (session.kind === "weekly" && session.roundTotal > 0) {
    weeklyRecord = submitWeeklyResult(
      Math.round(roundPct * 100),
      Math.round(session.elapsedTotal / 1000),
      session.maxStreak,
      { questionCount: session.roundTotal, answerLog: session.perQuestion }
    );
    syncWeeklyResultToServer(weeklyRecord);
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
  const nextStep = session.kind === "node"
    ? nextStepRecommendation(stats, session.wasMasteredAtStart)
    : null;
  const replayAction = isMasterTrial
    ? { label: `⚡ 再挑戰一次賢者試煉・${session.node.name}`, start: () => startMasterTrial(session.trialTier ?? "bronze") }
    : session.kind === "weekly"
      ? { label: "⚡ 再挑戰一次本週神殿盃", start: startWeeklySession }
      : null;
  if (nextStep?.kind === "just-mastered") sfx.rare();
  const newDrops = session.kind === "node" || isMasterTrial
    ? evaluateCollection(session.node.id, stats, ctx)
    : [];
  quizArea.appendChild(makeSummary(stats, newBadges, newDrops, weeklyRecord, challengeReply, nextStep));
  newDrops.forEach((drop) => showCardReveal(
    drop.item,
    drop.item.id === MASTER_TRIAL_ID ? "傳說" : drop.tier >= 2 ? "稀有" : "普通"
  ));

  const player = getPlayerName();
  if (player) {
    const nodeIds = allNodes(tree).filter((n) => !n.contentPending).map((n) => n.id);
    submitScore(player, overallMasteryPct(nodeIds));
  }

  if (nextStep) {
    const retryBtn = document.createElement("button");
    retryBtn.className = "q-next";
    retryBtn.textContent = nextStep.label;
    retryBtn.addEventListener("click", () => startQuizWithStrategy(session.node, session.strategy ?? "slow"));
    quizArea.appendChild(retryBtn);
  } else if (replayAction) {
    const replayBtn = document.createElement("button");
    replayBtn.className = "q-next";
    replayBtn.textContent = replayAction.label;
    replayBtn.addEventListener("click", replayAction.start);
    quizArea.appendChild(replayBtn);
  }

  const backBtn = document.createElement("button");
  backBtn.className = `q-next${nextStep || replayAction ? " q-next-secondary" : ""}`;
  backBtn.textContent = "回神話星圖";
  backBtn.addEventListener("click", goHome);
  quizArea.appendChild(backBtn);
}

function finishPlacementDiagnostic() {
  const completedAt = Date.now();
  const nodesById = Object.fromEntries(allNodes(tree).map((node) => [node.id, node]));
  const progress = applyPlacementDiagnostic(
    store.read("progress", {}),
    session.queue,
    session.perQuestion.map((answer) => answer.c === 1),
    nodesById,
    completedAt
  );
  store.write("progress", progress);
  const testedIds = [...new Set(session.queue.map((question) => question._placementNodeId).filter(Boolean))];
  const passed = testedIds.filter((id) => progress[id]?.placementDiagnostic?.completedAt === completedAt
    && progress[id].placementDiagnostic.passed);
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const summary = document.createElement("section");
  summary.className = "q-summary placement-summary";
  summary.appendChild(Object.assign(document.createElement("h3"), { textContent: "快速定位完成" }));
  summary.appendChild(Object.assign(document.createElement("p"), {
    textContent: passed.length > 0
      ? `依你的實際作答，已點亮：${passed.map((id) => nodesById[id]?.name ?? id).join("、")}。神話星圖已開出更接近你的起點。`
      : "這次先保留原本起點；神話星圖會從基礎開始，之後也能使用各節點的先備診斷捷徑。",
  }));
  quizArea.appendChild(summary);
  const backBtn = document.createElement("button");
  backBtn.className = "q-next";
  backBtn.textContent = "查看我的新起點";
  backBtn.addEventListener("click", goHome);
  quizArea.appendChild(backBtn);
  announce(`快速定位完成，點亮 ${passed.length} 個技能起點`);
}

function finishPrerequisiteDiagnostic() {
  const answers = session.perQuestion.map((answer) => answer.c === 1);
  const diagnosticResult = evaluatePrerequisiteDiagnostic(session.queue, answers);
  const progress = applyDiagnosticResult(
    store.read("progress", {}),
    session.node.id,
    diagnosticResult
  );
  store.write("progress", progress);

  document.getElementById("quiz-streak").innerHTML = "";
  document.getElementById("mastery-progress-live")?.remove();
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const summary = document.createElement("section");
  summary.className = "q-summary diagnostic-summary";
  const heading = document.createElement("h3");
  heading.textContent = diagnosticResult.passed ? "先備診斷通過！" : "先補一小塊，就能再挑戰";
  summary.appendChild(heading);
  const detail = document.createElement("p");
  if (diagnosticResult.passed) {
    detail.textContent = `答對 ${diagnosticResult.correctCount}/${diagnosticResult.total} 題，已直接解鎖「${session.node.name}」。`;
  } else {
    const nodeIndex = Object.fromEntries(allNodes(tree).map((node) => [node.id, node]));
    const gapNames = diagnosticResult.gapNodeIds.map((id) => nodeIndex[id]?.name ?? id);
    detail.textContent = `答對 ${diagnosticResult.correctCount}/${diagnosticResult.total} 題；還要補強：${gapNames.join("、")}。`;
  }
  summary.appendChild(detail);
  quizArea.appendChild(summary);

  const action = document.createElement("button");
  action.className = "q-next";
  action.textContent = diagnosticResult.passed ? `進入「${session.node.name}」` : "再做一次先備診斷";
  action.addEventListener("click", () => (
    diagnosticResult.passed ? startQuiz(session.node) : startPrerequisiteDiagnostic(session.node)
  ));
  quizArea.appendChild(action);
  const backBtn = document.createElement("button");
  backBtn.className = "q-next q-next-secondary";
  backBtn.textContent = "回神話星圖";
  backBtn.addEventListener("click", goHome);
  quizArea.appendChild(backBtn);
  announce(diagnosticResult.passed
    ? `先備診斷通過，已解鎖${session.node.name}`
    : detail.textContent);
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
      note: session.retryDone > 0 ? "思路走穩了——重新答對的題目，就是你的了。" : "雅典娜的智慧引路人：穩定的推理，是一步一步走出來的。",
    };
  }
  if (session.strategy === "repair") {
    return {
      tile: `<div class="report-tile"><strong>${session.repairedCount}/${session.repairTotal}</strong><div>收服小魔物</div></div>`,
      note: session.repairedCount > 0 ? "卷軸上的迷霧變淡了！" : "還有幾處迷霧，等你回來解開。",
    };
  }
  return {
    tile: `<div class="report-tile"><strong>${session.fastCount}/${session.roundTotal}</strong><div>疾筆</div></div>`,
    note: session.fastCount >= 6 ? "雅典娜的智慧引路人向你點頭。" : "思考與速度都會越練越穩。",
  };
}

function makeSummary(stats, newBadges, newDrops = [], weeklyRecord = null, challengeReply = null, nextStep = null) {
  const box = document.createElement("div");
  box.className = "q-summary";

  if (nextStep?.kind === "just-mastered") {
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "mastery-complete-banner",
      textContent: "✦ 神諭卷軸完卷！",
    }));
  }

  const milestones = claimStardustMilestones(getStardustCount());
  if (milestones.newlyUnlocked.length > 0) {
    sfx.rare();
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "stardust-milestone-celebration",
      textContent: `✦ 星屑里程碑：瓶中已聚集 ${milestones.newlyUnlocked.at(-1)} 粒星光！`,
    }));
  }

  const stars = roundStars(session.roundTotal, session.roundCorrect);
  const mascotState = stars >= 2 ? "celebrate" : stars >= 1 ? "happy" : "idle";
  const guardianImage = guardianImageForStrand(strandIdForNode(session.node?.id));
  if (guardianImage || session.mascot) {
    const mascotBox = document.createElement("div");
    mascotBox.className = "summary-mascot";
    const img = document.createElement("img");
    img.src = guardianImage ?? `assets/mascot/${session.mascot}-${mascotState}.png`;
    img.alt = guardianImage ? "神殿守護者" : "智慧引路人";
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
    if (i < stars) scheduleTimer(() => sfx.star(i), 150 * i + 200);
  }
  box.appendChild(starsBox);

  // 古賢者卷軸的一句話（40% 機率）
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

  // 每週神殿盃戰績神諭（結算頁最顯眼位置）
  if (weeklyRecord) {
    const w = document.createElement("div");
    w.className = "weekly-result";
    const isNewBest = weeklyRecord.pct === Math.round((session.roundCorrect / session.roundTotal) * 100);
    w.innerHTML = `<div class="weekly-result-title">🏆 ${isNewBest ? "本週戰績神諭" : "本週最佳戰績神諭（這場沒刷新）"}</div>`;
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
    result.innerHTML = `<div class="weekly-result-title">⚔ 回擊神諭・${challengeReply.pct}% ・ ${challengeReply.totalSec} 秒</div>
      <code>${challengeReply.code}</code><p>複製給出題同學，他輸入後也會獲得「切磋章」。</p>`;
    const copy = document.createElement("button");
    copy.className = "daily-btn";
    copy.textContent = "複製回擊神諭";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(challengeReply.code);
        copy.textContent = "已複製！";
      } catch { /* 剪貼簿不可用時仍可手動複製 */ }
    });
    result.appendChild(copy);
    box.appendChild(result);
  }

  // 稀有印記出貨：結算頁鄭重重播（不再被下一題吃掉）
  session.rareDrops.forEach((stamp) => {
    const drop = document.createElement("div");
    drop.className = "ms-drop rare-drop";
    const sym = document.createElement("div");
    sym.className = "ms-sym";
    sym.textContent = stamp.sym;
    const text = document.createElement("div");
    text.className = "ms-drop-text";
    text.textContent = `✦ 稀有印記出土：${stamp.name}！收進神話印記圖鑑了`;
    drop.appendChild(sym);
    drop.appendChild(text);
    box.appendChild(drop);
  });

  if (session.stardustEarned > 0) {
    const drop = document.createElement("div");
    drop.className = "ms-drop stardust-drop";
    drop.textContent = `✦ 本輪有 ${session.stardustEarned} 粒星屑注入瓶中`;
    box.appendChild(drop);
  }

  // 新神諭卷軸入庫／雅典娜蠟封演出
  newDrops.forEach((d) => {
    const drop = document.createElement("div");
    drop.className = "ms-drop" + (d.tier === 2 ? " ms-drop-sealed" : "");
    const sym = document.createElement("div");
    sym.className = "ms-sym";
    sym.textContent = d.item.sym;
    const text = document.createElement("div");
    text.className = "ms-drop-text";
    text.textContent = d.tier === 2
      ? `🖋 雅典娜蠟封：${d.item.name}——這一卷，正式是你的了`
      : `📜 新神諭卷軸入庫：${d.item.name}——收進你的神諭卷軸集了`;
    drop.appendChild(sym);
    drop.appendChild(text);
    if (d.tier === 2) drop.appendChild(Object.assign(document.createElement("div"), { className: "ms-seal", textContent: "蠟封" }));
    box.appendChild(drop);
  });

  const strategyBits = strategySummaryBits();
  const totalSec = Math.round(session.elapsedTotal / 1000);
  const reports = document.createElement("div");
  reports.className = "summary-reports";
  reports.innerHTML = `
    <div class="report-tile"><strong>${Math.round((session.roundCorrect / session.roundTotal) * 100) || 0}%</strong><div>本輪正確率</div></div>
    <div class="report-tile"><strong>${totalSec}s</strong><div>本輪用時</div></div>
    <div class="report-tile"><strong>${session.maxStreak}</strong><div>最長連詠</div></div>
    ${strategyBits.tile || `<div class="report-tile"><strong>${stats.totalAttempts}</strong><div>累計作答</div></div>`}
  `;
  box.appendChild(reports);

  if (strategyBits.note) {
    box.appendChild(Object.assign(document.createElement("div"), {
      className: "strategy-note",
      textContent: strategyBits.note,
    }));
  }

  const shareText = `我在步學吾數答對了 ${session.roundCorrect}/${session.roundTotal} 題，連詠 ×${session.maxStreak}！`;
  const shareBtn = document.createElement("button");
  shareBtn.className = "daily-btn summary-share-btn";
  shareBtn.textContent = "分享這次成果";
  shareBtn.addEventListener("click", async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "步學吾數", text: shareText });
        shareBtn.textContent = "已開啟分享！";
        showToast("已開啟分享，可傳給同學或家人");
      } catch { /* 使用者取消分享時維持原畫面 */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      shareBtn.textContent = "已複製成果！";
      showToast("已複製成果文字");
    } catch {
      showToast("無法複製成果，請稍後再試", "error");
    }
  });
  box.appendChild(shareBtn);

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
  section.innerHTML = `<h3>🎯 見習出題所・五題挑戰包</h3>
    <p>神諭卷軸獲得雅典娜蠟封後，你就有資格從該卷挑五題考同學。從自己最容易上當的題挑起，才是真正的出題人。</p>`;

  const creator = document.createElement("div");
  creator.className = "challenge-creator";
  if (eligible.length === 0) {
    creator.innerHTML = `<div class="challenge-locked">🔒 先讓任一卷神諭卷軸獲得「雅典娜蠟封」，就能解鎖見習出題權。</div>`;
  } else {
    const selected = new Map();
    const filterLabel = document.createElement("label");
    filterLabel.htmlFor = "challenge-bank-select";
    filterLabel.textContent = "挑選題庫";
    const filter = document.createElement("select");
    filter.id = "challenge-bank-select";
    [...new Set(eligible.map((q) => q._nodeId))].forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = nodeNames[id] ?? id;
      filter.appendChild(option);
    });
    const count = document.createElement("strong");
    count.textContent = "已挑 0 / 5 題";
    const fullMessage = document.createElement("span");
    fullMessage.className = "challenge-full-message";
    fullMessage.setAttribute("role", "status");
    const list = document.createElement("div");
    list.className = "challenge-question-list";
    const output = document.createElement("div");
    output.className = "challenge-code-output";
    const make = document.createElement("button");
    make.className = "daily-btn";
    make.textContent = "編成挑戰神諭";
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
        const questionText = document.createElement("strong");
        questionText.textContent = questionLabel(question);
        const accuracyLine = document.createElement("small");
        accuracyLine.textContent = accuracyText;
        copy.append(questionText, accuracyLine);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.set(question.id, question);
          else selected.delete(question.id);
          count.textContent = `已挑 ${selected.size} / 5 題`;
          fullMessage.textContent = selected.size === 5 ? "已滿 5 題，取消一題才能改選" : "";
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
      output.innerHTML = `<strong>你的挑戰神諭：</strong><code>${code}</code>`;
      try { await navigator.clipboard.writeText(code); output.append("（已複製）"); } catch { /* 可手動複製 */ }
    });
    creator.append(filterLabel, filter, count, fullMessage, list, make, output);
    renderList();
  }
  section.appendChild(creator);

  const receiver = document.createElement("div");
  receiver.className = "challenge-receiver";
  receiver.innerHTML = "<h4>收下同學的挑戰</h4>";
  const inputLabel = document.createElement("label");
  inputLabel.htmlFor = "challenge-code";
  inputLabel.textContent = "同學的挑戰神諭";
  const input = document.createElement("input");
  input.id = "challenge-code";
  input.placeholder = "例如：BX2-…";
  secureCodeInput(input);
  const result = document.createElement("div");
  result.className = "challenge-message";
  const play = document.createElement("button");
  play.className = "daily-btn";
  play.textContent = "開始接招";
  play.addEventListener("click", () => {
    const queue = decodeChallenge(input.value, catalog);
    if (queue?.error === "too-old") { result.textContent = "這組挑戰神諭格式太舊，請出題同學重新產生。"; return; }
    if (!Array.isArray(queue)) { result.textContent = "這組挑戰神諭看不懂，請再核對一次。"; return; }
    startChallengeSession(input.value.trim().toUpperCase(), queue);
  });
  receiver.append(inputLabel, input, makePasteButton(input), play, result);
  section.appendChild(receiver);

  const reply = document.createElement("div");
  reply.className = "challenge-receiver";
  reply.innerHTML = "<h4>查看同學的回擊</h4>";
  const replyLabel = document.createElement("label");
  replyLabel.htmlFor = "counter-code";
  replyLabel.textContent = "同學的回擊神諭";
  const replyInput = document.createElement("input");
  replyInput.id = "counter-code";
  replyInput.placeholder = "例如：XR2-…";
  secureCodeInput(replyInput);
  const replyResult = document.createElement("div");
  replyResult.className = "challenge-message";
  const inspect = document.createElement("button");
  inspect.className = "daily-btn";
  inspect.textContent = "拆開回擊";
  inspect.addEventListener("click", () => {
    const mine = store.read("lastCreatedChallenge", null);
    const decoded = mine ? decodeReply(replyInput.value, mine.code) : null;
    if (decoded?.error === "too-old") { replyResult.textContent = "這組回擊神諭格式太舊，請同學重新挑戰。"; return; }
    if (!decoded) { replyResult.textContent = mine ? "這不是這一包的回擊神諭。" : "這台裝置還沒有你出過的挑戰包。"; return; }
    unlockBadge("sparring");
    replyResult.textContent = `同學答對 ${decoded.pct}%，用了 ${decoded.totalSec} 秒。你也獲得「切磋章」！`;
  });
  reply.append(replyLabel, replyInput, makePasteButton(replyInput), inspect, replyResult);
  section.appendChild(reply);
  return section;
}

function makeTravelCase() {
  const section = document.createElement("section");
  section.className = "travel-case";
  section.innerHTML = `<h3>🧳 神使行囊</h3><p>把這台裝置上的神諭卷軸、精通進度、印記與錯題迷霧簿全部打包，到另一台電腦繼續喚醒。</p>`;
  const actions = document.createElement("div");
  actions.className = "travel-actions";
  const pack = document.createElement("button");
  pack.className = "daily-btn";
  pack.textContent = "📦 打包我的神諭卷軸集";
  pack.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportNamespace(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `步學吾數-神諭卷軸集-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    scheduleTimer(() => URL.revokeObjectURL(url), 0);
  });
  const label = document.createElement("label");
  label.className = "daily-btn travel-import";
  label.htmlFor = "travel-case-file";
  label.textContent = "🧳 打開神使行囊";
  const file = document.createElement("input");
  file.id = "travel-case-file";
  file.type = "file";
  file.accept = "application/json,.json";
  file.className = "visually-hidden";
  file.addEventListener("change", async () => {
    const picked = file.files?.[0];
    if (!picked) return;
    try {
      const bundle = JSON.parse(await picked.text());
      if (!confirm("匯入會覆蓋這台裝置的同名進度，要繼續嗎？")) return;
      const count = importNamespace(bundle, localStorage, tree);
      alert(`已打開神使行囊，帶回 ${count} 項紀錄。`);
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

  const bestStreak = Number(store.read("bestStreak", 0)) || 0;
  const trialBest = store.read("masterTrialBest", null);
  const summary = document.createElement("div");
  summary.className = "dash-summary";
  summary.innerHTML = `<h3>整體戰力值</h3><p>${overview.masteredCount} / ${overview.totalNodes} 個學習點已開通</p>
    <p class="dash-records">歷史最長連詠：${bestStreak}${trialBest ? ` ・ 賢者試煉最佳：${Math.round(trialBest.pct * 100)}%` : ""}</p>`;
  el.appendChild(summary);

  // 神諭卷軸集（含完成度與入手日期）
  const col = getCollection();
  const ownedCount = Object.keys(col).length;
  const sealedCount = Object.values(col).filter((c) => c.tier >= 2).length;
  const tierSum = Object.values(col).reduce((acc, c) => acc + c.tier, 0);
  const colPct = Math.round((tierSum / (MANUSCRIPTS.length * 2)) * 100);
  const colSection = document.createElement("div");
  colSection.className = "dash-collection";
  colSection.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `神諭卷軸集（${ownedCount} / ${MANUSCRIPTS.length} 入庫 · ${sealedCount} 蠟封 · 完成度 ${colPct}%）`,
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
          textContent: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} 入庫`,
        }));
      }
    }
    if (tier >= 2) {
      card.appendChild(Object.assign(document.createElement("div"), { className: "ms-seal", textContent: "蠟封" }));
    }
    if (dust.dusty) {
      card.appendChild(Object.assign(document.createElement("div"), {
        className: "dust-note",
        textContent: `神諭卷軸沉暗・答對 ${3 - dust.careCount} 題星光黯淡處即重新發亮`,
      }));
    }
    grid.appendChild(card);
  });
  colSection.appendChild(grid);
  el.appendChild(colSection);

  // 神話印記圖鑑（三階稀有度完整收藏）
  const stampBook = getRareStamps();
  const stampCount = Object.keys(stampBook).length;
  const stampSection = document.createElement("div");
  stampSection.className = "dash-stampbook";
  stampSection.appendChild(Object.assign(document.createElement("h3"), {
    textContent: `神話印記圖鑑（${stampCount} / ${RARE_STAMPS.length}）——神諭啟示裡答對有機會出土`,
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
    cell.appendChild(Object.assign(document.createElement("div"), {
      className: `stamp-rarity rarity-${s.rarity}`,
      textContent: `${s.rarity}・${RARITY_MYTHOS[s.rarity]}`,
    }));
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

  // 星屑瓶與番外語錄
  const inkTotal = getStardustCount();
  const milestones = claimStardustMilestones(inkTotal);
  const extras = unlockedExtraQuotes(inkTotal);
  const inkSection = document.createElement("div");
  inkSection.className = "dash-ink";
  milestones.unlocked.forEach((milestone) => inkSection.classList.add(`stardust-${milestone}`));
  inkSection.innerHTML = `<h3>星屑瓶（共 ${inkTotal} 粒 · 每 7 粒解鎖一則古賢者卷軸番外）</h3>`;
  milestones.unlocked.forEach((milestone) => {
    inkSection.appendChild(Object.assign(document.createElement("div"), {
      className: "stardust-milestone-marker",
      textContent: `✦ ${milestone} 粒星屑里程碑`,
    }));
  });
  if (extras.length === 0) {
    inkSection.appendChild(Object.assign(document.createElement("p"), {
      className: "ink-hint",
      textContent: "完成每日喚醒單就落下一粒星屑。斷了也不會倒掉——瓶子只進不出。",
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
  errorSection.innerHTML = `<h3>錯題迷霧簿（${wrongList.length} 處迷霧等你解開）</h3>`;
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
  boardSection.innerHTML = "<h3>班級排行榜</h3><p class=\"score-disclosure\">學生自行回報成績，未經伺服器驗證。</p>";
  getLeaderboard().forEach((row, idx) => {
    const line = document.createElement("div");
    line.className = "leaderboard-row";
    line.textContent = `${idx + 1}. ${row.name} — ${Math.round(row.masteryPct * 100)}%${row.flagged ? `・${row.flagLabel ?? "⚠️ 建議複驗"}` : ""}`;
    boardSection.appendChild(line);
  });
  el.appendChild(boardSection);

  el.appendChild(await makeChallengeHub());
  el.appendChild(makeTravelCase());
  el.appendChild(makeShareCard());
  el.appendChild(makeNameEditor());

  showView("dashboard");
}

// 收藏分享卡：canvas 畫星空羊皮卷紀錄卡，一鍵下載
function makeShareCard() {
  const box = document.createElement("div");
  box.className = "dash-share";
  const btn = document.createElement("button");
  btn.className = "daily-btn";
  btn.textContent = "🖼 產生我的神諭卷軸集卡片（下載炫耀）";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "正在產生卡片…";
    renderShareCard((success) => {
      btn.disabled = false;
      btn.textContent = success ? "✓ 已產生並下載！" : "🖼 再試一次產生卡片";
      showToast(success ? "已產生並下載炫耀卡片" : "無法產生下載卡片，請稍後再試", success ? "success" : "error");
    });
  });
  box.appendChild(btn);
  return box;
}

function renderShareCard(onComplete = () => {}) {
  const col = getCollection();
  const ownedCount = Object.keys(col).length;
  const sealedCount = Object.values(col).filter((c) => c.tier >= 2).length;
  const stampBook = getRareStamps();
  const ownedStamps = RARE_STAMPS.filter((s) => stampBook[s.id]);
  const bestStreak = Number(store.read("bestStreak", 0)) || 0;
  const name = getPlayerName() ?? "同學";

  const W = 800, H = 460;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    onComplete(false);
    return;
  }

  // 星空羊皮卷底（繪圖邏輯不動，僅換語境）
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
  ctx.fillText("步學吾數・奧林帕斯神諭卷軸集", 44, 74);
  ctx.font = "24px 'Noto Sans TC', sans-serif";
  ctx.fillText(`見習神諭者：${name}`, 44, 130);

  ctx.font = "22px 'Noto Sans TC', sans-serif";
  const lines = [
    `📜 神諭卷軸入庫 ${ownedCount} / ${MANUSCRIPTS.length}　🖋 雅典娜蠟封 ${sealedCount}`,
    `✦ 稀有印記 ${ownedStamps.length} / ${RARE_STAMPS.length}　🔥 歷史最長連詠 ${bestStreak}`,
  ];
  lines.forEach((t, i) => ctx.fillText(t, 44, 184 + i * 44));

  // 印記區
  ctx.font = "20px 'Noto Sans TC', sans-serif";
  ctx.fillText("神話印記圖鑑：", 44, 296);
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
    ctx.fillText("（還沒有印記——去神諭啟示裡挖！）", 130, 334);
  }

  const d = new Date();
  ctx.fillStyle = "#8a7455";
  ctx.font = "16px 'Noto Sans TC', sans-serif";
  ctx.fillText(`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} · bxws-math`, W - 230, H - 40);

  const finish = () => {
    try {
      const a = document.createElement("a");
      a.download = `步學吾數神諭卷軸集-${name}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      onComplete(true);
    } catch {
      onComplete(false);
    }
  };

  // 駐塔導師蓋台（載得到就畫，載不到直接出卡）
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
  label.htmlFor = "player-name";
  label.textContent = "排行榜暱稱：";
  const input = document.createElement("input");
  input.id = "player-name";
  input.type = "text";
  input.maxLength = 12;
  input.value = getPlayerName() ?? "";
  input.placeholder = "例如：小數達人";
  input.addEventListener("change", () => {
    const safeName = input.value.trim().slice(0, 12).replace(/[\/:*?"<>|\n\r]/g, "");
    input.value = safeName;
    if (safeName) setPlayerName(safeName);
  });
  box.appendChild(label);
  box.appendChild(input);
  return box;
}

// 音效／震動開關（首次預設開啟，使用者可手動關閉）
function setupSfxToggle() {
  const btn = document.getElementById("nav-sfx");
  const sync = () => {
    const on = isSfxOn();
    btn.textContent = on ? "🔊" : "🔇";
    btn.title = on ? "音效開（點擊關閉）" : "音效關（點擊開啟）";
    btn.setAttribute("aria-pressed", String(on));
  };
  btn.addEventListener("click", () => {
    setSfxOn(!isSfxOn());
    sync();
    if (isSfxOn()) sfx.correct(0);
  });
  sync();
}

function setupAccessibilitySettings() {
  const sync = () => {
    const settings = applyAccessibilitySettings();
    document.querySelectorAll('input[name="font-size"]').forEach((input) => {
      input.checked = input.value === settings.fontSize;
    });
    document.getElementById("setting-sprint-warning").checked = settings.sprintWarning;
    document.getElementById("setting-combo-break").checked = settings.comboBreakEffect;
  };
  document.querySelectorAll('input[name="font-size"]').forEach((input) => input.addEventListener("change", () => {
    if (input.checked) setAccessibilitySetting("fontSize", input.value);
    sync();
  }));
  document.getElementById("setting-sprint-warning").addEventListener("change", (event) => {
    setAccessibilitySetting("sprintWarning", event.currentTarget.checked); sync();
  });
  document.getElementById("setting-combo-break").addEventListener("change", (event) => {
    setAccessibilitySetting("comboBreakEffect", event.currentTarget.checked); sync();
  });
  sync();
}

function setupOptionalMythosArt() {
  const image = document.getElementById("mythos-style-guide");
  const mythosFigure = image?.closest("figure");
  if (!image || !mythosFigure) return;
  const hideMissingArt = () => { mythosFigure.hidden = true; };
  image.addEventListener("error", hideMissingArt, { once: true });
  if (image.complete && image.naturalWidth === 0) hideMissingArt();
}

document.getElementById("nav-home").addEventListener("click", goHome);
document.getElementById("nav-workshop").addEventListener("click", showWorkshop);
document.getElementById("nav-dashboard").addEventListener("click", showDashboard);
setupSfxToggle();
setupAccessibilitySettings();
setupOptionalMythosArt();
document.addEventListener("click", () => queueMicrotask(showStorageNoticeIfNeeded), true);
document.addEventListener("change", () => queueMicrotask(showStorageNoticeIfNeeded), true);
document.querySelector(".quill-deco")?.addEventListener("error", (event) => {
  event.currentTarget.hidden = true;
}, { once: true });

const allowedHosts = new Set(["bxws-math.vercel.app", "bxws-math.pages.dev", "bxws-math.netlify.app", "localhost", "127.0.0.1"]);
if (!allowedHosts.has(location.hostname)) {
  const warning = document.createElement("div");
  warning.className = "clone-warning";
  warning.textContent = "⚠️ 這不是《步學吾數》官方網站，請勿輸入或匯入個人學習資料。";
  document.body.prepend(warning);
}

if (!getPlayerName()) setPlayerName("同學");
goHome();
