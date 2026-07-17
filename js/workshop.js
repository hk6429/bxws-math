import { MANUSCRIPTS, RARE_STAMPS } from "./collection.js";

const ROOM_META = {
  "num-quantity": { icon: "⚖", title: "凡奇的秘數塔", voice: "「萬物皆可量。」先標單位，需要時統一單位，再依數量關係列式，最後用估算檢查答案大小。" },
  algebra: { icon: "✦", title: "格思的符文塔", voice: "「給未知一個名字。」先設未知數，依題意列等式，等號兩邊做相同運算，解出後代回原題驗算。" },
  "space-shape": { icon: "🔮", title: "幾德的稜光塔", voice: "「線要站穩，光才走得直。」先標出邊角與已知長度，對照定義，選對公式列式，最後檢查單位。" },
  "relation-pattern": { icon: "🌿", title: "斐蘿的藤紋塔", voice: "「看懂前三步，就能預言下一步。」排前幾項，比較相鄰項的變化，寫出規則，再代回已知項驗證。" },
  "data-uncertainty": { icon: "🎲", title: "帕嵐的星卜塔", voice: "「列清所有可能，再下判斷。」先確認總數與資料分類；求機率時，用有利結果數除以所有可能結果數。" },
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
  dusty: { label: "沉暗", message: "咒卷還在沉睡，每次練習都會點亮一角星光。" },
  mending: { label: "聚光中", message: "星光已經透進來了，再補齊精通、蠟封與徽記。" },
  restored: { label: "塔燈重燃", message: "這座塔的燈已重新點亮。" },
  blueprint: { label: "封印未解", message: "後續學習領域上線後，這座塔的封印會解開。" },
};
