import { store } from "./store.js";

// 今日修稿單（P0 每日循環）＋星墨瓶溫和連續（只加不罰、斷了不清零）

export function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function getDaily() {
  return store.read(`daily:${todayKey()}`, { review: 0, rounds: 0, repair: 0, inked: false });
}

function saveDaily(daily) {
  store.write(`daily:${todayKey()}`, daily);
}

export function bumpDaily(field, amount = 1) {
  const daily = getDaily();
  daily[field] = (daily[field] ?? 0) + amount;
  saveDaily(daily);
  return daily;
}

// 三格任務：複習到期 6 題／前線推進 1 輪／錯題修復 2 題
// dueCount/errorCount 用來把「無事可做」的格子視為完成（不逼小孩生錯題）
export function dailyTasks(daily, { dueCount = 0, errorCount = 0 } = {}) {
  return [
    {
      id: "review",
      label: "注光：複習到期咒卷",
      target: 6,
      done: daily.review,
      satisfied: daily.review >= 6 || dueCount === 0, // 到期題清空也算完成
    },
    {
      id: "rounds",
      label: "推進：完成一輪練習",
      target: 1,
      done: daily.rounds,
      satisfied: daily.rounds >= 1,
    },
    {
      id: "repair",
      label: "淨化：收服錯題小魔物",
      target: 2,
      done: daily.repair,
      satisfied: daily.repair >= 2 || errorCount === 0,
    },
  ];
}

// 三格全滿 → 滴一滴墨（同日冪等）
export function maybeDropInk(tasks) {
  if (!tasks.every((t) => t.satisfied)) return false;
  const daily = getDaily();
  if (daily.inked) return false;
  daily.inked = true;
  saveDaily(daily);
  const days = store.read("inkDays", []);
  if (!days.includes(todayKey())) {
    days.push(todayKey());
    store.write("inkDays", days);
  }
  return true;
}

export function getInkDays() {
  return store.read("inkDays", []);
}

export function inkThisMonth() {
  const prefix = todayKey().slice(0, 7);
  return getInkDays().filter((d) => d.startsWith(prefix)).length;
}

export function addStardust(amount = 1) {
  const gained = Math.max(0, Math.floor(Number(amount) || 0));
  if (gained === 0) return getStardustCount();
  const bonus = Math.max(0, Number(store.read("stardustBonus", 0)) || 0) + gained;
  store.write("stardustBonus", bonus);
  return getInkDays().length + bonus;
}

export function getStardustCount() {
  return getInkDays().length + Math.max(0, Number(store.read("stardustBonus", 0)) || 0);
}

export function returningWelcome(lastPlayed, dueCount, now = Date.now()) {
  const daysAway = lastPlayed?.at
    ? Math.max(0, Math.floor((now - Number(lastPlayed.at)) / 86400000))
    : 0;
  const displayDueCount = daysAway >= 2 ? Math.min(Math.max(0, dueCount), 6) : Math.max(0, dueCount);
  return {
    daysAway,
    displayDueCount,
    headline: daysAway >= 2
      ? `導師把咒卷都收好了，今天先點亮 ${displayDueCount} 頁就好`
      : dueCount > 0
        ? `今日喚醒單——有 ${dueCount} 頁咒卷的星光等你點亮`
        : "今日喚醒單",
  };
}

export function claimStardustMilestones(total = getStardustCount()) {
  const saved = store.read("stardustMilestones", {});
  const newlyUnlocked = [];
  [30, 100].forEach((milestone) => {
    if (total >= milestone && saved[milestone] !== true) {
      saved[milestone] = true;
      newlyUnlocked.push(milestone);
    }
  });
  if (newlyUnlocked.length > 0) store.write("stardustMilestones", saved);
  return {
    newlyUnlocked,
    unlocked: [30, 100].filter((milestone) => saved[milestone] === true),
  };
}
