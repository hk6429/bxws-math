const ROOM_META = {
  "num-quantity": { icon: "⚖", title: "凡奇的秘數塔", voice: "「萬物皆可量，量過才算懂。」先別擦掉錯的那一筆，一稿一稿修到準" },
  algebra: { icon: "✦", title: "格思的符文塔", voice: "「給未知一個名字，它就不再可怕。」不必重算整題，直取第一個不合理處" },
  "space-shape": { icon: "🔮", title: "幾德的稜光塔", voice: "「線要站穩，光才走得直。」回到定義，一步步推演" },
  "relation-pattern": { icon: "🌿", title: "斐蘿的藤紋塔", voice: "「看懂前三步，就能預言下一步。」把前幾項排整齊，規律自己會發芽" },
  "data-uncertainty": { icon: "🎲", title: "帕嵐的星卜塔", voice: "「列清所有可能，再下判斷。」擲骰之前，先列表" },
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
  dusty: { label: "沉暗", message: "咒卷還在沉睡，每次練習都會點亮一角星光。" },
  mending: { label: "聚光中", message: "星光已經透進來了，再補齊精通、蠟封與徽記。" },
  restored: { label: "塔燈重燃", message: "這座塔的燈已重新點亮。" },
  blueprint: { label: "封印未解", message: "後續學習領域上線後，這座塔的封印會解開。" },
};
