import { store } from "./store.js";

const towerRestored = (ctx, roomId) =>
  ctx.rooms?.some((room) => room.id === roomId && room.repairPct >= 100) ?? false;

export const BADGES = [
  { id: "first-mastery", name: "初試啼聲", desc: "第一個學習點達到精通", check: (ctx) => ctx.masteredCount >= 1 },
  { id: "three-mastery", name: "小有心得", desc: "精通 3 個學習點", check: (ctx) => ctx.masteredCount >= 3 },
  { id: "ten-mastery", name: "登堂入室", desc: "精通 10 個學習點", check: (ctx) => ctx.masteredCount >= 10 },
  { id: "fifteen-mastery", name: "星路行者", desc: "精通 15 個學習點", check: (ctx) => ctx.masteredCount >= 15 },
  { id: "twenty-mastery", name: "塔間旅人", desc: "精通 20 個學習點", check: (ctx) => ctx.masteredCount >= 20 },
  { id: "twenty-five-mastery", name: "咒卷學士", desc: "精通 25 個學習點", check: (ctx) => ctx.masteredCount >= 25 },
  { id: "thirty-mastery", name: "半程學者", desc: "精通 30 個學習點", check: (ctx) => ctx.masteredCount >= 30 },
  { id: "thirty-five-mastery", name: "五塔跡蹤者", desc: "精通 35 個學習點", check: (ctx) => ctx.masteredCount >= 35 },
  { id: "forty-mastery", name: "星圖巡禮者", desc: "精通 40 個學習點", check: (ctx) => ctx.masteredCount >= 40 },
  { id: "forty-five-mastery", name: "星圖探索者", desc: "精通 45 個學習點", check: (ctx) => ctx.masteredCount >= 45 },
  { id: "fifty-mastery", name: "五十卷學者", desc: "精通 50 個學習點", check: (ctx) => ctx.masteredCount >= 50 },
  { id: "fifty-five-mastery", name: "高塔遊學者", desc: "精通 55 個學習點", check: (ctx) => ctx.masteredCount >= 55 },
  { id: "sixty-mastery", name: "高塔研修者", desc: "精通 60 個學習點", check: (ctx) => ctx.masteredCount >= 60 },
  { id: "sixty-five-mastery", name: "高塔導讀者", desc: "精通 65 個學習點", check: (ctx) => ctx.masteredCount >= 65 },
  { id: "seventy-mastery", name: "星穹博學者", desc: "精通 70 個學習點", check: (ctx) => ctx.masteredCount >= 70 },
  { id: "seventy-five-mastery", name: "星穹藏書家", desc: "精通 75 個學習點", check: (ctx) => ctx.masteredCount >= 75 },
  { id: "eighty-mastery", name: "八十卷賢者", desc: "精通 80 個學習點", check: (ctx) => ctx.masteredCount >= 80 },
  { id: "all-mastery", name: "融會貫通", desc: "精通全部已上線學習點", check: (ctx) => ctx.masteredCount >= ctx.totalNodes },
  { id: "perfect-round", name: "全對挑戰", desc: "單次作答 5 題全對", check: (ctx) => ctx.lastRoundAllCorrect },
  { id: "streak-3", name: "連詠三題", desc: "連續答對 3 題", check: (ctx) => ctx.currentStreak >= 3 },
  { id: "streak-10", name: "十連不墜", desc: "連續答對 10 題", check: (ctx) => ctx.currentStreak >= 10 },
  { id: "master-trial", name: "賢者真傳", desc: "賢者試煉正確率達九成", check: (ctx) => ctx.masterTrialPassed },
  { id: "encounter-5", name: "奇遇獵人", desc: "答對 5 次奇遇魔法陣", check: (ctx) => ctx.encounterWins >= 5 },
  { id: "encounter-15", name: "奇遇宗師", desc: "答對 15 次奇遇魔法陣", check: (ctx) => ctx.encounterWins >= 15 },
  { id: "num-tower-restored", name: "秘數塔・重燃", desc: "讓凡奇的秘數塔塔燈重燃", check: (ctx) => towerRestored(ctx, "num-quantity") },
  { id: "algebra-tower-restored", name: "符文塔・重燃", desc: "讓格思的符文塔塔燈重燃", check: (ctx) => towerRestored(ctx, "algebra") },
  { id: "space-tower-restored", name: "稜光塔・重燃", desc: "讓幾德的稜光塔塔燈重燃", check: (ctx) => towerRestored(ctx, "space-shape") },
  { id: "relation-tower-restored", name: "藤紋塔・重燃", desc: "讓斐蘿的藤紋塔塔燈重燃", check: (ctx) => towerRestored(ctx, "relation-pattern") },
  { id: "data-tower-restored", name: "星卜塔・重燃", desc: "讓帕嵐的星卜塔塔燈重燃", check: (ctx) => towerRestored(ctx, "data-uncertainty") },
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
