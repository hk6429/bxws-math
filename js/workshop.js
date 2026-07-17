const ROOM_META = {
  "num-quantity": { icon: "🧮", title: "達文西的比例工房", voice: "耐心畫草稿、反覆試作再修正" },
  algebra: { icon: "Σ", title: "高斯的代數書房", voice: "迅速看出規律，精準揪出錯誤" },
  "space-shape": { icon: "📐", title: "歐幾里得的幾何廳", voice: "從定義與已知條件一步步推演" },
  "relation-pattern": { icon: "🌿", title: "斐波那契的規律花園", voice: "觀察變化，讓規律逐步生長" },
  "data-uncertainty": { icon: "🎲", title: "帕斯卡的機率閣", voice: "列清可能與資料，再作判斷" },
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

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
    const manuscript = nodeIds.reduce((sum, id) => sum + clamp01((collection[id]?.tier ?? 0) / 2), 0) / nodeIds.length;
    const stamps = nodeIds.filter((id) => rareStamps[`stamp-${id}`]).length / nodeIds.length;
    // manuscript tier 2 本質是 masteryPct>=0.8 的粗粒度重述，故降權避免與 mastery 重複計分
    const repairPct = Math.round((mastery * 0.7 + manuscript * 0.15 + stamps * 0.15) * 100);
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
  dusty: { label: "蒙塵", message: "手稿還在沉睡，每次練習都會擦亮一角。" },
  mending: { label: "整理中", message: "光已經透進來了，再補齊精熟、落款與印章。" },
  restored: { label: "重光", message: "這個房間已重新開門。" },
  blueprint: { label: "藍圖待展開", message: "後續學習領域上線後，這個房間會開始修復。" },
};
