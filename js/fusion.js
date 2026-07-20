import { store } from "./store.js";
import { getStardustCount } from "./daily.js";

// 星靈融合純邏輯層：每隻星靈就是一個 2～100 的整數，融合＝把兩隻星靈相乘。
// 設計核心是「玩法本身在教數學」——質數星靈無法由融合誕生（質數沒有 >1 的因數對），
// 只能靠奇遇捕獲；完全數、平方數則是隱藏彩蛋。所有規則都是數學事實，不是編出來的謎題。

export const SPIRIT_MIN = 2;
export const SPIRIT_MAX = 100;
export const EQUIP_MAX = 3;
export const WRONG_GUESS_COST = 1; // 猜錯乘積仍可融合，但溫和收 1 星屑

// 五神殿守護者各鎮守一個質數種子——質數是萬物的建材，boss 戰勝掉這顆種子。
export const GUARDIAN_SPIRIT = {
  "num-quantity": 2,
  algebra: 3,
  "space-shape": 5,
  "relation-pattern": 7,
  "data-uncertainty": 11,
};

// 七隻有專屬立繪的英雄星靈；其餘星靈以「數字徽章」程序化呈現，不需要美術。
export const HERO_SPIRITS = {
  2: { name: "偶素之靈", tagline: "唯一的偶數質數", art: "spirit-2" },
  3: { name: "三角之靈", tagline: "第一個奇質數", art: "spirit-3" },
  5: { name: "五芒之靈", tagline: "星形的質數", art: "spirit-5" },
  7: { name: "七弦之靈", tagline: "神諭之數", art: "spirit-7" },
  6: { name: "赫菲斯托斯・完美之靈", tagline: "1+2+3＝6，第一個完全數", art: "spirit-6" },
  28: { name: "塞勒涅・大完美之靈", tagline: "1+2+4+7+14＝28，第二個完全數", art: "spirit-28" },
  12: { name: "得墨忒耳・豐饒之靈", tagline: "有 6 個因數的豐饒之數", art: "spirit-12" },
};

export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let i = 2; i * i <= n; i += 1) {
    if (n % i === 0) return false;
  }
  return true;
}

export function divisors(n) {
  if (!Number.isInteger(n) || n < 1) return [];
  const out = [];
  for (let i = 1; i * i <= n; i += 1) {
    if (n % i === 0) {
      out.push(i);
      if (i !== n / i) out.push(n / i);
    }
  }
  return out.sort((a, b) => a - b);
}

export function divisorCount(n) {
  return divisors(n).length;
}

export function isPerfect(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  return divisors(n).slice(0, -1).reduce((a, b) => a + b, 0) === n;
}

export function isSquare(n) {
  if (!Number.isInteger(n) || n < 1) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

// 稀有度純由數字的數學性質決定：完全數＞質數／平方數＞一般合成數。
export function classify(n) {
  if (isPerfect(n)) return { kind: "perfect", rarity: "傳說" };
  if (isPrime(n)) return { kind: "prime", rarity: "稀有" };
  if (isSquare(n)) return { kind: "square", rarity: "稀有" };
  return { kind: "composite", rarity: "普通" };
}

export function spiritName(n) {
  if (HERO_SPIRITS[n]) return HERO_SPIRITS[n].name;
  const kind = classify(n).kind;
  if (kind === "prime") return `${n} 質靈`;
  if (kind === "square") return `${n} 方靈`;
  return `${n} 之靈`;
}

export function spiritArt(n) {
  return HERO_SPIRITS[n]?.art ?? null; // null＝用程序化數字徽章
}

// 融合合法性：兩隻星靈相乘，乘積必須 ≤ SPIRIT_MAX。父方永不消耗（設計不變式）。
// 兩個 ≥2 的整數相乘必為合成數，所以質數星靈永遠無法由融合產出——這正是要教的重點。
export function canFuse(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < SPIRIT_MIN || b < SPIRIT_MIN) {
    return { ok: false, product: null, reason: "星靈數字不合法" };
  }
  const product = a * b;
  if (product > SPIRIT_MAX) {
    return { ok: false, product, reason: `${a}×${b}＝${product}，超過 ${SPIRIT_MAX} 的星界上限` };
  }
  return { ok: true, product, reason: null };
}

export function fuse(a, b) {
  const check = canFuse(a, b);
  return check.ok ? check.product : null;
}

// ---- 星屑錢包：餘額＝總獲得（只從學習事件產出）− 總花費 ----
export function getStardustSpent() {
  return Math.max(0, Number(store.read("stardustSpent", 0)) || 0);
}

export function stardustBalance() {
  return Math.max(0, getStardustCount() - getStardustSpent());
}

export function spendStardust(amount) {
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  if (cost === 0) return true;
  if (stardustBalance() < cost) return false;
  store.write("stardustSpent", getStardustSpent() + cost);
  return true;
}

// ---- 星靈圖鑑（收藏）----
export function getSpiritBook() {
  return store.read("spiritBook", {});
}

export function ownsSpirit(n) {
  return Boolean(getSpiritBook()[String(n)]);
}

export function captureSpirit(n) {
  if (!Number.isInteger(n) || n < SPIRIT_MIN || n > SPIRIT_MAX) return null;
  const book = getSpiritBook();
  const key = String(n);
  const prev = book[key];
  book[key] = { count: (prev?.count ?? 0) + 1, firstAt: prev?.firstAt ?? Date.now(), lastAt: Date.now() };
  store.write("spiritBook", book);
  return { n, isNew: !prev, ...classify(n) };
}

// 猜乘積小測驗：猜對免費，猜錯照樣融合成功但溫和收 1 星屑（且錢包不足也放行，不擋學習）。
export function resolveFusion(a, b, guess) {
  const check = canFuse(a, b);
  if (!check.ok) return { ok: false, reason: check.reason };
  const product = check.product;
  const correct = Number(guess) === product;
  if (!correct && WRONG_GUESS_COST > 0) spendStardust(WRONG_GUESS_COST);
  const captured = captureSpirit(product);
  return {
    ok: true,
    product,
    correct,
    cost: correct ? 0 : WRONG_GUESS_COST,
    captured,
    recipe: `${a} × ${b} = ${product}`,
  };
}

// ---- 出戰裝備：boss 戰傷害加成 ----
export function getEquippedSpirits() {
  const raw = store.read("equippedSpirits", []);
  return (Array.isArray(raw) ? raw : []).filter((n) => Number.isInteger(n)).slice(0, EQUIP_MAX);
}

export function setEquippedSpirits(numbers) {
  const clean = [...new Set((numbers ?? []).map(Number).filter((n) => Number.isInteger(n) && ownsSpirit(n)))]
    .slice(0, EQUIP_MAX);
  store.write("equippedSpirits", clean);
  return clean;
}

// 每隻星靈加成＝因數個數 × 1%（單隻上限 6%），出戰總加成上限 10%。
// 這讓「多因數的合成數」比質數更值得出戰——玩家自然去理解因數多寡，且與收集品 15% 合計 cap 25%。
export function spiritBonusFor(equipped = getEquippedSpirits()) {
  const total = equipped.reduce((sum, n) => sum + Math.min(6, divisorCount(n)) * 0.01, 0);
  return Math.min(0.1, total);
}
