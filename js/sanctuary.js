import { store } from "./store.js";
import { isNodeMastered } from "./schema.js";

// 繆思聖所：把「精熟節點數」實體化成神殿裝飾。解鎖門檻綁各領域的精熟比例
// （真實學習指標，不是操作次數），愈精熟一個領域，那座神殿的陳設愈完整。
// 擺放採點選基座制（非像素拖曳）：手機友善、可測試、不怕誤觸。

export const PEDESTAL_COUNT = 8;

// 五領域各 4 件裝飾，於該領域精熟比例達 25%/50%/75%/100% 時解鎖
const STRAND_DECOR = {
  "num-quantity": { theme: "迷宮地底城", glyph: "🏛", items: ["迷宮石柱", "牛角圖騰", "青銅量尺", "米諾陶洛斯雕像"] },
  algebra: { theme: "斯芬克斯神殿", glyph: "🦁", items: ["謎語石碑", "獅身翼像", "未知數面具", "斯芬克斯王座"] },
  "space-shape": { theme: "獨眼巨人鍛造坊", glyph: "🔨", items: ["鍛造鐵砧", "幾何模具", "獨眼火爐", "多面體水晶"] },
  "relation-pattern": { theme: "命運三女神紡織殿", glyph: "🧵", items: ["命運紡錘", "規律藤蔓", "函數織機", "命線掛毯"] },
  "data-uncertainty": { theme: "德爾菲神諭殿", glyph: "🏺", items: ["神諭銅鼎", "月桂冠", "機率骰盤", "皮媞亞聖座"] },
};

const TIER_RATIOS = [0.25, 0.5, 0.75, 1];

// 全域里程碑中心裝飾：精熟總節點數達門檻解鎖
const MILESTONE_DECOR = [
  { id: "center-athena-torch", name: "雅典娜智慧火炬", glyph: "🔥", milestone: 10 },
  { id: "center-olympus-gate", name: "奧林帕斯之門", glyph: "⛩", milestone: 25 },
  { id: "center-wisdom-tree", name: "智慧神木", glyph: "🌳", milestone: 50 },
];

export function buildDecorations() {
  const list = [];
  Object.entries(STRAND_DECOR).forEach(([strandId, def]) => {
    def.items.forEach((name, i) => {
      list.push({ id: `${strandId}-decor-${i}`, name, strand: strandId, theme: def.theme, glyph: def.glyph, tierRatio: TIER_RATIOS[i] });
    });
  });
  MILESTONE_DECOR.forEach((m) => list.push({ id: m.id, name: m.name, strand: "center", theme: "奧林帕斯中庭", glyph: m.glyph, milestone: m.milestone }));
  return list;
}

export const DECORATIONS = buildDecorations();

export function decorationById(id) {
  return DECORATIONS.find((d) => d.id === id) ?? null;
}

function masteredCountByStrand(tree, progress) {
  const counts = {};
  (tree?.strands ?? []).forEach((strand) => {
    const nodes = strand.nodes ?? [];
    const mastered = nodes.filter((n) => isNodeMastered(n.id, tree, progress)).length;
    counts[strand.id] = { mastered, total: nodes.length };
  });
  return counts;
}

export function totalMasteredCount(tree, progress) {
  return (tree?.strands ?? []).reduce(
    (sum, strand) => sum + (strand.nodes ?? []).filter((n) => isNodeMastered(n.id, tree, progress)).length, 0
  );
}

// 依目前精熟度算出已解鎖的裝飾 id 集合
export function unlockedDecorationIds(tree, progress = store.read("progress", {})) {
  const counts = masteredCountByStrand(tree, progress);
  const total = totalMasteredCount(tree, progress);
  const unlocked = new Set();
  DECORATIONS.forEach((d) => {
    if (d.strand === "center") {
      if (total >= d.milestone) unlocked.add(d.id);
    } else {
      const c = counts[d.strand];
      if (c && c.total > 0 && c.mastered / c.total >= d.tierRatio) unlocked.add(d.id);
    }
  });
  return unlocked;
}

// ---- 擺放：pedestalIndex → decorationId ----
export function getSanctuaryLayout() {
  const raw = store.read("sanctuaryLayout", {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

export function placeDecoration(pedestalIndex, decorationId, unlockedIds) {
  if (!Number.isInteger(pedestalIndex) || pedestalIndex < 0 || pedestalIndex >= PEDESTAL_COUNT) return getSanctuaryLayout();
  if (!decorationById(decorationId) || !unlockedIds.has(decorationId)) return getSanctuaryLayout();
  const layout = getSanctuaryLayout();
  layout[String(pedestalIndex)] = decorationId;
  store.write("sanctuaryLayout", layout);
  return layout;
}

export function clearPedestal(pedestalIndex) {
  const layout = getSanctuaryLayout();
  delete layout[String(pedestalIndex)];
  store.write("sanctuaryLayout", layout);
  return layout;
}

// ---- 門楣銘文：由成就／精熟里程碑解鎖的稱號 ----
export const TITLES = [
  { id: "title-novice", text: "初醒的學徒", need: 0 },
  { id: "title-seeker", text: "神諭的追尋者", need: 5 },
  { id: "title-adept", text: "五殿的通行者", need: 15 },
  { id: "title-sage", text: "奧林帕斯的智者", need: 30 },
  { id: "title-oracle", text: "與雅典娜同席者", need: 50 },
];

export function unlockedTitles(tree, progress = store.read("progress", {})) {
  const total = totalMasteredCount(tree, progress);
  return TITLES.filter((t) => total >= t.need);
}

export function getInscription() {
  return store.read("sanctuaryInscription", "title-novice");
}

export function setInscription(titleId, unlocked) {
  if (!unlocked.some((t) => t.id === titleId)) return getInscription();
  store.write("sanctuaryInscription", titleId);
  return titleId;
}

export function inscriptionText(titleId = getInscription()) {
  return TITLES.find((t) => t.id === titleId)?.text ?? TITLES[0].text;
}
