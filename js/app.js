import {
  loadSkillTree, allNodes, nodeState, getNodeMastery, isNodeMastered, isNodePlayable, recommendedNextNode,
} from "./schema.js";
import { renderSkillTree, computeOverview } from "./skilltree-ui.js";
import {
  buildSession, buildMasterSession, buildReviewSession, countDueReviews, flattenBank,
  insertMentorCoachingQuestion, loadQuestionBank, mentorCoachingTransition,
} from "./quiz-loader.js";
import {
  cardRevealClass, guardianImageForStrand, masteryEncouragement,
  renderQuestion, streakMilestone,
} from "./quiz-ui.js";
import { recordAnswer, overallMasteryPct, getNodeStats } from "./scoreEngine.js";
import { updateBox, hasRecord, isDue } from "./leitner.js";
import { addWrongQuestion, listWrongQuestions, removeWrongQuestion } from "./errorbook.js";
import { evaluateBadges, getUnlockedBadges, unlockBadge, BADGES } from "./achievements.js";
import { getPlayerName, setPlayerName, submitScore, getLeaderboard } from "./leaderboard.js";
import {
  MANUSCRIPTS, getCollection, evaluateCollection,
  RARE_STAMPS, STAMP_RARITIES, getRareStamps, resolveEncounterReward,
  RARITY_MYTHOS, collectionBonusFor,
} from "./collection.js";
import {
  bossFor, bossGate, newBossState, applyAnswer as applyBossAnswer, bossOutcome, recordBossOutcome,
  bossPhase, reviveWithBlessing, playerDamage,
} from "./boss.js";
import {
  buildSeededQuestions, newChallengeSeed, recordPvpRun, pvpChallengeFor,
} from "./pvp.js";
import {
  SPIRIT_MAX, EQUIP_MAX, GUARDIAN_SPIRIT, HERO_SPIRITS,
  isPrime, divisors, divisorCount, isPerfect, classify, spiritName, spiritArt,
  spiritCardData,
  canFuse, resolveFusion, getSpiritBook, ownsSpirit, captureSpirit,
  stardustBalance, spendStardust, forceSettleStardust, getEquippedSpirits, setEquippedSpirits, spiritBonusFor,
} from "./fusion.js";
import {
  PEDESTAL_COUNT, DECORATIONS, decorationById, unlockedDecorationIds,
  getSanctuaryLayout, placeDecoration, clearPedestal,
  TITLES, unlockedTitles, getInscription, setInscription, inscriptionText,
  totalMasteredCount,
} from "./sanctuary.js";
import {
  ARENA_QUESTION_COUNT, seasonKey, seasonLabel, normalizeRoomCode, isValidRoomCode,
  roomSeed, recordLocalArenaBest, getLocalArenaBest, submitArenaResult, fetchArenaBoard,
} from "./arena.js";
import {
  isMarketOpen, isMarketBonus, nextMarketText, npcListings, MARKET_MIN_PRICE, MARKET_MAX_PRICE,
  listSpirit, fetchMarketBoard, buyListing, fetchMyListings, claimPayout,
} from "./market.js";
import { pickQuote, QUOTES, unlockedExtraQuotes, EXTRA_QUOTES } from "./quotes.js";
import {
  store, exportNamespace, importNamespace, isStorageBroken, recordActivityStreak, runMigrations, clearNamespace,
} from "./store.js";
import { sfx, isSfxOn, setSfxOn, areHapticsOn, setHapticsOn } from "./sfx.js";
import { applyAccessibilitySettings, getAccessibilitySettings, setAccessibilitySetting } from "./accessibility.js";
import {
  getDaily, bumpDaily, dailyTasks, maybeDropInk, getInkDays, getStardustCount,
  addStardust, claimStardustMilestones, returningWelcome,
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
  fusion: document.getElementById("view-fusion"),
  sanctuary: document.getElementById("view-sanctuary"),
  arena: document.getElementById("view-arena"),
};

let tree = null;
let session = { queue: [], index: 0, node: null, mascot: null, streak: 0, streakShielded: false, maxStreak: 0, roundCorrect: 0, roundTotal: 0 };
let nextBtnEl = null;
let fusionState = { tab: "fuse", pick: [], lastResult: null };
let sanctuarySelectedPedestal = null;
let sanctuaryJustPlaced = null;
let arenaState = { strandId: null };

// 繆思聖所五神殿甦醒橫幅圖（生圖檔在 assets/mythos/temples/，缺檔會自動退回純文字標題）
const TEMPLE_IMG = {
  "num-quantity": "labyrinth",
  algebra: "sphinx",
  "space-shape": "cyclops",
  "relation-pattern": "moirai",
  "data-uncertainty": "delphi",
};
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
  toast.textContent = message;
  document.body.appendChild(toast);
  // 更新常駐的 aria-live 區（插入即帶字的 live region 讀屏常不播報，改寫既有區才穩）
  const live = document.getElementById("toast-live");
  if (live) live.textContent = message;
  setTimeout(() => toast.remove(), 2200);
}

// 每題答對就給一個即時「連詠」浮字，讓每一下都有打擊感（K2，非只在里程碑）
function showComboPop(streak) {
  const quizArea = document.getElementById("quiz-area");
  const card = quizArea?.querySelector(".q-card");
  if (!card) return;
  const pop = document.createElement("div");
  pop.className = "combo-pop";
  pop.setAttribute("aria-hidden", "true");
  pop.textContent = streak >= 2 ? `連詠 ×${streak}！` : "答對 ＋1";
  if (streak >= 5) pop.classList.add("combo-pop-hot");
  card.appendChild(pop);
  scheduleTimer(() => pop.remove(), 850);
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

// 完全數融合高光：確定性、每次融成完全數必觸發（不是拉霸機率），並解釋為什麼特別
function showPerfectFusionCelebration(n) {
  document.querySelector(".perfect-fusion-overlay")?.remove();
  if (isSfxOn()) sfx.rare();
  const overlay = document.createElement("div");
  overlay.className = "perfect-fusion-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", `融合出完全數 ${n}`);
  const card = document.createElement("div");
  card.className = "perfect-fusion-card";
  const rays = document.createElement("div");
  rays.className = "perfect-fusion-rays";
  card.appendChild(rays);
  card.appendChild(Object.assign(document.createElement("span"), { className: "perfect-fusion-badge", textContent: "傳說・完全數" }));
  card.appendChild(spiritBadgeEl(n));
  card.appendChild(Object.assign(document.createElement("h3"), { textContent: `${spiritName(n)}（${n}）` }));
  const proper = divisors(n).filter((d) => d !== n);
  card.appendChild(Object.assign(document.createElement("p"), {
    className: "perfect-fusion-why",
    textContent: `${n} 的真因數 ${proper.join(" ＋ ")} ＝ ${n}——自己等於自己所有真因數的和，這種數叫「完全數」，超級稀有！`,
  }));
  card.appendChild(Object.assign(document.createElement("p"), { className: "perfect-fusion-tap", textContent: "點一下繼續" }));
  overlay.appendChild(card);
  const close = () => overlay.remove();
  overlay.addEventListener("click", close, { once: true });
  document.body.appendChild(overlay);
  const t = window.setTimeout(() => { close(); pendingTimers.delete(t); }, 4200);
  pendingTimers.add(t);
}

// 分級高光：完全數是最高階（另有 showPerfectFusionCelebration）；平方數、豐饒數是次一階，
// 各給一支比普通答對強、比完全數弱的演出，並用一句話解釋它為什麼特別（K3）。
function specialFusionKind(n) {
  if (isPerfect(n)) return null; // 完全數走專屬高光
  if (Number.isInteger(Math.sqrt(n)) && n > 1) return "square";
  const properSum = divisors(n).filter((d) => d !== n).reduce((s, d) => s + d, 0);
  if (properSum > n) return "abundant";
  return null;
}
function showSpecialFusionCelebration(n, kind) {
  document.querySelector(".special-fusion-toast")?.remove();
  if (isSfxOn()) sfx.rare();
  const root = Math.sqrt(n);
  const why = kind === "square"
    ? `${n} ＝ ${root}×${root}，是一個「平方數」，剛好排成正方形！`
    : `${n} 的真因數全部加起來比 ${n} 還大，因數超級多，是「豐饒數」！`;
  const badge = kind === "square" ? "稀有・平方數" : "稀有・豐饒數";
  const el = document.createElement("div");
  el.className = `special-fusion-toast special-${kind}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<span class="special-fusion-badge">${badge}</span><strong>${spiritName(n)}（${n}）</strong><span class="special-fusion-why">${why}</span>`;
  document.body.appendChild(el);
  scheduleTimer(() => el.remove(), 3200);
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
  { id: "slow", name: "沉思描解", plain: "慢慢想", color: "--cp-blue", desc: "答錯的題目，這一輪排到隊尾再想一次。適合想穩穩學會。" },
  { id: "repair", name: "智慧回溯", plain: "先練錯題", color: "--cp-red", desc: "優先練習之前錯過的題目，答對就把它從錯題本清掉。" },
  { id: "sprint", name: "飛翼疾行", plain: "限時挑戰", color: "--cp-orange", desc: "每題 20 秒內答對記一次疾行。超時不算錯，只是不記疾行。" },
];
const SPRINT_LIMIT_MS = 20000;
const SPRINT_AUTONEXT_MS = 1200; // 疾行模式答對後停留看一眼眉批再自動跳題（答錯不自動跳）

function showView(name) {
  const changed = !views[name]?.classList.contains("active");
  if (changed) clearPendingTimers();
  if (name !== "quiz") clearSprintTimer();
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("active", key === name));
  const navByView = { home: "nav-home", workshop: "nav-workshop", fusion: "nav-fusion", sanctuary: "nav-sanctuary", arena: "nav-arena", dashboard: "nav-dashboard" };
  Object.values(navByView).forEach((id) => document.getElementById(id)?.removeAttribute("aria-current"));
  if (navByView[name]) document.getElementById(navByView[name])?.setAttribute("aria-current", "page");
  window.scrollTo(0, 0);
  const labels = { home: "神話星圖", quiz: "練習題", dashboard: "我的儀表板", workshop: "奧林帕斯五座神殿", fusion: "星靈融合殿", sanctuary: "繆思聖所", arena: "神殿競技場" };
  const heading = views[name]?.querySelector("h2");
  if (heading) {
    heading.focus({ preventScroll: true });
    announce(`已進入：${labels[name]}`);
  }
  updateNavGating();
}

// B1：全新玩家（還沒有任何有意義進度）先把神殿/融合/聖所/競技場的導覽做成「柔鎖」——
// 只是變淡＋加提示，仍可點進去探索，但一眼看得出「該先去神話星圖練習解鎖」，
// 而不是點進去才撞空狀態。一旦有進度就自動解除。
function updateNavGating() {
  const brandNew = !hasMeaningfulProgress(store.read("progress", {}));
  const gated = { "nav-workshop": "先在神話星圖練習，精熟後解鎖 Boss 戰",
    "nav-fusion": "先練出精熟節點，會掉星靈素材開始融合",
    "nav-sanctuary": "先精熟第一個節點，就能開始佈置聖所",
    "nav-arena": "先解鎖節點，再和同學比速度與正確率" };
  Object.entries(gated).forEach(([id, hint]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle("nav-locked", brandNew);
    if (brandNew) {
      btn.setAttribute("data-lock-hint", hint);
      btn.title = hint; // 原生 tooltip：滑鼠停留也能看到「為什麼還不能點」，不只靠 CSS ::after
    } else {
      btn.removeAttribute("data-lock-hint");
      btn.removeAttribute("title");
    }
  });
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
    concluded: false,
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

// 只有一般練習／每日注光是「可續讀」的；Boss、競技場、PvP、神殿盃、賢者試煉都是一次性對局，
// 半途不該被存成殘局——否則首頁會把已結束的 Boss 結算誤標成「繼續練習 還剩 N 題」，
// 點回去還會重跑 renderBossOutcome 重複發質數融合建材。
const RESUMABLE_KINDS = new Set(["node", "review"]);

// ── session 斷點續傳：每答一題落盤，關掉分頁也不蒸發 ──
// 作答完成後存 index+1（該題已記錄，續傳從下一題開始）
function saveActiveSession(indexOffset = 0) {
  const idx = session.index + indexOffset;
  if (!session.node || !RESUMABLE_KINDS.has(session.kind) || idx >= session.queue.length) {
    if (indexOffset > 0 && RESUMABLE_KINDS.has(session.kind)) clearActiveSession();
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
  // 只讀不寫：練習天數只在真的作答時累加（見 handleAnswer），不因「打開首頁」就 +1
  const activityStreak = store.read("activityStreak", { count: 0, lastDate: null });

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
    textContent: `🔥 累計練習 ${activityStreak.count} 天`,
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
  // 可用餘額（能拿去市集／融合花的）擺第一個、最顯眼；累計量是里程碑用的，放後面括號
  ink.textContent = `🫙 星屑：可用 ${stardustBalance()} 粒（累計 ${getStardustCount()} 粒）`;
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

// 首頁單一主要行動：把「今日第一步」升級成會依現況變化的大按鈕，
// 一眼看到「現在最該做的一件事」，其餘卡片降為次要（U4/K6）。
function makeTodayFirstStep(container, dueCount) {
  const saved = store.read("activeSession", null);
  let label;
  let sub;
  if (saved?.queue && saved.index < saved.queue.length) {
    label = "▶ 繼續上次的練習";
    sub = `還剩 ${saved.queue.length - saved.index} 題`;
  } else if (dueCount > 0) {
    label = "📖 複習今天到期的題目";
    sub = `有 ${dueCount} 題該複習了`;
  } else {
    const rec = recommendedNextNode(tree);
    label = "✦ 開始今天的練習";
    sub = rec ? `推薦：${rec.name}` : "挑一顆星圖節點開始";
  }
  const button = document.createElement("button");
  button.className = "home-hero-action";
  button.appendChild(Object.assign(document.createElement("span"), { className: "hero-action-label", textContent: label }));
  button.appendChild(Object.assign(document.createElement("span"), { className: "hero-action-sub", textContent: sub }));
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
    if (room.available && bossFor(room.id)) {
      const strand = tree.strands.find((s) => s.id === room.id);
      const gate = bossGate(strand, store.read("progress", {}), tree.masteryThreshold ?? 0.8);
      const bossBtn = document.createElement("button");
      bossBtn.type = "button";
      bossBtn.className = "boss-challenge-btn" + (gate.eligible ? "" : " boss-challenge-btn-locked");
      bossBtn.disabled = !gate.eligible;
      bossBtn.textContent = gate.eligible
        ? `⚔ 挑戰${bossFor(room.id).name}`
        : `🔒 精熟度達 ${Math.round((tree.masteryThreshold ?? 0.8) * 100)}% 解鎖神殿試煉`;
      bossBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        startBossFight(room.id);
      });
      bossBtn.addEventListener("keydown", (event) => event.stopPropagation());
      copy.appendChild(bossBtn);
    }
    if (room.available) {
      const pvpStrand = tree.strands.find((s) => s.id === room.id);
      const pvpHasPlayable = (pvpStrand?.nodes ?? []).some((n) => isNodePlayable(n, tree));
      const pvpWrap = document.createElement("div");
      pvpWrap.className = "pvp-challenge-wrap";
      const seedInput = document.createElement("input");
      seedInput.type = "text";
      seedInput.inputMode = "numeric";
      seedInput.placeholder = "挑戰碼（留空自動產生）";
      seedInput.className = "pvp-seed-input";
      seedInput.addEventListener("click", (event) => event.stopPropagation());
      seedInput.addEventListener("keydown", (event) => event.stopPropagation());
      const pvpBtn = document.createElement("button");
      pvpBtn.type = "button";
      pvpBtn.className = "pvp-challenge-btn";
      pvpBtn.disabled = !pvpHasPlayable;
      pvpBtn.textContent = pvpHasPlayable ? "🎲 挑戰書（10 題本機比分）" : "🔒 先解鎖此神殿至少一節點";
      pvpBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        startPvpChallenge(room.id, seedInput.value.trim());
      });
      pvpWrap.append(seedInput, pvpBtn);
      pvpWrap.appendChild(Object.assign(document.createElement("p"), {
        className: "score-disclosure",
        textContent: "挑戰書是本機紀錄、和同學口頭比分，未經伺服器驗證，同一組挑戰碼才是同一份題目。",
      }));
      copy.appendChild(pvpWrap);
    }
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
      const settings = getAccessibilitySettings();
      // 警示關（預設）：溫和「挑戰自己」框架、不閃紅、不滴答；警示開：倒數＋最後 5 秒催促
      el.textContent = settings.sprintWarning ? `⏱ 疾筆倒數 ${left} 秒` : `⏱ 挑戰自己・約 ${left} 秒`;
      el.classList.toggle("timer-hot", settings.sprintWarning && left <= 5);
      if (settings.sprintWarning && left <= 5 && left !== lastShown) sfx.tick();
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
      { title: "2 / 3・今日第一步", text: "首頁最上方那顆金色大按鈕就是「今日第一步」，不知道先練什麼時按它，會帶你到最適合的地方。" },
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
      const heading = dialog.querySelector("h3");
      heading.textContent = step.title;
      dialog.querySelector("p").textContent = step.text;
      const button = dialog.querySelector("button");
      button.textContent = index === steps.length - 1 ? "完成導覽，開始探索" : "下一步";
      // 換頁時把焦點移到新標題並播報，讓讀屏使用者知道進到第幾步（否則焦點卡在同一顆按鈕、內容默默換掉）
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      announce(`${step.title}。${step.text}`);
      button.addEventListener("click", () => {
        if (index < steps.length - 1) {
          index += 1;
          renderStep();
          return;
        }
        store.write("seenTip", true);
        dialog.close();
        dialog.remove();
        document.querySelector(".home-hero-action")?.focus();
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
  const message = "想接著練？點首頁上方那顆金色大按鈕（今日第一步），智慧引路人會帶你走到最適合的地方。";
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

  // 返回鍵：選錯或想退出時不必被卡在策略頁（U1）
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "strategy-back-btn";
  backBtn.innerHTML = "← 返回星圖";
  backBtn.addEventListener("click", () => showView("home"));
  picker.appendChild(backBtn);

  picker.appendChild(Object.assign(document.createElement("div"), {
    className: "strategy-picker-title",
    textContent: "這一輪要怎麼練？（不確定就直接開始）",
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
  const recommendedId = (lastUsed === "repair" && nodeErrorCount === 0) ? "slow" : lastUsed;
  const recommended = STRATEGIES.find((s) => s.id === recommendedId) ?? STRATEGIES[0];

  // 一鍵直接開始：用推薦策略立刻開局，孩子不必先讀懂三張卡（U1）
  const quickStart = document.createElement("button");
  quickStart.type = "button";
  quickStart.className = "strategy-quickstart";
  quickStart.innerHTML = `⚡ 直接開始<small>用推薦：${recommended.plain}</small>`;
  quickStart.addEventListener("click", () => startQuizWithStrategy(node, recommended.id));
  picker.appendChild(quickStart);

  picker.appendChild(Object.assign(document.createElement("div"), {
    className: "strategy-picker-or", textContent: "或自己選一種練法",
  }));

  STRATEGIES.forEach((s) => {
    const card = document.createElement("button");
    const unavailable = s.id === "repair" && nodeErrorCount === 0;
    const isRecommended = !unavailable && s.id === recommendedId;
    card.className = "strategy-card" + (isRecommended ? " last-used" : "");
    card.style.setProperty("--strategy-color", `var(${s.color})`);
    card.disabled = unavailable;
    const title = document.createElement("strong");
    title.innerHTML = `${s.name}<i class="strategy-plain">（${s.plain}）</i>`;
    const desc = document.createElement("span");
    desc.textContent = unavailable ? "目前沒有錯題可以練" : s.desc;
    card.appendChild(title);
    card.appendChild(desc);
    if (isRecommended) {
      const tag = document.createElement("em");
      tag.className = "strategy-recommend-tag";
      tag.textContent = isFirstTime ? "新手推薦" : "上次用的";
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

function shuffleSample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// 神殿試煉：答對＝對守護神造成傷害，出題沿用既有 buildMasterSession，不重造出題邏輯
async function startBossFight(strandId) {
  const strand = tree.strands.find((s) => s.id === strandId);
  const boss = bossFor(strandId);
  if (!strand || !boss) return;
  const gate = bossGate(strand, store.read("progress", {}), tree.masteryThreshold ?? 0.8);
  if (!gate.eligible) return;
  showView("quiz");
  clearSprintTimer();
  document.getElementById("quiz-node-name").textContent = `神殿試煉・${boss.name}`;
  document.getElementById("quiz-progressbar").innerHTML = "";
  document.getElementById("quiz-streak").innerHTML = "";
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const playableIds = strand.nodes.filter((n) => isNodePlayable(n, tree)).map((n) => n.id);
  const pool = playableIds.length > 20 ? shuffleSample(playableIds, 20) : playableIds;
  const queue = await buildMasterSession(pool, 30);
  const collection = getCollection();
  const freeRetryAvailable = strand.nodes.some((n) => (collection[n.id]?.tier ?? 0) >= 2);
  session = newSession({
    queue,
    node: { id: `boss-${strandId}`, name: `神殿試煉・${boss.name}` },
    mascot: tree.strandVisuals?.[strandId]?.mascot ?? "davinci",
    kind: "boss",
    boss: { ...newBossState(strandId), freeRetryAvailable },
  });
  preloadMascot(session.mascot);
  renderCurrentQuestion();
}

// PvP 本機挑戰書：同一組 seed 產出同一份題目，可以跟自己（或告訴同學同一組碼）比分。
// 不接後端，先把「可重現題目＋記戰績」這一半做穩，日後要接即時對戰時沿用同一套 seed 機制。
async function startPvpChallenge(strandId, seedInput) {
  const strand = tree.strands.find((s) => s.id === strandId);
  if (!strand) return;
  const seed = seedInput && Number.isFinite(Number(seedInput)) && seedInput !== ""
    ? Number(seedInput)
    : newChallengeSeed();
  showView("quiz");
  clearSprintTimer();
  document.getElementById("quiz-node-name").textContent = `挑戰書・${strand.name}`;
  document.getElementById("quiz-progressbar").innerHTML = "";
  document.getElementById("quiz-streak").innerHTML = "";
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const playableIds = strand.nodes.filter((n) => isNodePlayable(n, tree)).map((n) => n.id);
  const pool = playableIds.length > 20 ? shuffleSample(playableIds, 20) : playableIds;
  const banks = await Promise.all(pool.map((id) => loadQuestionBank(id)
    .then((bank) => flattenBank(bank).map((q) => ({ ...q, _nodeId: id })))
    .catch(() => [])));
  const allQuestions = banks.flat();
  if (allQuestions.length === 0) {
    quizArea.appendChild(Object.assign(document.createElement("p"), {
      className: "pvp-empty-msg",
      textContent: "這座神殿還沒有可挑戰的題目，先去解鎖幾個節點吧。",
    }));
    return;
  }
  const queue = buildSeededQuestions(seed, allQuestions, 10);
  session = newSession({
    queue,
    node: { id: `pvp-${strandId}`, name: `挑戰書・${strand.name}` },
    mascot: tree.strandVisuals?.[strandId]?.mascot ?? "davinci",
    kind: "pvp",
    pvp: { seed, strandId, totalDmg: 0, maxCombo: 0, startingBest: pvpChallengeFor(seed)?.bestDmg ?? 0 },
  });
  preloadMascot(session.mascot);
  renderCurrentQuestion();
}

// ---------- 星靈融合殿 ----------
// 沒有立繪的星靈（90+ 隻）用程序化差異化：外框依 kind、色相依數字本身、
// 底部因數點陣＝真實因數個數，讓每隻一眼可辨且視覺特徵綁真實數學性質（K1）。
function spiritFactorDots(n) {
  const wrap = document.createElement("span");
  wrap.className = "spirit-factors";
  wrap.setAttribute("aria-hidden", "true");
  const count = Math.min(8, divisorCount(n));
  for (let i = 0; i < count; i += 1) wrap.appendChild(Object.assign(document.createElement("i"), { className: "spirit-dot" }));
  return wrap;
}
function spiritBadgeEl(n) {
  const el = document.createElement("div");
  const cls = classify(n);
  el.className = `spirit-badge spirit-${cls.kind}`;
  el.title = `${spiritName(n)}・${cls.rarity}・${divisorCount(n)} 個因數`;
  // 色相由數字決定（黃金比例散開，相鄰數字顏色明顯不同）
  el.style.setProperty("--spirit-hue", String(Math.round((n * 137.508) % 360)));
  const art = spiritArt(n);
  if (art) {
    const img = document.createElement("img");
    img.src = `assets/spirits/${art}.png`;
    img.alt = spiritName(n);
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      img.remove();
      el.classList.add("spirit-fallback");
      el.prepend(spiritFactorDots(n));
      el.prepend(Object.assign(document.createElement("span"), { className: "spirit-num", textContent: String(n) }));
    });
    el.appendChild(img);
  } else {
    el.classList.add("spirit-fallback");
    el.appendChild(Object.assign(document.createElement("span"), { className: "spirit-num", textContent: String(n) }));
    el.appendChild(spiritFactorDots(n));
  }
  return el;
}

const SHOP_STOCK = [
  { n: 13, price: 8 }, { n: 17, price: 8 }, { n: 19, price: 8 }, { n: 23, price: 10 },
  { n: 29, price: 10 }, { n: 31, price: 12 }, { n: 37, price: 12 }, { n: 6, price: 6 },
  { n: 12, price: 6 }, { n: 28, price: 20 },
];
const SHOP_DAILY_LIMIT = 3;

function shopPurchasesToday() {
  return Number(getDaily().spiritShop ?? 0);
}

function showFusion() {
  showView("fusion");
  // 新手起手：圖鑑空時送 2、3 兩顆質數種子，讓學生馬上能融合 2×3=6 學起來
  if (Object.keys(getSpiritBook()).length === 0) {
    captureSpirit(2);
    captureSpirit(3);
    showToast("✦ 雅典娜先送你兩顆質靈：2 與 3，試著融合出 6 吧", "success");
  }
  renderFusion();
}

function renderFusion() {
  const root = document.getElementById("fusion-content");
  root.innerHTML = "";

  const header = document.createElement("div");
  header.className = "fusion-header";
  header.appendChild(Object.assign(document.createElement("h3"), { textContent: "星靈融合殿" }));
  header.appendChild(Object.assign(document.createElement("span"), {
    className: "fusion-wallet",
    textContent: `🫙 星屑餘額：${stardustBalance()}`,
  }));
  root.appendChild(header);

  const tabs = document.createElement("div");
  tabs.className = "fusion-tabs";
  [["fuse", "融合"], ["codex", "星靈圖鑑"], ["equip", "出戰"], ["shop", "赫米斯商店"], ["market", "班級市集"]].forEach(([key, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = fusionState.tab === key;
    btn.className = "fusion-tab" + (isActive ? " active" : "");
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    btn.textContent = label;
    btn.addEventListener("click", () => { fusionState.tab = key; renderFusion(); });
    tabs.appendChild(btn);
  });
  root.appendChild(tabs);

  const body = document.createElement("div");
  body.className = "fusion-body";
  root.appendChild(body);
  if (fusionState.tab === "fuse") renderFuseTab(body);
  else if (fusionState.tab === "codex") renderCodexTab(body);
  else if (fusionState.tab === "equip") renderEquipTab(body);
  else if (fusionState.tab === "market") renderMarketTab(body);
  else renderShopTab(body);
}

function ownedSpiritNumbers() {
  return Object.keys(getSpiritBook()).map(Number).sort((a, b) => a - b);
}

function renderFuseTab(body) {
  const owned = ownedSpiritNumbers();
  if (owned.length === 0) {
    body.appendChild(Object.assign(document.createElement("p"), {
      className: "fusion-empty",
      textContent: "還沒有任何星靈。去五座神殿打贏守護者、或答對神諭啟示，就能收服質數星靈。",
    }));
    return;
  }

  body.appendChild(Object.assign(document.createElement("p"), {
    className: "fusion-hint",
    textContent: "選兩顆星靈相乘融合出新星靈。質數星靈永遠只能收服、無法融合誕生——這正是質數的祕密。父方不會消失。",
  }));

  const slots = document.createElement("div");
  slots.className = "fusion-slots";
  [0, 1].forEach((i) => {
    const slot = document.createElement("div");
    slot.className = "fusion-slot";
    const pick = fusionState.pick[i];
    if (pick != null) {
      slot.appendChild(spiritBadgeEl(pick));
      slot.appendChild(Object.assign(document.createElement("span"), { className: "fusion-slot-name", textContent: spiritName(pick) }));
    } else {
      slot.appendChild(Object.assign(document.createElement("span"), { className: "fusion-slot-empty", textContent: i === 0 ? "選第一顆" : "選第二顆" }));
    }
    slots.appendChild(slot);
    if (i === 0) slots.appendChild(Object.assign(document.createElement("span"), { className: "fusion-times", textContent: "×" }));
  });
  body.appendChild(slots);

  const a = fusionState.pick[0];
  const b = fusionState.pick[1];
  const check = a != null && b != null ? canFuse(a, b) : null;
  const guessWrap = document.createElement("div");
  guessWrap.className = "fusion-guess";
  if (check?.ok) {
    guessWrap.appendChild(Object.assign(document.createElement("label"), { textContent: `${a} × ${b} = ？`, htmlFor: "fusion-guess-input" }));
    const input = document.createElement("input");
    input.id = "fusion-guess-input";
    input.type = "number";
    input.inputMode = "numeric";
    input.className = "fusion-guess-input";
    input.placeholder = "算算看乘積";
    guessWrap.appendChild(input);
    const fuseBtn = document.createElement("button");
    fuseBtn.type = "button";
    fuseBtn.className = "fusion-do-btn";
    fuseBtn.textContent = "✦ 融合";
    fuseBtn.addEventListener("click", () => {
      const result = resolveFusion(a, b, input.value.trim() === "" ? null : Number(input.value));
      // 認真心算的正向誘因：算對乘積才有 2 星屑獎勵（綁「真的算對一題乘法」這個真實能力，非操作次數）；
      // 算錯仍能拿到星靈、只溫和收 1 星屑，維持不挫折。用正向差距取代懲罰導向。
      // 去重：因融合不消耗父星靈、同一對可重複融合，只在「首次正確算出某個乘積」時發獎，
      // 之後重融同一乘積不再給，避免記住答案反覆刷星屑（比照里程碑一次性旗標）。
      if (result?.ok && result.correct && input.value.trim() !== "") {
        const rewarded = store.read("fusionRewarded", {});
        if (!rewarded[result.product]) {
          rewarded[result.product] = true;
          store.write("fusionRewarded", rewarded);
          addStardust(2);
          result.bonus = 2;
        }
      }
      fusionState.lastResult = result;
      fusionState.pick = [];
      // 完全數（6/28…）是本作最稀有的融合成果，值得一次確定性的高光演出（非亂數掉落）
      if (result?.ok && isPerfect(result.product)) {
        showPerfectFusionCelebration(result.product);
      } else if (result?.ok) {
        // 次一階：平方數／豐饒數也給分級高光，讓「哇」的一刻不再一輩子只有 6 和 28（K3）
        const kind = specialFusionKind(result.product);
        if (kind) showSpecialFusionCelebration(result.product, kind);
      }
      renderFusion();
    });
    guessWrap.appendChild(fuseBtn);
  } else if (a != null && b != null) {
    guessWrap.appendChild(Object.assign(document.createElement("p"), { className: "fusion-cant", textContent: check?.reason ?? "這兩顆無法融合" }));
  }
  body.appendChild(guessWrap);

  if (fusionState.lastResult?.ok) {
    const r = fusionState.lastResult;
    const reveal = document.createElement("div");
    reveal.className = `fusion-reveal ${r.correct ? "fusion-correct" : "fusion-gentle"}`;
    reveal.appendChild(spiritBadgeEl(r.product));
    reveal.appendChild(Object.assign(document.createElement("strong"), { textContent: `${r.recipe}` }));
    reveal.appendChild(Object.assign(document.createElement("p"), {
      textContent: r.correct
        ? `算對了！融合出「${spiritName(r.product)}」${r.captured?.isNew ? "（新星靈！）" : ""}${r.bonus ? `，心算正確 +${r.bonus} 星屑 🫙` : ""}`
        : `融合成功，得到「${spiritName(r.product)}」；乘積算錯了，溫和收 ${r.cost} 星屑，下次算準就有 +2 星屑獎勵。`,
    }));
    body.appendChild(reveal);
  }

  const grid = document.createElement("div");
  grid.className = "fusion-picker";
  owned.forEach((n) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "fusion-pick-cell" + (fusionState.pick.includes(n) ? " picked" : "");
    cell.appendChild(spiritBadgeEl(n));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "fusion-pick-num", textContent: String(n) }));
    cell.addEventListener("click", () => {
      const idx = fusionState.pick.indexOf(n);
      if (idx >= 0) fusionState.pick.splice(idx, 1);
      else if (fusionState.pick.length < 2) fusionState.pick.push(n);
      else fusionState.pick = [fusionState.pick[1], n];
      fusionState.lastResult = null;
      renderFusion();
    });
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

function renderCodexTab(body) {
  const owned = new Set(ownedSpiritNumbers());
  body.appendChild(Object.assign(document.createElement("p"), {
    className: "fusion-hint",
    textContent: `已收服 ${owned.size} / ${SPIRIT_MAX - 1} 顆星靈。金框＝完全數傳說靈，藍框＝質數／平方數，一般＝合成數。`,
  }));
  const grid = document.createElement("div");
  grid.className = "codex-grid";
  for (let n = 2; n <= SPIRIT_MAX; n += 1) {
    const cls = classify(n);
    const cell = document.createElement("div");
    cell.className = `codex-cell spirit-${cls.kind}` + (owned.has(n) ? " owned" : " locked");
    if (isPrime(n)) cell.title = `${n} 是質數：只有 1 和 ${n} 兩個因數，沒有任何兩個大於 1 的數相乘做得出它——這就是為什麼質數只能收服、不能融合誕生。`;
    if (owned.has(n)) {
      cell.appendChild(spiritBadgeEl(n));
      const download = document.createElement("button");
      download.type = "button";
      download.className = "spirit-card-download";
      download.textContent = "名片";
      download.setAttribute("aria-label", `下載${spiritName(n)}星靈名片`);
      download.addEventListener("click", () => downloadSpiritCard(n));
      cell.appendChild(download);
    } else {
      cell.appendChild(Object.assign(document.createElement("span"), { className: "codex-locked-num", textContent: String(n) }));
    }
    grid.appendChild(cell);
  }
  body.appendChild(grid);
}

function downloadSpiritCard(n, onComplete = (success) => showToast(
  success ? "星靈名片已下載" : "無法產生星靈名片，請稍後再試",
  success ? "success" : "error",
)) {
  const data = spiritCardData(n);
  if (!data) {
    onComplete(false);
    return;
  }

  const W = 800, H = 460;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    onComplete(false);
    return;
  }

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
  ctx.font = "bold 28px 'Noto Sans TC', sans-serif";
  ctx.fillText("步學吾數・星靈名片", 44, 68);
  ctx.font = "bold 34px 'Noto Sans TC', sans-serif";
  ctx.fillText(data.name, 44, 128);
  ctx.fillStyle = data.rarity === "傳說" ? "#9a6200" : data.rarity === "稀有" ? "#256b7a" : "#4a3620";
  ctx.font = "bold 76px 'Noto Sans TC', sans-serif";
  ctx.fillText(String(data.n), 66, 254);

  ctx.fillStyle = "#4a3620";
  ctx.font = "22px 'Noto Sans TC', sans-serif";
  const details = [
    `質因數分解　${data.factorization}`,
    `稀有度　　　${data.rarity}`,
    `因數數量　　${data.divisorCount} 個`,
    `因數共振　　+${data.bonusPct}%`,
  ];
  details.forEach((line, index) => ctx.fillText(line, 230, 190 + index * 46));

  ctx.fillStyle = "#8a7455";
  ctx.font = "16px 'Noto Sans TC', sans-serif";
  ctx.fillText("加成依真實因數個數計算・單隻上限 6%", 44, H - 70);
  const date = new Date();
  ctx.fillText(`${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} · bxws-math`, W - 230, H - 40);

  const finish = () => {
    try {
      const a = document.createElement("a");
      a.download = `步學吾數星靈名片-${data.n}-${data.name}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      onComplete(true);
    } catch {
      onComplete(false);
    }
  };

  if (!data.art) {
    finish();
    return;
  }
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, W - 190, 42, 140, 140);
    finish();
  };
  img.onerror = finish;
  img.src = `assets/spirits/${data.art}.png`;
}

function renderEquipTab(body) {
  const owned = ownedSpiritNumbers();
  const equipped = getEquippedSpirits();
  body.appendChild(Object.assign(document.createElement("p"), {
    className: "fusion-hint",
    textContent: `出戰最多 ${EQUIP_MAX} 顆星靈，每顆的「因數共振」給 boss 戰一點傷害加成。目前總加成 ${Math.round(spiritBonusFor() * 100)}%（與收集品合計上限 25%）。這只是遊戲效果——數學上 13 和 12 沒有誰比較強，只是因數多寡不同。`,
  }));
  if (owned.length === 0) {
    body.appendChild(Object.assign(document.createElement("p"), { className: "fusion-empty", textContent: "還沒有星靈可以出戰。" }));
    return;
  }
  const grid = document.createElement("div");
  grid.className = "equip-grid";
  owned.forEach((n) => {
    const on = equipped.includes(n);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "equip-cell" + (on ? " equipped" : "");
    cell.appendChild(spiritBadgeEl(n));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "equip-info", textContent: `${n}・因數共振 +${Math.min(6, divisorCount(n))}%` }));
    cell.title = `${n} 有 ${divisorCount(n)} 個因數。因數共振只是遊戲加成，數學上因數多的數並不「比較強」。`;
    cell.addEventListener("click", () => {
      const next = on ? equipped.filter((x) => x !== n) : [...equipped, n];
      setEquippedSpirits(next);
      renderFusion();
    });
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

function renderShopTab(body) {
  const remaining = Math.max(0, SHOP_DAILY_LIMIT - shopPurchasesToday());
  const balance = stardustBalance();
  body.appendChild(Object.assign(document.createElement("p"), {
    className: "fusion-hint",
    textContent: `赫米斯用星屑跟你換稀有星靈。明碼標價、無隨機開箱，每天最多買 ${SHOP_DAILY_LIMIT} 顆（今天還能買 ${remaining} 顆）。`,
  }));
  const grid = document.createElement("div");
  grid.className = "shop-grid";
  SHOP_STOCK.forEach(({ n, price }) => {
    const cell = document.createElement("div");
    cell.className = `shop-cell spirit-${classify(n).kind}`;
    cell.appendChild(spiritBadgeEl(n));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "shop-name", textContent: spiritName(n) }));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "shop-price", textContent: `🫙 ${price}` }));
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "shop-buy-btn";
    const affordable = balance >= price && remaining > 0;
    buyBtn.disabled = !affordable;
    buyBtn.textContent = remaining <= 0 ? "今日售罄" : balance < price ? "星屑不足" : "購買";
    buyBtn.addEventListener("click", () => {
      if (!spendStardust(price)) { showToast("星屑不足", "warn"); return; }
      bumpDaily("spiritShop", 1);
      const got = captureSpirit(n);
      showToast(got?.isNew ? `✦ 買下「${spiritName(n)}」` : `✦ 再買一顆「${spiritName(n)}」`, "success");
      renderFusion();
    });
    cell.appendChild(buyBtn);
    grid.appendChild(cell);
  });
  body.appendChild(grid);
}

async function showSanctuary() {
  tree = tree ?? (await loadSkillTree());
  showView("sanctuary");
  sanctuarySelectedPedestal = null;
  renderSanctuary();
}

function renderSanctuary() {
  const root = document.getElementById("sanctuary-content");
  root.innerHTML = "";
  const progress = store.read("progress", {});
  const unlockedIds = unlockedDecorationIds(tree, progress);
  const titles = unlockedTitles(tree, progress);
  const layout = getSanctuaryLayout();
  const mastered = totalMasteredCount(tree, progress);

  const header = document.createElement("div");
  header.className = "sanctuary-header";
  header.appendChild(Object.assign(document.createElement("h3"), { textContent: "繆思聖所" }));
  header.appendChild(Object.assign(document.createElement("p"), {
    className: "sanctuary-inscription",
    textContent: `「${inscriptionText()}」`,
  }));
  const placedCount = Object.keys(layout).filter((k) => decorationById(layout[k]) && unlockedIds.has(layout[k])).length;
  header.appendChild(Object.assign(document.createElement("span"), {
    className: "sanctuary-stat",
    textContent: `已點亮陳設 ${unlockedIds.size} / ${DECORATIONS.length}　·　已擺放 ${placedCount} / ${PEDESTAL_COUNT} 座　·　已精熟 ${mastered} 節點`,
  }));
  root.appendChild(header);

  // 空狀態引導：全新玩家還沒精熟任何節點時，聖所全是鎖，給一張說明卡＋去練習的出口（U3）
  if (unlockedIds.size === 0) {
    const empty = document.createElement("div");
    empty.className = "sanctuary-empty";
    empty.appendChild(Object.assign(document.createElement("p"), {
      className: "sanctuary-empty-title", textContent: "🏛 你的神殿還在沉睡",
    }));
    empty.appendChild(Object.assign(document.createElement("p"), {
      className: "sanctuary-empty-body",
      textContent: "每精熟一個數學節點，就會點亮一件神殿陳設，可以擺上基座佈置。先去神話星圖練習，回來就有東西可以擺了！",
    }));
    const go = document.createElement("button");
    go.type = "button";
    go.className = "sanctuary-empty-cta";
    go.textContent = "→ 去神話星圖練習";
    go.addEventListener("click", () => showView("home"));
    empty.appendChild(go);
    root.appendChild(empty);
  }

  // 只在剛擺放的那一次播 pop 動畫，讀取後即清旗標，避免每次 render 都重播
  const popIndex = sanctuaryJustPlaced;
  sanctuaryJustPlaced = null;

  // 門楣銘文選擇
  const titleWrap = document.createElement("div");
  titleWrap.className = "sanctuary-titles";
  titleWrap.appendChild(Object.assign(document.createElement("span"), { className: "sanctuary-subtitle", textContent: "門楣銘文（精熟愈多解鎖愈高稱號）" }));
  const titleRow = document.createElement("div");
  titleRow.className = "sanctuary-title-row";
  const current = getInscription();
  TITLES.forEach((t) => {
    const unlocked = titles.some((x) => x.id === t.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sanctuary-title-btn" + (t.id === current ? " active" : "") + (unlocked ? "" : " locked");
    btn.setAttribute("aria-pressed", t.id === current ? "true" : "false");
    btn.textContent = unlocked ? t.text : `🔒 ${t.text}（需精熟 ${t.need}）`;
    btn.disabled = !unlocked;
    btn.addEventListener("click", () => {
      setInscription(t.id, titles);
      renderSanctuary();
    });
    titleRow.appendChild(btn);
  });
  titleWrap.appendChild(titleRow);
  root.appendChild(titleWrap);

  // 八座基座
  const hint = document.createElement("p");
  hint.className = "sanctuary-hint";
  hint.textContent = sanctuarySelectedPedestal == null
    ? "點一座基座選中它，再從下方陳設庫挑一件擺上去。"
    : `已選第 ${sanctuarySelectedPedestal + 1} 座基座，點下方陳設擺放，或再點一次基座取消。`;
  root.appendChild(hint);

  const pedestals = document.createElement("div");
  pedestals.className = "sanctuary-pedestals";
  for (let i = 0; i < PEDESTAL_COUNT; i += 1) {
    const decoId = layout[String(i)];
    const deco = decoId ? decorationById(decoId) : null;
    const stillUnlocked = deco && unlockedIds.has(deco.id);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "sanctuary-pedestal" + (sanctuarySelectedPedestal === i ? " selected" : "") + (deco ? " filled" : "") + (popIndex === i ? " pedestal-pop" : "");
    if (deco && stillUnlocked) {
      cell.appendChild(Object.assign(document.createElement("span"), { className: "pedestal-glyph", textContent: deco.glyph }));
      cell.appendChild(Object.assign(document.createElement("span"), { className: "pedestal-name", textContent: deco.name }));
    } else {
      cell.appendChild(Object.assign(document.createElement("span"), { className: "pedestal-empty", textContent: `基座 ${i + 1}` }));
    }
    cell.addEventListener("click", () => {
      sanctuarySelectedPedestal = sanctuarySelectedPedestal === i ? null : i;
      renderSanctuary();
    });
    pedestals.appendChild(cell);
  }
  root.appendChild(pedestals);

  if (sanctuarySelectedPedestal != null && layout[String(sanctuarySelectedPedestal)]) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "sanctuary-clear-btn";
    clearBtn.textContent = "清空這座基座";
    clearBtn.addEventListener("click", () => {
      clearPedestal(sanctuarySelectedPedestal);
      renderSanctuary();
    });
    root.appendChild(clearBtn);
  }

  // 陳設庫
  const gallery = document.createElement("div");
  gallery.className = "sanctuary-gallery";
  const byStrand = new Map();
  DECORATIONS.forEach((d) => {
    if (!byStrand.has(d.theme)) byStrand.set(d.theme, []);
    byStrand.get(d.theme).push(d);
  });
  byStrand.forEach((items, theme) => {
    const group = document.createElement("div");
    group.className = "sanctuary-group";
    const templeKey = TEMPLE_IMG[items[0]?.strand];
    if (templeKey) {
      const banner = document.createElement("div");
      banner.className = "sanctuary-banner";
      const img = document.createElement("img");
      img.className = "sanctuary-banner-img";
      img.loading = "lazy";
      img.alt = `${theme}・神殿甦醒`;
      img.src = `assets/mythos/temples/${templeKey}-awaken.webp`;
      // 圖若未落地就整個橫幅收掉，改回純文字標題（emoji 仍在各陳設格）
      img.addEventListener("error", () => banner.remove());
      banner.appendChild(img);
      banner.appendChild(Object.assign(document.createElement("span"), { className: "sanctuary-banner-title", textContent: theme }));
      group.appendChild(banner);
    }
    group.appendChild(Object.assign(document.createElement("h4"), { textContent: theme }));
    const grid = document.createElement("div");
    grid.className = "sanctuary-deco-grid";
    items.forEach((d) => {
      const unlocked = unlockedIds.has(d.id);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sanctuary-deco" + (unlocked ? "" : " locked");
      // 未選基座時陳設仍可點（不 disable），點了就引導去選基座——建立「先選誰、再選誰」的因果（U7）
      cell.disabled = !unlocked;
      cell.appendChild(Object.assign(document.createElement("span"), { className: "deco-glyph", textContent: unlocked ? d.glyph : "🔒" }));
      cell.appendChild(Object.assign(document.createElement("span"), { className: "deco-name", textContent: d.name }));
      cell.appendChild(Object.assign(document.createElement("span"), {
        className: "deco-req",
        textContent: unlocked ? "已解鎖" : d.strand === "center" ? `精熟 ${d.milestone} 節點` : `該領域精熟 ${Math.round(d.tierRatio * 100)}%`,
      }));
      if (unlocked) {
        cell.addEventListener("click", () => {
          if (sanctuarySelectedPedestal == null) {
            showToast("先點上方一座基座，再選這件擺上去", "warn");
            const pedRow = document.querySelector(".sanctuary-pedestals");
            if (pedRow) {
              pedRow.classList.remove("pedestals-nudge");
              void pedRow.offsetWidth; // 重觸動畫
              pedRow.classList.add("pedestals-nudge");
              pedRow.scrollIntoView({ block: "center", behavior: "smooth" });
            }
            return;
          }
          placeDecoration(sanctuarySelectedPedestal, d.id, unlockedIds);
          if (isSfxOn()) sfx.correct();
          sanctuaryJustPlaced = sanctuarySelectedPedestal;
          showToast(`✦ 「${d.name}」已擺上基座 ${sanctuarySelectedPedestal + 1}`, "success");
          renderSanctuary();
        });
      }
      grid.appendChild(cell);
    });
    group.appendChild(grid);
    gallery.appendChild(group);
  });
  root.appendChild(gallery);
}

// 兩段式「冷靜期」確認：第一次點變成「確定買？」＋可見倒數，時間內再點一次才真的買，
// 取代會卡住的原生 confirm()；還原時說明「已取消」，避免孩子以為壞掉（U6）。
const BUY_CONFIRM_MS = 6000;
function armConfirmBuy(btn, onConfirm) {
  if (btn.dataset.armed === "1") {
    if (btn._buyTimer) { clearInterval(btn._buyTimer); pendingTimers.delete(btn._buyTimer); btn._buyTimer = null; }
    onConfirm();
    return;
  }
  btn.dataset.armed = "1";
  const original = btn.dataset.origLabel || btn.textContent;
  btn.dataset.origLabel = original;
  btn.classList.add("buy-armed");
  let left = Math.round(BUY_CONFIRM_MS / 1000);
  btn.textContent = `再點一次確定購買（${left}）`;
  const iv = window.setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(iv); pendingTimers.delete(iv); btn._buyTimer = null;
      btn.dataset.armed = "";
      btn.textContent = original;
      btn.classList.remove("buy-armed");
      showToast("已取消購買", "warn");
      return;
    }
    btn.textContent = `再點一次確定購買（${left}）`;
  }, 1000);
  btn._buyTimer = iv;
  pendingTimers.add(iv);
}

async function renderMarketTab(body) {
  const bonus = isMarketBonus();
  const p2pDisabled = store.read("marketP2PDisabled", false) === true;
  body.appendChild(Object.assign(document.createElement("p"), {
    className: "fusion-hint", textContent: nextMarketText(),
  }));
  body.appendChild(Object.assign(document.createElement("p"), {
    className: "fusion-hint market-note-soft",
    textContent: "💡 星屑是遊戲幣、不是真錢，買賣星靈只是好玩，別勉強同學交易。",
  }));

  // 教師開關：關閉同學間 P2P 交易，只留系統商隊（預設開放 P2P）
  const teacherWrap = document.createElement("label");
  teacherWrap.className = "market-teacher-toggle";
  const teacherChk = document.createElement("input");
  teacherChk.type = "checkbox";
  teacherChk.checked = p2pDisabled;
  teacherChk.addEventListener("change", () => {
    store.write("marketP2PDisabled", teacherChk.checked);
    renderFusion();
  });
  teacherWrap.append(teacherChk, Object.assign(document.createElement("span"), { textContent: "本機顯示設定：隱藏同學互相交易，只留系統商隊（只影響這台裝置的畫面）" }));
  body.appendChild(teacherWrap);

  const rawRoom = normalizeRoomCode(store.read("arenaRoom", "") ?? "");
  const hasRoom = isValidRoomCode(rawRoom);
  // NPC 商隊不需要班級房號：沒設房號就用今日單人房號，讓一個人在家也能買
  const caravanRoom = hasRoom ? rawRoom : dailySoloRoomCode();

  // ---- 系統商隊（NPC 補空，天天有貨） ----
  const npcWrap = document.createElement("div");
  npcWrap.className = "market-npc";
  npcWrap.appendChild(Object.assign(document.createElement("h4"), { textContent: bonus ? "🐫 赫米斯商隊（加碼日補貨）" : "🐫 赫米斯商隊（今日補貨）" }));
  const boughtToday = store.read("npcBought", {});
  const todayKey = caravanRoom && npcListings(caravanRoom)[0]?.id.split("-")[1];
  const npcGrid = document.createElement("div");
  npcGrid.className = "market-grid";
  const availableNpc = npcListings(caravanRoom).filter((l) => !ownsSpirit(l.spiritN) && boughtToday[l.id] !== todayKey);
  if (availableNpc.length === 0) {
    npcWrap.appendChild(Object.assign(document.createElement("p"), { className: "fusion-hint", textContent: "今天商隊的貨你都收齊了，明天再來補新貨！" }));
  } else {
    availableNpc.forEach((l) => {
      const cell = document.createElement("div");
      cell.className = `market-cell spirit-${classify(l.spiritN).kind}`;
      cell.appendChild(spiritBadgeEl(l.spiritN));
      cell.appendChild(Object.assign(document.createElement("span"), { className: "market-cell-name", textContent: `${l.spiritN}・${spiritName(l.spiritN)}` }));
      cell.appendChild(Object.assign(document.createElement("span"), { className: "market-cell-seller", textContent: l.sellerName }));
      cell.appendChild(Object.assign(document.createElement("span"), { className: "market-cell-price", textContent: `🫙 ${l.price}` }));
      const affordable = stardustBalance() >= l.price;
      const buyBtn = Object.assign(document.createElement("button"), { type: "button", className: "market-buy-btn" });
      buyBtn.disabled = !affordable;
      buyBtn.textContent = affordable ? "購買" : "星屑不足";
      buyBtn.addEventListener("click", () => armConfirmBuy(buyBtn, () => {
        if (!spendStardust(l.price)) { showToast("星屑不足", "warn"); return; }
        const got = captureSpirit(l.spiritN);
        const bought = store.read("npcBought", {});
        bought[l.id] = todayKey;
        store.write("npcBought", bought);
        showToast(got?.isNew ? `✦ 從商隊買下「${spiritName(l.spiritN)}」` : `✦ 再收一顆「${spiritName(l.spiritN)}」`, "success");
        renderFusion();
      }));
      cell.appendChild(buyBtn);
      npcGrid.appendChild(cell);
    });
    npcWrap.appendChild(npcGrid);
  }
  body.appendChild(npcWrap);

  if (p2pDisabled) {
    body.appendChild(Object.assign(document.createElement("p"), { className: "fusion-hint", textContent: "老師模式開啟中：同學互相交易已關閉，只保留上方系統商隊。" }));
    return;
  }
  if (!hasRoom) {
    body.appendChild(Object.assign(document.createElement("p"), {
      className: "fusion-empty",
      textContent: "想和同班同學互相掛單交易？先設定班級房號。（上方系統商隊一個人也能買）",
    }));
    const goRoomBtn = Object.assign(document.createElement("button"), {
      type: "button", className: "market-goroom-btn", textContent: "⚔️ 去神殿競技場設定房號",
    });
    goRoomBtn.addEventListener("click", () => showArena());
    body.appendChild(goRoomBtn);
    return;
  }
  body.appendChild(Object.assign(document.createElement("p"), { className: "market-room-tag", textContent: `班級房號：${rawRoom}` }));
  const room = rawRoom;

  // 領款橫幅：別人買了你的掛單，回來領星屑
  const mine = await fetchMyListings();
  if (mine?.ok && mine.unclaimedTotal > 0) {
    const banner = document.createElement("div");
    banner.className = "market-payout";
    banner.appendChild(Object.assign(document.createElement("span"), { textContent: `💰 有人買了你的掛單，可領 ${mine.unclaimedTotal} 星屑（${mine.sold.length} 筆）` }));
    const claimBtn = Object.assign(document.createElement("button"), { type: "button", className: "market-claim-btn", textContent: "領取" });
    claimBtn.addEventListener("click", async () => {
      const r = await claimPayout();
      if (r?.ok && r.claimed > 0) { addStardust(r.claimed); showToast(`✦ 入帳 ${r.claimed} 星屑`, "success"); }
      renderFusion();
    });
    banner.appendChild(claimBtn);
    body.appendChild(banner);
  }

  // 掛單表單（天天可掛）
  const owned = ownedSpiritNumbers();
  const listWrap = document.createElement("div");
  listWrap.className = "market-list-form";
  listWrap.appendChild(Object.assign(document.createElement("h4"), { textContent: "我要掛單" }));
  if (owned.length === 0) {
    listWrap.appendChild(Object.assign(document.createElement("p"), { className: "fusion-hint", textContent: "你還沒有星靈可以賣。" }));
  } else {
    const row = document.createElement("div");
    row.className = "market-form-row";
    const sel = document.createElement("select");
    sel.className = "market-spirit-select";
    owned.forEach((n) => sel.appendChild(Object.assign(document.createElement("option"), { value: String(n), textContent: `${n}・${spiritName(n)}` })));
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.className = "market-price-input";
    priceInput.min = String(MARKET_MIN_PRICE);
    priceInput.max = String(MARKET_MAX_PRICE);
    priceInput.value = "10";
    priceInput.placeholder = `${MARKET_MIN_PRICE}–${MARKET_MAX_PRICE} 星屑`;
    const listBtn = Object.assign(document.createElement("button"), { type: "button", className: "market-do-btn", textContent: "掛單" });
    listBtn.addEventListener("click", async () => {
      const price = Math.round(Number(priceInput.value));
      if (!(price >= MARKET_MIN_PRICE && price <= MARKET_MAX_PRICE)) { showToast(`價格需在 ${MARKET_MIN_PRICE}–${MARKET_MAX_PRICE}`, "warn"); return; }
      const r = await listSpirit(room, Number(sel.value), price);
      if (r?.ok) showToast(`✦ 已掛單「${spiritName(Number(sel.value))}」${price} 星屑`, "success");
      else showToast(r?.message ?? "掛單失敗（可能已達上限）", "warn");
      renderFusion();
    });
    row.append(sel, priceInput, listBtn);
    listWrap.appendChild(row);
  }
  body.appendChild(listWrap);

  // 我的開放掛單
  if (mine?.ok && mine.open?.length) {
    const mineWrap = document.createElement("div");
    mineWrap.className = "market-mine";
    mineWrap.appendChild(Object.assign(document.createElement("h4"), { textContent: "我的掛單（開放中）" }));
    mine.open.forEach((l) => {
      mineWrap.appendChild(Object.assign(document.createElement("p"), { className: "market-mine-row", textContent: `${l.spiritN}・${spiritName(l.spiritN)}　🫙 ${l.price}` }));
    });
    body.appendChild(mineWrap);
  }

  // 別人的掛單
  const boardWrap = document.createElement("div");
  boardWrap.className = "market-board";
  boardWrap.appendChild(Object.assign(document.createElement("h4"), { textContent: "同學的掛單" }));
  const boardBody = document.createElement("div");
  boardBody.className = "market-board-body";
  boardBody.appendChild(Object.assign(document.createElement("p"), { className: "fusion-hint", textContent: "讀取中…" }));
  boardWrap.appendChild(boardBody);
  body.appendChild(boardWrap);

  const listings = await fetchMarketBoard(room);
  boardBody.innerHTML = "";
  if (listings === null) {
    boardBody.appendChild(Object.assign(document.createElement("p"), { className: "fusion-empty", textContent: "連不到市集伺服器（可能離線）。" }));
    return;
  }
  if (listings.length === 0) {
    boardBody.appendChild(Object.assign(document.createElement("p"), { className: "fusion-empty", textContent: "目前沒有同學掛單。可以先逛上方的系統商隊！" }));
    return;
  }
  const grid = document.createElement("div");
  grid.className = "market-grid";
  listings.forEach((l) => {
    const cell = document.createElement("div");
    cell.className = `market-cell spirit-${classify(l.spiritN).kind}`;
    cell.appendChild(spiritBadgeEl(l.spiritN));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "market-cell-name", textContent: `${l.spiritN}・${spiritName(l.spiritN)}` }));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "market-cell-seller", textContent: `賣家：${l.sellerName}` }));
    cell.appendChild(Object.assign(document.createElement("span"), { className: "market-cell-price", textContent: `🫙 ${l.price}` }));
    const alreadyOwn = ownsSpirit(l.spiritN);
    const buyBtn = Object.assign(document.createElement("button"), { type: "button", className: "market-buy-btn" });
    const affordable = stardustBalance() >= l.price;
    buyBtn.disabled = alreadyOwn || !affordable;
    buyBtn.textContent = alreadyOwn ? "已擁有" : !affordable ? "星屑不足" : "購買";
    buyBtn.addEventListener("click", () => armConfirmBuy(buyBtn, async () => {
      const r = await buyListing(l.id);
      if (r?.ok) {
        // 伺服器已成交、無法回滾：本機餘額若在冷靜期內被別筆消費用掉導致扣款失敗，
        // 就把餘額結清到 0（付到付得起為止），避免白拿星靈＋帳目對不起來
        if (spendStardust(r.price)) {
          showToast(`✦ 買下「${spiritName(r.spiritN)}」`, "success");
        } else {
          forceSettleStardust();
          showToast(`✦ 買下「${spiritName(r.spiritN)}」（星屑已結清）`, "warn");
        }
        captureSpirit(r.spiritN);
      } else {
        showToast(r?.message ?? "購買失敗", "warn");
      }
      renderFusion();
    }));
    cell.appendChild(buyBtn);
    grid.appendChild(cell);
  });
  boardBody.appendChild(grid);
}

// ---------- 神殿競技場（房號 + 月賽季雲端比分） ----------
async function showArena() {
  tree = tree ?? (await loadSkillTree());
  showView("arena");
  if (!arenaState.strandId) arenaState.strandId = store.read("arenaStrand", null) ?? tree.strands[0]?.id ?? null;
  renderArena();
}

function arenaRoomValue() {
  return store.read("arenaRoom", "") ?? "";
}

// 今日單人房房號：S + YYMMDD（≤8 碼、每天不同）。同日同房＝同 seed 同題，可自我／全球比分。
function dailySoloRoomCode() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return normalizeRoomCode(`S${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}`);
}

async function renderArena() {
  const root = document.getElementById("arena-content");
  root.innerHTML = "";

  const header = document.createElement("div");
  header.className = "arena-header";
  header.appendChild(Object.assign(document.createElement("h3"), { textContent: "神殿競技場" }));
  header.appendChild(Object.assign(document.createElement("p"), { className: "arena-season", textContent: `🏆 ${seasonLabel()}（每月初重置排行）` }));
  header.appendChild(Object.assign(document.createElement("p"), {
    className: "arena-hint",
    textContent: "輸入班級房號，選一座神殿開戰——同房同月的人拿到完全相同的 10 題，比誰答得又對又快。戰績上傳雲端戰況牆（只露前五）。",
  }));
  root.appendChild(header);

  // 房號輸入
  const roomWrap = document.createElement("div");
  roomWrap.className = "arena-room";
  roomWrap.appendChild(Object.assign(document.createElement("label"), { textContent: "班級房號（3–8 碼英數）", htmlFor: "arena-room-input" }));
  const roomInput = document.createElement("input");
  roomInput.id = "arena-room-input";
  roomInput.className = "arena-room-input";
  roomInput.value = arenaRoomValue();
  roomInput.placeholder = "例如 5A2026";
  roomInput.maxLength = 8;
  roomInput.addEventListener("input", () => {
    roomInput.value = normalizeRoomCode(roomInput.value);
    store.write("arenaRoom", roomInput.value || null);
  });
  roomWrap.appendChild(roomInput);
  root.appendChild(roomWrap);

  // 每日單人房：一個人在家也能玩，房號按日期自動生成（同一天全世界同房＝同題可比分）
  const soloBtn = document.createElement("button");
  soloBtn.type = "button";
  soloBtn.className = "arena-solo-btn";
  soloBtn.textContent = "🎯 今日單人房（自動填房號，一個人也能挑戰）";
  soloBtn.addEventListener("click", () => {
    const code = dailySoloRoomCode();
    roomInput.value = code;
    store.write("arenaRoom", code);
    renderArena();
  });
  root.appendChild(soloBtn);

  // 神殿選擇
  const strandWrap = document.createElement("div");
  strandWrap.className = "arena-strands";
  tree.strands.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "arena-strand-btn" + (arenaState.strandId === s.id ? " active" : "");
    btn.setAttribute("aria-pressed", arenaState.strandId === s.id ? "true" : "false");
    btn.textContent = s.name;
    btn.addEventListener("click", () => {
      arenaState.strandId = s.id;
      store.write("arenaStrand", s.id);
      renderArena();
    });
    strandWrap.appendChild(btn);
  });
  root.appendChild(strandWrap);

  const strand = tree.strands.find((s) => s.id === arenaState.strandId);
  const hasPlayable = (strand?.nodes ?? []).some((n) => isNodePlayable(n, tree));

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "arena-start-btn";
  startBtn.disabled = !hasPlayable;
  startBtn.textContent = hasPlayable ? "⚔️ 開戰（10 題計分）" : "🔒 先解鎖此神殿至少一節點";
  startBtn.addEventListener("click", () => {
    const room = normalizeRoomCode(roomInput.value);
    if (!isValidRoomCode(room)) { showToast("請先輸入 3–8 碼房號", "warn"); return; }
    store.write("arenaRoom", room);
    startArenaChallenge(arenaState.strandId, room);
  });
  root.appendChild(startBtn);

  // 戰況牆
  const boardWrap = document.createElement("div");
  boardWrap.className = "arena-board";
  boardWrap.appendChild(Object.assign(document.createElement("h4"), { textContent: "本月戰況牆（前五）" }));
  boardWrap.appendChild(Object.assign(document.createElement("p"), {
    className: "score-disclosure",
    textContent: "成績由學生自行回報、未經伺服器驗證；名字後的 ⚠️ 是系統標記，僅供教師與家長決定是否複驗。",
  }));
  const boardBody = document.createElement("div");
  boardBody.className = "arena-board-body";
  boardBody.appendChild(Object.assign(document.createElement("p"), { className: "arena-loading", textContent: "讀取中…" }));
  boardWrap.appendChild(boardBody);
  root.appendChild(boardWrap);

  const room = normalizeRoomCode(roomInput.value);
  if (isValidRoomCode(room) && strand) {
    const rows = await fetchArenaBoard(room, strand.id);
    renderArenaBoard(boardBody, rows, room, strand);
  } else {
    boardBody.innerHTML = "";
    boardBody.appendChild(Object.assign(document.createElement("p"), { className: "arena-empty", textContent: "輸入房號後即可看到這座神殿的本月排行。" }));
  }
}

function renderArenaBoard(boardBody, rows, room, strand) {
  boardBody.innerHTML = "";
  if (rows === null) {
    // 雲端打不到（Vercel/Netlify 無 D1 或離線）：退本機自我最佳
    const localBest = getLocalArenaBest()[`${normalizeRoomCode(room)}|${seasonKey()}|${strand.id}`];
    boardBody.appendChild(Object.assign(document.createElement("p"), {
      className: "arena-offline",
      textContent: localBest
        ? `目前連不到雲端戰況牆，改顯示你的本機最佳：答對率 ${localBest.pct}%、用時 ${localBest.totalSec} 秒。`
        : "目前連不到雲端戰況牆（可能離線或此平台未接資料庫）。打一場後會存本機最佳，之後可自我比分。",
    }));
    return;
  }
  if (rows.length === 0) {
    boardBody.appendChild(Object.assign(document.createElement("p"), { className: "arena-empty", textContent: "這座神殿本月還沒有人上榜，你可以當第一個！" }));
    return;
  }
  const list = document.createElement("ol");
  list.className = "arena-rank";
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    li.className = "arena-rank-row" + (i === 0 ? " top" : "");
    li.appendChild(Object.assign(document.createElement("span"), { className: "arena-rank-medal", textContent: ["🥇", "🥈", "🥉", "4", "5"][i] ?? String(i + 1) }));
    li.appendChild(Object.assign(document.createElement("span"), { className: "arena-rank-name", textContent: r.name + (r.flagged ? " ⚠️" : "") }));
    li.appendChild(Object.assign(document.createElement("span"), { className: "arena-rank-score", textContent: `${r.pct}%・${r.totalSec}s` }));
    list.appendChild(li);
  });
  boardBody.appendChild(list);
}

async function startArenaChallenge(strandId, roomCode) {
  const strand = tree.strands.find((s) => s.id === strandId);
  if (!strand) return;
  const season = seasonKey();
  const seed = roomSeed(roomCode, strandId, season);
  showView("quiz");
  clearSprintTimer();
  document.getElementById("quiz-node-name").textContent = `競技場・${strand.name}`;
  document.getElementById("quiz-progressbar").innerHTML = "";
  document.getElementById("quiz-streak").innerHTML = "";
  const quizArea = document.getElementById("quiz-area");
  quizArea.innerHTML = "";
  const playableIds = strand.nodes.filter((n) => isNodePlayable(n, tree)).map((n) => n.id);
  const pool = playableIds.length > 20 ? shuffleSample(playableIds, 20) : playableIds;
  const banks = await Promise.all(pool.map((id) => loadQuestionBank(id)
    .then((bank) => flattenBank(bank).map((q) => ({ ...q, _nodeId: id })))
    .catch(() => [])));
  const allQuestions = banks.flat();
  if (allQuestions.length === 0) {
    quizArea.appendChild(Object.assign(document.createElement("p"), { className: "pvp-empty-msg", textContent: "這座神殿還沒有可挑戰的題目，先去解鎖幾個節點吧。" }));
    return;
  }
  const queue = buildSeededQuestions(seed, allQuestions, ARENA_QUESTION_COUNT);
  session = newSession({
    queue,
    node: { id: `arena-${strandId}`, name: `競技場・${strand.name}` },
    mascot: tree.strandVisuals?.[strandId]?.mascot ?? "davinci",
    kind: "arena",
    arena: { roomCode: normalizeRoomCode(roomCode), strandId, season, seed, correct: 0, totalDmg: 0, maxCombo: 0, startAt: Date.now(), count: queue.length },
  });
  const best = getLocalArenaBest()[`${normalizeRoomCode(roomCode)}|${season}|${strandId}`];
  session.arena.ghostSecPerQ = best?.totalSec ? Math.max(2, best.totalSec / (best.questionCount || ARENA_QUESTION_COUNT)) : 12;
  session.arena.ghostLabel = best?.totalSec ? "你的最佳幽靈" : "系統幽靈（12秒/題）";
  preloadMascot(session.mascot);
  renderCurrentQuestion();
  mountArenaGhost();
}

async function finishArenaSession(quizArea) {
  session.concluded = true;
  removeArenaGhost();
  const a = session.arena;
  const totalSec = Math.max(1, Math.round((Date.now() - a.startAt) / 1000));
  const pct = Math.round((a.correct / a.count) * 100);
  const result = { pct, totalSec, totalDmg: a.totalDmg, maxCombo: a.maxCombo, questionCount: a.count };
  recordLocalArenaBest(a.roomCode, a.strandId, result, a.season);

  const card = document.createElement("div");
  card.className = "arena-outcome";
  card.appendChild(Object.assign(document.createElement("h3"), { textContent: "競技場結算" }));
  card.appendChild(Object.assign(document.createElement("p"), { className: "arena-outcome-score", textContent: `答對 ${a.correct} / ${a.count}（${pct}%）・用時 ${totalSec} 秒・最高連擊 ${a.maxCombo}` }));
  const statusEl = Object.assign(document.createElement("p"), { className: "arena-outcome-status", textContent: "上傳戰績中…" });
  card.appendChild(statusEl);
  const backBtn = Object.assign(document.createElement("button"), { type: "button", className: "arena-back-btn", textContent: "回競技場看戰況牆" });
  backBtn.addEventListener("click", showArena);
  card.appendChild(backBtn);
  quizArea.innerHTML = "";
  quizArea.appendChild(card);

  const strand = tree.strands.find((s) => s.id === a.strandId);
  const resp = await submitArenaResult(a.roomCode, a.strandId, result, a.season);
  if (resp?.ok && resp.updated) statusEl.textContent = resp.flagged ? "已上傳（系統標記建議複驗）✅" : "已刷新你在戰況牆的最佳成績 ✅";
  else if (resp?.ok) statusEl.textContent = "已上傳，但沒有超過你先前的最佳成績。";
  else statusEl.textContent = "雲端連不到，已存本機最佳（之後可自我比分）。";

  // 順帶把最新戰況牆補在下面
  const rows = strand ? await fetchArenaBoard(a.roomCode, a.strandId, a.season) : null;
  const boardBody = document.createElement("div");
  boardBody.className = "arena-board-body";
  card.appendChild(Object.assign(document.createElement("h4"), { textContent: "本月戰況牆（前五）" }));
  card.appendChild(boardBody);
  if (strand) renderArenaBoard(boardBody, rows, a.roomCode, strand);
}

// 競技場幽靈對手：拿「你這房這神殿的本機最佳用時」當幽靈，沒有就用系統幽靈（12秒/題），
// 每答一題更新「你 vs 幽靈」的進度條，做出即時競速感（純本機、不需連線）。
function mountArenaGhost() {
  removeArenaGhost();
  const quizArea = document.getElementById("quiz-area");
  const host = quizArea?.parentElement;
  if (!host) return;
  const box = document.createElement("div");
  box.id = "arena-ghost";
  box.className = "arena-ghost";
  box.innerHTML =
    `<div class="arena-ghost-label"></div>` +
    `<div class="arena-ghost-track"><span class="arena-ghost-you"></span></div>` +
    `<div class="arena-ghost-track ghost"><span class="arena-ghost-foe"></span></div>` +
    `<div class="arena-ghost-gap"></div>`;
  host.insertBefore(box, quizArea);
  updateArenaGhost(0);
  // 幽靈依真實時間前進：每秒刷新，讓競速感在作答當下也持續跳動（U5）
  if (session?.arena) {
    session.arena.ghostIv = window.setInterval(() => {
      if (!document.getElementById("arena-ghost") || !session?.arena) return;
      updateArenaGhost(session.arena._answered ?? 0);
    }, 1000);
    pendingTimers.add(session.arena.ghostIv);
  }
}
function updateArenaGhost(answeredCount) {
  const box = document.getElementById("arena-ghost");
  const a = session?.arena;
  if (!box || !a) return;
  a._answered = answeredCount;
  const count = a.count || ARENA_QUESTION_COUNT;
  const perQ = a.ghostSecPerQ || 12;
  const elapsedSec = Math.max(0, (Date.now() - a.startAt) / 1000);
  const ghostDone = Math.min(count, elapsedSec / perQ); // 幽靈以固定步速前進
  box.querySelector(".arena-ghost-label").textContent = `🏁 你 vs ${a.ghostLabel}`;
  box.querySelector(".arena-ghost-you").style.width = `${Math.round((answeredCount / count) * 100)}%`;
  box.querySelector(".arena-ghost-foe").style.width = `${Math.round((ghostDone / count) * 100)}%`;
  const lead = answeredCount - ghostDone;
  const gap = box.querySelector(".arena-ghost-gap");
  if (answeredCount === 0) gap.textContent = "開跑！和幽靈比誰先答完又答得對。";
  else if (lead >= 0.15) { gap.textContent = `領先幽靈 ${(lead * perQ).toFixed(0)} 秒 🔥`; gap.className = "arena-ghost-gap ahead"; }
  else if (lead <= -0.15) { gap.textContent = `落後幽靈 ${(-lead * perQ).toFixed(0)} 秒，加油追！`; gap.className = "arena-ghost-gap behind"; }
  else { gap.textContent = "和幽靈並駕齊驅"; gap.className = "arena-ghost-gap"; }
}
function removeArenaGhost() {
  if (session?.arena?.ghostIv) { clearInterval(session.arena.ghostIv); pendingTimers.delete(session.arena.ghostIv); session.arena.ghostIv = null; }
  document.getElementById("arena-ghost")?.remove();
}

function renderPvpOutcome(result, quizArea) {
  session.concluded = true;
  const beatOwnBest = session.pvp.totalDmg > session.pvp.startingBest;
  const card = document.createElement("div");
  card.className = "pvp-outcome";
  card.appendChild(Object.assign(document.createElement("h3"), {
    textContent: beatOwnBest ? "🎉 打破自己這份考卷的紀錄了！" : "這次的分數",
  }));
  card.appendChild(Object.assign(document.createElement("p"), {
    textContent: `這次總傷害：${session.pvp.totalDmg}（最高連擊 ${session.pvp.maxCombo}）`,
  }));
  card.appendChild(Object.assign(document.createElement("p"), {
    textContent: `目前最佳：${result.bestDmg}・已挑戰 ${result.attempts} 次`,
  }));
  card.appendChild(Object.assign(document.createElement("p"), {
    className: "pvp-seed-code",
    textContent: `挑戰碼：${session.pvp.seed}——把這串數字告訴同學，他輸入同一組碼開同一顆神殿的「挑戰書」，就會拿到同一份題目，可以互相比分！`,
  }));
  const backBtn = document.createElement("button");
  backBtn.className = "q-next";
  backBtn.textContent = "回五座神殿";
  backBtn.addEventListener("click", showWorkshop);
  card.appendChild(backBtn);
  quizArea.appendChild(card);
  announce(beatOwnBest ? "打破自己的挑戰書紀錄" : "挑戰書結算完成");
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
  // 分母鎖在「開局時的題數」：慢筆重描／導師安撫在作答中插進來的題，不會讓分母變大、
  // 讓進度看起來倒退（6/8 → 6/9），已答比例只增不減；額外練習題併入最後一格。
  if (!Number.isFinite(session.plannedTotal) || session.plannedTotal < 1) {
    session.plannedTotal = Math.max(1, session.queue.length);
  }
  const total = session.plannedTotal;
  const answered = Math.min(total, session.index);
  const current = Math.min(total, session.index + 1);
  bar.setAttribute("aria-valuemin", "1");
  bar.setAttribute("aria-valuemax", String(total));
  bar.setAttribute("aria-valuenow", String(current));
  bar.setAttribute("aria-label", `第 ${current} 題，共 ${total} 題`);
  for (let idx = 0; idx < total; idx += 1) {
    const seg = document.createElement("div");
    seg.className = "seg" + (idx < answered ? " filled" : "");
    bar.appendChild(seg);
  }
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

function renderBossPanel(quizArea) {
  const boss = session.boss;
  const meta = bossFor(boss.strandId);
  const phase = bossPhase(boss);
  const panel = document.createElement("section");
  panel.className = "boss-panel";
  panel.setAttribute("aria-label", "神殿試煉血量");
  const foe = document.createElement("div");
  foe.className = "boss-side boss-foe";
  foe.innerHTML = `<span class="boss-icon">${meta.icon}</span><strong>${meta.name}</strong>`;
  const foeBar = document.createElement("div");
  foeBar.className = "boss-hp";
  foeBar.innerHTML = `<span class="boss-hp-fill" style="width:${Math.round((boss.hp / boss.maxHp) * 100)}%"></span>`;
  foe.appendChild(foeBar);
  const phaseLabel = document.createElement("p");
  phaseLabel.className = `boss-phase boss-phase-${phase.id}`;
  phaseLabel.textContent = `${phase.name}・${phase.attack}`;
  const me = document.createElement("div");
  me.className = "boss-side boss-player";
  me.innerHTML = "<strong>你</strong>";
  const meBar = document.createElement("div");
  meBar.className = "boss-hp boss-hp-player";
  meBar.innerHTML = `<span class="boss-hp-fill" style="width:${Math.round((boss.playerHp / boss.playerMaxHp) * 100)}%"></span>`;
  me.appendChild(meBar);
  panel.append(foe, phaseLabel, me);
  quizArea.appendChild(panel);
}

// 答題當下就更新血條與飄傷害數字：讓既有 transition 真正觸發（不再等下一題重建）
function updateBossFeedback(boss, isCorrect) {
  const foe = document.querySelector(".boss-foe");
  const player = document.querySelector(".boss-player");
  if (!foe || !player) return;
  const foeFill = foe.querySelector(".boss-hp-fill");
  const playerFill = player.querySelector(".boss-hp-fill");
  if (foeFill) foeFill.style.width = `${Math.round((boss.hp / boss.maxHp) * 100)}%`;
  if (playerFill) playerFill.style.width = `${Math.round((boss.playerHp / boss.playerMaxHp) * 100)}%`;
  const event = boss.lastEvent ?? { type: isCorrect ? "hit" : "guard", dmg: 0 };
  const target = event.type === "guard" ? player : foe;
  const float = document.createElement("span");
  float.className = `damage-float damage-${event.type}`;
  float.textContent = event.type === "guard"
    ? "🛡 守住了"
    : event.type === "break"
      ? `✦ 破盾 -${event.dmg}`
      : event.type === "counter"
        ? `↩ 反擊 -${event.dmg}`
        : `-${event.dmg}`;
  target.appendChild(float);
  if (event.type !== "guard") target.classList.add("boss-flinch");
  announce(event.type === "guard" ? `${event.attack}來襲，你守住了；看看提示再試一次` : `${event.phaseName}，造成 ${event.dmg} 點傷害`);
  const cleanup = window.setTimeout(() => {
    float.remove();
    if (event.type !== "guard") target.classList.remove("boss-flinch");
    pendingTimers.delete(cleanup);
  }, 700);
  pendingTimers.add(cleanup);
}

function renderBossOutcome(outcome, quizArea) {
  const boss = session.boss;
  session.concluded = true;
  const meta = bossFor(boss.strandId);
  recordBossOutcome(boss.strandId, outcome, session.maxStreak);
  const card = document.createElement("div");
  card.className = `boss-outcome boss-outcome-${outcome}`;
  const title = outcome === "victory" ? `🏆 擊敗${meta.name}！神殿甦醒了一角` : `🛡 這次先撤退——${meta.name}還在守著神殿`;
  card.appendChild(Object.assign(document.createElement("h3"), { textContent: title }));
  if (outcome === "victory") {
    // 擊敗守護神是整站最大的成就，給足慶祝力道：勝利音效＋金光爆閃＋星屑迸射
    if (isSfxOn()) sfx.rare();
    card.classList.add("boss-victory-burst");
    const burst = document.createElement("div");
    burst.className = "boss-victory-sparks";
    burst.setAttribute("aria-hidden", "true");
    burst.innerHTML = "✦✧★✦✧".split("").map((s) => `<span>${s}</span>`).join("");
    card.appendChild(burst);
    // 守護者鎮守一顆質數種子——質數是融合的建材，只能靠戰勝取得
    const seed = GUARDIAN_SPIRIT[boss.strandId];
    if (seed) {
      const got = captureSpirit(seed);
      card.appendChild(Object.assign(document.createElement("p"), {
        className: "boss-spirit-drop",
        textContent: got?.isNew
          ? `✦ ${meta.name}留下了質數種子「${spiritName(seed)}」，去星靈融合殿試著融合吧！`
          : `✦ 又收服一顆「${spiritName(seed)}」，融合殿見。`,
      }));
    }
  }
  card.appendChild(Object.assign(document.createElement("p"), {
    textContent: outcome === "victory"
      ? "你的正確率把守護神的血量打空了。回工坊看看神殿甦醒度吧。"
      : "這一路的作答都已經算進精熟度，沒有失去任何成果；看懂提示後，再練一輪就能再挑戰。",
  }));
  if (outcome !== "victory") {
    const retryBtn = document.createElement("button");
    retryBtn.className = "q-next";
    retryBtn.textContent = "再挑戰一次";
    retryBtn.addEventListener("click", () => startBossFight(boss.strandId));
    card.appendChild(retryBtn);
  }
  const backBtn = document.createElement("button");
  backBtn.className = "q-next";
  backBtn.textContent = "回五座神殿";
  backBtn.addEventListener("click", showWorkshop);
  card.appendChild(backBtn);
  quizArea.appendChild(card);
  announce(outcome === "victory" ? `擊敗${meta.name}` : "神殿試煉未過關，可以再挑戰");
}

// F2 小怪：一般練習的即時「打到東西」爽感——每答對一題打一下，三下擊退一隻，換下一隻。
// 純視覺、無血條門檻、無失敗代價（Boss 戰前的暖身），所以答錯不懲罰、小怪只是站在那。
const MINI_FOES = ["👾", "🦑", "🐙", "🦖", "🦂", "🕷️", "🦇", "🐲"];
const MINI_FOE_HITS = 3;
function miniFoeState() {
  if (!session.miniFoe) session.miniFoe = { hits: 0, defeated: 0, idx: 0 };
  return session.miniFoe;
}
function renderMiniFoe(container) {
  const s = miniFoeState();
  const strip = document.createElement("div");
  strip.className = "mini-foe";
  strip.id = "mini-foe";
  strip.appendChild(Object.assign(document.createElement("span"), { className: "mini-foe-sprite", textContent: MINI_FOES[s.idx % MINI_FOES.length] }));
  const pips = document.createElement("span");
  pips.className = "mini-foe-pips";
  for (let i = 0; i < MINI_FOE_HITS; i += 1) {
    pips.appendChild(Object.assign(document.createElement("i"), { className: "mini-foe-pip" + (i < s.hits ? " hit" : "") }));
  }
  strip.appendChild(pips);
  strip.appendChild(Object.assign(document.createElement("span"), { className: "mini-foe-tally", textContent: s.defeated > 0 ? `已擊退 ${s.defeated} 隻` : "答對就打退小怪！" }));
  container.appendChild(strip);
}
function updateMiniFoe(isCorrect) {
  const s = miniFoeState();
  const strip = document.getElementById("mini-foe");
  if (!isCorrect) { strip?.classList.add("mini-foe-miss"); return; }
  s.hits += 1;
  const sprite = strip?.querySelector(".mini-foe-sprite");
  const pips = strip?.querySelectorAll(".mini-foe-pip");
  if (pips && pips[s.hits - 1]) pips[s.hits - 1].classList.add("hit");
  if (sprite) { sprite.classList.remove("mini-foe-shake"); void sprite.offsetWidth; sprite.classList.add("mini-foe-shake"); }
  if (s.hits >= MINI_FOE_HITS) {
    s.hits = 0; s.defeated += 1; s.idx += 1;
    if (sprite) {
      sprite.classList.add("mini-foe-defeated");
      const burst = document.createElement("span");
      burst.className = "mini-foe-burst"; burst.textContent = "💥";
      strip?.appendChild(burst);
    }
    if (isSfxOn()) sfx.correct(2);
  }
}

// 進下一題的唯一出口：每題只跑一次（手動按或疾行自動跳都走這裡）
let advancedThisQuestion = false;
function advanceQuestion() {
  if (advancedThisQuestion) return;
  advancedThisQuestion = true;
  session.index += 1;
  saveActiveSession();
  renderCurrentQuestion(true);
}

function renderCurrentQuestion(focusStem = false) {
  const quizArea = document.getElementById("quiz-area");
  preloadMascot(session.mascot);
  quizArea.innerHTML = "";
  if (session.kind !== "arena") removeArenaGhost();
  document.getElementById("quiz-node-name").textContent = session.node.name;
  if (session.kind === "boss") {
    const outcome = bossOutcome(session.boss);
    if (outcome === "defeat" && session.boss.freeRetryAvailable) {
      session.boss = { ...reviveWithBlessing(session.boss), freeRetryAvailable: false };
      announce("神諭卷軸的祝福發動，血量回復一半，再撐一下！");
    } else if (outcome) {
      renderBossOutcome(outcome, quizArea);
      return;
    }
    renderBossPanel(quizArea);
  } else {
    renderProgressBar();
  }
  renderMasteryProgress();
  renderStreakBadge();
  renderGhostLine();

  if (session.index >= session.queue.length) {
    if (session.kind === "boss") {
      // 只有真實答對累積的傷害能擊敗 Boss；題組用盡不以滿守護力送勝利，也不扣任何成果。
      renderBossOutcome("retreat", quizArea);
      return;
    }
    if (session.kind === "pvp") {
      const result = recordPvpRun(session.pvp.seed, session.pvp.strandId, {
        totalDmg: session.pvp.totalDmg,
        maxCombo: session.pvp.maxCombo,
      });
      renderPvpOutcome(result, quizArea);
      return;
    }
    if (session.kind === "arena") {
      finishArenaSession(quizArea);
      return;
    }
    finishSession();
    return;
  }

  const question = session.queue[session.index];
  session.qStartAt = Date.now();
  // 疾行計時只對正式題目施壓；導師安撫題是「喘口氣」不該倒數，否則安撫變成另一種壓力
  if (session.strategy === "sprint" && !question._mentorCoaching) startSprintTimer();
  else clearSprintTimer();
  const guardianStrand = strandIdForNode(question._nodeId ?? question._placementNodeId ?? session.node?.id);
  const opts = { encounter: session.index === session.encounterIdx, guardianStrand };
  if (session.kind === "node") renderMiniFoe(quizArea);
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
  advancedThisQuestion = false;
  nextBtn.addEventListener("click", advanceQuestion);
  quizArea.appendChild(nextBtn);
  nextBtnEl = nextBtn;

  // 中途離開出口：一般練習會保留進度，孩子不必怕切走就白做（U9）
  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.className = "quiz-leave-btn";
  const keepsProgress = session.kind === "node";
  leaveBtn.textContent = keepsProgress ? "先離開（進度會保留）" : "先離開";
  leaveBtn.addEventListener("click", () => {
    if (keepsProgress) saveActiveSession();
    showView("home");
  });
  quizArea.appendChild(leaveBtn);
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
    // 每段熱連擊（streak 每次爬到 5）重新武裝連詠護盾，讓「破 ≥5 連擊只掉 2」在每一段都穩定成立，
    // 而不是一場只軟著陸一次、之後全部硬歸零（原本 shield 觸發後永不重設造成軟／硬交替、無法預期）
    if (session.streak === 5) session.streakShielded = false;
    session.maxStreak = Math.max(session.maxStreak, session.streak);
    const best = Number(store.read("bestStreak", 0)) || 0;
    if (session.streak > best) store.write("bestStreak", session.streak);
    sfx.correct(session.streak);
    if (session.kind !== "boss") showComboPop(session.streak); // boss 已有飄傷害數字
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
      // 外顯隱藏機制：讓孩子知道是護盾救了連詠、只掉 2，而不是困惑「為什麼沒歸零」
      showToast("🛡 連詠護盾發動！這次只掉 2 連詠", "success");
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
    } else if (session.kind === "node" && !question._mentorCoaching && session.consecutiveWrong >= 3) {
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
  if (session.kind === "boss" && session.boss) {
    const strandNodeIds = (tree.strands.find((s) => s.id === session.boss.strandId)?.nodes ?? []).map((n) => n.id);
    // 總加成 = 收集品（上限 15%）+ 出戰星靈（上限 10%），合計自然封頂 25%
    // C3：裝備加成不再開局固定生效，要當場連詠≥3才解鎖——「打得好」才發揮潛力，
    // 勝負主要仍靠答對率，同時保留裝備價值（上限不變，只是改成戰場上賺）
    const gearBonus = collectionBonusFor(strandNodeIds, getCollection(), getRareStamps()) + spiritBonusFor();
    const bonus = session.streak >= 3 ? gearBonus : 0;
    session.boss = applyBossAnswer(session.boss, isCorrect, session.streak, bonus);
    updateBossFeedback(session.boss, isCorrect);
  }
  if (session.kind === "pvp" && session.pvp && isCorrect) {
    session.pvp.totalDmg += playerDamage(session.streak, 100, 100, 0);
    session.pvp.maxCombo = Math.max(session.pvp.maxCombo, session.streak);
  }
  if (session.kind === "arena" && session.arena) {
    if (isCorrect) {
      session.arena.correct += 1;
      session.arena.totalDmg += playerDamage(session.streak, 100, 100, 0);
      session.arena.maxCombo = Math.max(session.arena.maxCombo, session.streak);
    }
    updateArenaGhost(session.index + 1);
  }
  renderStreakBadge();
  renderMasteryProgress(nodeId);
  saveActiveSession(1);
  // 佇列在答錯後可能被加長（慢筆重描／導師安撫題），原本「看成果」的按鈕要改回「下一題」
  if (nextBtnEl) nextBtnEl.textContent = session.index === session.queue.length - 1 ? "看成果" : "下一題";
  nextBtnEl?.classList.remove("q-next-hidden");
  nextBtnEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  // F1 疾行模式：答對就自動跳下一題（停一下看眉批），答錯仍停留讓學生看懂；最後一題不自動跳，等按「看成果」
  // 導師安撫題不自動跳（配合上面不倒數）；捕捉當下題號，若玩家已手動前進則排程失效，避免跳過一題（C1 競態）
  if (session.strategy === "sprint" && isCorrect && session.kind === "node"
      && !question._mentorCoaching && session.index < session.queue.length - 1) {
    const scheduledIndex = session.index;
    scheduleTimer(() => { if (session.index === scheduledIndex) advanceQuestion(); }, SPRINT_AUTONEXT_MS);
  }
  // F2 小怪：一般練習每答對一題就打退一隻小怪，把「打到東西」的爽感前移到 Boss 戰之前
  if (session.kind === "node") updateMiniFoe(isCorrect);
  const messages = [isCorrect
    ? "答對了！"
    : `答錯了，正解是：選項${meta.correctLabel ?? ""}「${meta.correctText ?? ""}」`];
  if (session.streak >= 3) messages.push(`連詠 ${session.streak}`);
  if (meta.encounterReward?.type === "stamp") messages.push(`發現稀有印記：${meta.encounterReward.stamp.name}`);
  if (meta.encounterReward?.type === "stardust") messages.push(meta.encounterReward.message);
  messages.push("下一題按鈕已出現");
  announce(messages.join("。"));
  showStorageNoticeIfNeeded();
}

// 神諭啟示答對：普通／稀有／傳說三階各自機率與保底。
function handleEncounterWin() {
  const nodeId = session.queue[session.index]?._nodeId ?? session.node.id;
  const reward = resolveEncounterReward(nodeId, session.mascot);
  if (!reward) return null;

  // 奇遇是隨機掉落，刻意「收斂拉霸感」：不放全螢幕開獎動畫、不用 rare 大獎音效，
  // 只留低調的行內提示，把高光留給「靠實力賺到」的完全數融合（見 showPerfectFusionCelebration）。
  sfx.correct();
  const card = document.querySelector("#quiz-area .q-card");
  if (reward.type === "stamp") {
    session.rareDrops.push(reward.stamp);
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
  // 奇遇同時捕獲一顆較大的質數星靈——這是守護者以外唯一的質數來源
  const primePool = [13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  const prime = primePool[Math.floor(Math.random() * primePool.length)];
  const gotSpirit = captureSpirit(prime);
  if (card) {
    const spiritLine = document.createElement("div");
    spiritLine.className = "stardust-drop spirit-drop";
    spiritLine.textContent = gotSpirit?.isNew
      ? `✦ 神諭指引一顆質靈「${spiritName(prime)}」入你的星靈圖鑑`
      : `✦ 再收一顆「${spiritName(prime)}」`;
    card.appendChild(spiritLine);
  }
  return reward;
}

function finishSession() {
  session.concluded = true;
  clearSprintTimer();
  // 只清掉「這一場可續讀的練習」本身；weekly/master/challenge 不寫 activeSession，
  // 就別在收尾時順手把使用者另一場未完的一般練習續讀點也擦掉。
  if (RESUMABLE_KINDS.has(session.kind)) clearActiveSession();
  if (session.kind === "diagnostic") {
    finishPrerequisiteDiagnostic();
    return;
  }
  if (session.kind === "placement") {
    finishPlacementDiagnostic();
    return;
  }
  // 每日「完成一輪」要真的答對半數以上才算數——否則「全錯跑完一輪」也能滿足每日任務、
  // 觸發滴墨得星屑，等於用出席／操作次數換獎勵，違反「獎勵綁真實學習量」的教育鐵律。
  if (session.roundTotal > 0 && session.roundCorrect / session.roundTotal >= 0.5) {
    bumpDaily("rounds");
  }
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
  const summaryEl = makeSummary(stats, newBadges, newDrops, weeklyRecord, challengeReply, nextStep);
  quizArea.appendChild(summaryEl);
  // a11y：最常見的收尾路徑也要像兩個診斷收尾一樣播報成績＋把焦點移到結算卡（原本焦點會掉回 body）
  announce(`本輪完成，答對 ${session.roundCorrect}/${session.roundTotal} 題`);
  const summaryHeading = summaryEl.querySelector("h3") ?? summaryEl;
  summaryHeading.tabIndex = -1;
  summaryHeading.focus({ preventScroll: true });
  newDrops.forEach((drop) => showCardReveal(
    drop.item,
    drop.item.id === MASTER_TRIAL_ID ? "傳說" : drop.tier >= 2 ? "稀有" : "普通"
  ));
  // 節點蠟封（精熟）時掉一顆合成數星靈當融合素材，讓還沒打贏 boss 的學生也能開始融合
  if (newDrops.some((drop) => drop.tier >= 2)) {
    const starterPool = [4, 6, 8, 9, 10, 12];
    const composite = starterPool[Math.floor(Math.random() * starterPool.length)];
    const gotSpirit = captureSpirit(composite);
    if (gotSpirit?.isNew) showToast(`✦ 精熟獎勵：收服星靈「${spiritName(composite)}」，融合殿見`, "success");
  }

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

  const el = document.getElementById("dashboard-content");
  el.innerHTML = "";

  const bestStreak = Number(store.read("bestStreak", 0)) || 0;
  const trialBest = store.read("masterTrialBest", null);
  const summary = document.createElement("div");
  summary.className = "dash-summary";
  summary.innerHTML = `<h3>整體戰力值</h3><p>${overview.masteredCount} / ${overview.totalNodes} 個學習點已開通</p>
    <p class="dash-records">歷史最長連詠：${bestStreak}${trialBest ? ` ・ 賢者試煉最佳：${Math.round(trialBest.pct * 100)}%` : ""}</p>`;
  el.appendChild(summary);

  // 診斷跳關但尚未精熟的節點：誠實標示「基礎未精熟」，提醒回頭補練，不讓跳關假裝已學會
  const dashProgress = store.read("progress", {});
  const diagSkipped = allNodes(tree).filter((n) => dashProgress[n.id]?.diagnosticUnlocked === true && !isNodeMastered(n.id, tree, dashProgress));
  if (diagSkipped.length > 0) {
    const diagSection = document.createElement("div");
    diagSection.className = "dash-diag-skipped";
    diagSection.appendChild(Object.assign(document.createElement("h3"), { textContent: `診斷跳關的節點（${diagSkipped.length}）` }));
    diagSection.appendChild(Object.assign(document.createElement("p"), { className: "dash-diag-note", textContent: "這些是你靠先備診斷直接開通、還沒真正精熟的節點。標示「基礎未精熟」只是提醒——想更穩，回頭把它們練到精熟。" }));
    diagSkipped.slice(0, 12).forEach((n) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dash-diag-row";
      row.innerHTML = `<span class="dash-diag-name"></span><span class="dash-diag-tag">基礎未精熟</span>`;
      row.querySelector(".dash-diag-name").textContent = n.name;
      row.addEventListener("click", () => startQuiz(n));
      diagSection.appendChild(row);
    });
    el.appendChild(diagSection);
  }

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
  // 保底進度露出：資料本就存在 encounterPityByRarity，只是以前沒顯示，玩家不知道離保底還多遠
  const pityState = store.read("encounterPityByRarity", {});
  const pityHints = ["傳說", "稀有", "普通"]
    .filter((rarity) => RARE_STAMPS.some((s) => s.rarity === rarity && !stampBook[s.id]))
    .map((rarity) => {
      const remain = Math.max(0, (STAMP_RARITIES[rarity]?.pity ?? 0) - (pityState[rarity] ?? 0));
      return `${rarity}保底剩 ${remain} 次`;
    });
  if (pityHints.length) {
    stampSection.appendChild(Object.assign(document.createElement("p"), {
      className: "stamp-pity-hint",
      textContent: `🎯 ${pityHints.join("　·　")}（保底＝這麼多次「神諭啟示」內必得一枚）`,
    }));
  }
  const stampGrid = document.createElement("div");
  stampGrid.className = "stamp-grid";
  RARE_STAMPS.forEach((s) => {
    const owned = stampBook[s.id];
    const cell = document.createElement("div");
    cell.className = "stamp-cell" + (owned ? " stamp-owned" : " stamp-locked") + ` ${cardRevealClass(s.rarity)}`;
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
  const extraLabel = extras.length >= EXTRA_QUOTES.length
    ? `古賢者卷軸番外 ${EXTRA_QUOTES.length}/${EXTRA_QUOTES.length}・已全數收齊`
    : `古賢者卷軸番外 ${extras.length}/${EXTRA_QUOTES.length}（每 7 粒解鎖一則）`;
  inkSection.innerHTML = `<h3>星屑瓶（累計 ${inkTotal} 粒 · ${extraLabel}）</h3>`;
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
    const haptics = document.getElementById("setting-haptics");
    if (haptics) haptics.checked = areHapticsOn();
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
  document.getElementById("setting-haptics")?.addEventListener("change", (event) => {
    setHapticsOn(event.currentTarget.checked);
    if (event.currentTarget.checked) sfx.buzz(30); // 開啟時震一下當確認回饋
    sync();
  });
  const clearBtn = document.getElementById("clear-local-data");
  const clearNote = document.getElementById("clear-local-data-note");
  clearBtn?.addEventListener("click", () => {
    if (!window.confirm("這會清除這台裝置上所有《步學吾數》的學習進度、收集與設定，且無法復原。確定要清除嗎？")) return;
    const removed = clearNamespace();
    if (clearNote) clearNote.textContent = `已清除 ${removed} 筆本機資料，重新整理後就是全新的開始。`;
    announce("已清除這台裝置上的所有學習資料");
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

// 對戰局（Boss／PvP／競技場／大師盃／賢者試煉）半途按導覽切走＝放棄整局，先問一句避免手滑；
// 一般練習與複習是可續讀的（saveActiveSession），不必攔。
const BATTLE_KINDS = new Set(["boss", "pvp", "arena", "weekly", "master"]);
function inActiveBattle() {
  return views.quiz?.classList.contains("active")
    && BATTLE_KINDS.has(session?.kind)
    && !session?.concluded
    && (session?.index ?? 0) < (session?.queue?.length ?? 0);
}
function guardNav(handler) {
  return (event) => {
    if (inActiveBattle() && !window.confirm("這一局還沒打完，離開就會放棄這局，確定要離開嗎？")) return;
    handler(event);
  };
}
document.getElementById("nav-home").addEventListener("click", guardNav(goHome));
document.getElementById("nav-workshop").addEventListener("click", guardNav(showWorkshop));
document.getElementById("nav-fusion").addEventListener("click", guardNav(showFusion));
document.getElementById("nav-sanctuary").addEventListener("click", guardNav(showSanctuary));
document.getElementById("nav-arena").addEventListener("click", guardNav(showArena));
document.getElementById("nav-dashboard").addEventListener("click", guardNav(showDashboard));
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
