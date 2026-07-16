import { store } from "./store.js";

export const BADGES = [
  { id: "first-mastery", name: "初試啼聲", desc: "第一個學習點達到精熟", check: (ctx) => ctx.masteredCount >= 1 },
  { id: "three-mastery", name: "小有心得", desc: "精熟 3 個學習點", check: (ctx) => ctx.masteredCount >= 3 },
  { id: "all-mastery", name: "融會貫通", desc: "精熟全部已上線學習點", check: (ctx) => ctx.masteredCount >= ctx.totalNodes },
  { id: "perfect-round", name: "全對挑戰", desc: "單次作答 5 題全對", check: (ctx) => ctx.lastRoundAllCorrect },
  { id: "streak-3", name: "連對三題", desc: "連續答對 3 題", check: (ctx) => ctx.currentStreak >= 3 },
  { id: "master-trial", name: "大師真傳", desc: "大師試煉正確率達九成", check: (ctx) => ctx.masterTrialPassed },
  { id: "encounter-5", name: "奇遇獵人", desc: "答對 5 次靈光一閃題", check: (ctx) => ctx.encounterWins >= 5 },
  { id: "workshop-friend", name: "工作室之友", desc: "讓目前已開放的大師工作室全數重光", check: (ctx) => ctx.workshopRestored },
  { id: "sparring", name: "切磋章", desc: "完成同學的挑戰包或收到回擊碼", check: (ctx) => ctx.sparring },
];

export function getUnlockedBadges() {
  return store.read("badges", []);
}

export function evaluateBadges(ctx) {
  const unlocked = new Set(getUnlockedBadges());
  const newlyUnlocked = [];
  for (const badge of BADGES) {
    if (!unlocked.has(badge.id) && badge.check(ctx)) {
      unlocked.add(badge.id);
      newlyUnlocked.push(badge);
    }
  }
  store.write("badges", [...unlocked]);
  return newlyUnlocked;
}

export function unlockBadge(id) {
  if (!BADGES.some((badge) => badge.id === id)) return false;
  const unlocked = new Set(getUnlockedBadges());
  if (unlocked.has(id)) return false;
  unlocked.add(id);
  store.write("badges", [...unlocked]);
  return true;
}
