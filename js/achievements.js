import { store } from "./store.js";

export const BADGES = [
  { id: "first-mastery", name: "初試啼聲", desc: "第一個學習點達到精通", check: (ctx) => ctx.masteredCount >= 1 },
  { id: "three-mastery", name: "小有心得", desc: "精通 3 個學習點", check: (ctx) => ctx.masteredCount >= 3 },
  { id: "ten-mastery", name: "登堂入室", desc: "精通 10 個學習點", check: (ctx) => ctx.masteredCount >= 10 },
  { id: "fifteen-mastery", name: "星路行者", desc: "精通 15 個學習點", check: (ctx) => ctx.masteredCount >= 15 },
  { id: "twenty-mastery", name: "塔間旅人", desc: "精通 20 個學習點", check: (ctx) => ctx.masteredCount >= 20 },
  { id: "twenty-five-mastery", name: "咒卷學士", desc: "精通 25 個學習點", check: (ctx) => ctx.masteredCount >= 25 },
  { id: "thirty-mastery", name: "半程學者", desc: "精通 30 個學習點", check: (ctx) => ctx.masteredCount >= 30 },
  { id: "all-mastery", name: "融會貫通", desc: "精通全部已上線學習點", check: (ctx) => ctx.masteredCount >= ctx.totalNodes },
  { id: "perfect-round", name: "全對挑戰", desc: "單次作答 5 題全對", check: (ctx) => ctx.lastRoundAllCorrect },
  { id: "streak-3", name: "連詠三題", desc: "連續答對 3 題", check: (ctx) => ctx.currentStreak >= 3 },
  { id: "streak-10", name: "十連不墜", desc: "連續答對 10 題", check: (ctx) => ctx.currentStreak >= 10 },
  { id: "master-trial", name: "賢者真傳", desc: "賢者試煉正確率達九成", check: (ctx) => ctx.masterTrialPassed },
  { id: "encounter-5", name: "奇遇獵人", desc: "答對 5 次奇遇魔法陣", check: (ctx) => ctx.encounterWins >= 5 },
  { id: "encounter-15", name: "奇遇宗師", desc: "答對 15 次奇遇魔法陣", check: (ctx) => ctx.encounterWins >= 15 },
  { id: "workshop-friend", name: "星穹之光", desc: "讓學院五塔全數塔燈重燃", check: (ctx) => ctx.workshopRestored },
  { id: "sparring", name: "切磋章", desc: "完成同學的挑戰包或收到回擊咒文", check: (ctx) => ctx.sparring },
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
