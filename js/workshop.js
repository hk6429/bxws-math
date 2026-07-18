import { MANUSCRIPTS, RARE_STAMPS } from "./collection.js";

const ROOM_META = {
  "num-quantity": { icon: "⚖", title: "迷宮地底城", guardian: "米諾陶洛斯 Minotaur", voice: "米諾陶洛斯守護迷宮的尺度：先標單位，需要時統一單位，再依數量關係列式，最後用估算檢查答案大小。" },
  algebra: { icon: "✦", title: "斯芬克斯神殿", guardian: "斯芬克斯 Sphinx", voice: "斯芬克斯以謎語守護未知：先設未知數，依題意列等式，等號兩邊做相同運算，解出後代回原題驗算。" },
  "space-shape": { icon: "🔨", title: "獨眼巨人鍛造坊", guardian: "獨眼巨人 Cyclops", voice: "獨眼巨人鍛造精準的形體：先標出邊角與已知長度，對照定義，選對公式列式，最後檢查單位。" },
  "relation-pattern": { icon: "🧵", title: "命運三女神紡織殿", guardian: "命運三女神 Moirai", voice: "命運三女神織出規律：排前幾項，比較相鄰項的變化，寫出規則，再代回已知項驗證。" },
  "data-uncertainty": { icon: "🏺", title: "德爾菲神諭殿", guardian: "皮媞亞與巨蟒 Pythia", voice: "皮媞亞從眾多可能中辨認徵兆：先確認總數與資料分類；求機率時，用有利結果數除以所有可能結果數。" },
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const manuscriptNodeIds = new Set(MANUSCRIPTS.map((item) => item.id).filter((id) => id !== "master-trial"));
const stampNodeIds = new Set(RARE_STAMPS
  .map((stamp) => stamp.workshop && stamp.id.startsWith("stamp-") ? stamp.id.slice(6) : null)
  .filter(Boolean));

function roomStage(repairPct) {
  if (repairPct >= 100) return "restored";
  if (repairPct >= 34) return "mending";
  return "dusty";
}

export function workshopWeeklyGoal(overallPct) {
  const current = Math.max(0, Math.min(100, Math.round(Number(overallPct) || 0)));
  if (current >= 100) return "本週小目標：五座神殿已全數甦醒！";
  const remaining = 100 - current;
  if (remaining <= 5) return `本週小目標：一起完成最後 ${remaining}%！`;
  return `本週小目標：先把甦醒度推到 ${current + 5}%`;
}

export function computeWorkshop(tree, { progress = {}, collection = {}, rareStamps = {} } = {}) {
  const rooms = tree.strands.map((strand) => {
    const meta = ROOM_META[strand.id] ?? { icon: "🛠", title: strand.name };
    const nodeIds = strand.nodes.map((node) => node.id);
    if (nodeIds.length === 0) {
      return { ...meta, id: strand.id, name: strand.name, available: false, repairPct: 0, stage: "blueprint" };
    }

    const mastery = nodeIds.reduce((sum, id) => sum + clamp01(progress[id]?.masteryPct), 0) / nodeIds.length;
    const manuscriptIds = nodeIds.filter((id) => manuscriptNodeIds.has(id));
    const rareStampIds = nodeIds.filter((id) => stampNodeIds.has(id));
    const manuscript = manuscriptIds.length
      ? manuscriptIds.reduce((sum, id) => sum + clamp01((collection[id]?.tier ?? 0) / 2), 0) / manuscriptIds.length
      : 0;
    const stamps = rareStampIds.length
      ? rareStampIds.filter((id) => rareStamps[`stamp-${id}`]).length / rareStampIds.length
      : 0;
    // manuscript tier 2 本質是 masteryPct>=0.8 的粗粒度重述，故降權避免與 mastery 重複計分
    const hasCollectibleBonus = manuscriptIds.length > 0 || rareStampIds.length > 0;
    const repairPct = Math.round((hasCollectibleBonus
      ? mastery * 0.7 + manuscript * 0.15 + stamps * 0.15
      : mastery) * 100);
    return { ...meta, id: strand.id, name: strand.name, available: true, repairPct, stage: roomStage(repairPct) };
  });
  const activeRooms = rooms.filter((room) => room.available);
  const overallPct = activeRooms.length
    ? Math.round(activeRooms.reduce((sum, room) => sum + room.repairPct, 0) / activeRooms.length)
    : 0;
  return {
    rooms,
    overallPct,
    allRestored: activeRooms.length > 0 && activeRooms.every((room) => room.repairPct === 100),
  };
}

export const WORKSHOP_STAGES = {
  dusty: { label: "沉睡", message: "神諭卷軸還在沉睡，每次練習都會喚醒一角智慧之光。" },
  mending: { label: "甦醒中", message: "智慧之光已經透進來了，再補齊精通、蠟封與印記。" },
  restored: { label: "神殿甦醒", message: "這座神殿的智慧火炬已重新點亮。" },
  blueprint: { label: "封印未解", message: "後續學習領域上線後，這座神殿的封印會解開。" },
};
