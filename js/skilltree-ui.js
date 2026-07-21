import { allNodes, nodeState, getNodeMastery, getProgress, isNodeMastered } from "./schema.js";
import { hasPrerequisiteDiagnostic } from "./prereq-diagnostic.js";

// ── 魔法星空圖版面常數 ──
const HALO_R = 22;          // 星軌（進度環）半徑
const HIT_R = 26;           // 透明熱區（維持觸控 44px+）
const CROWN_R = 32;         // 伴星冠冕弧半徑
const LINE_TRIM = 26;       // 星座線兩端內縮，避免穿過星體
const SPACING_X = 164;
const SPACING_Y = 156;
const PAD = 60;
const PAD_TOP = 150;
const MIN_MAP_WIDTH = 940;
const MAX_NODES_PER_ROW = 5;
const LABEL_CHARS_PER_LINE = 8;
const LABEL_LINE_HEIGHT = 16;
const MAX_BG_STARS = 80;    // 每個 strand SVG 背景星數上限
const REALM_BACKGROUNDS = {
  "num-quantity": "assets/mythos/realms/labyrinth-bg.png",
  algebra: "assets/mythos/realms/sphinx-temple-bg.png",
  "space-shape": "assets/mythos/realms/cyclops-forge-bg.png",
  "relation-pattern": "assets/mythos/realms/moirai-hall-bg.png",
  "data-uncertainty": "assets/mythos/realms/delphi-oracle-bg.png",
};
const GUARDIAN_IMAGES = {
  "num-quantity": "assets/mythos/guardians/minotaur.webp",
  algebra: "assets/mythos/guardians/sphinx.webp",
  "space-shape": "assets/mythos/guardians/cyclops.webp",
  "relation-pattern": "assets/mythos/guardians/moirai.webp",
  "data-uncertainty": "assets/mythos/guardians/pythia.webp",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

// transform 動畫紅線：SVG 元素要 fill-box + center，否則以整張 SVG 原點縮放
function centerTransformBox(node) {
  node.style.transformBox = "fill-box";
  node.style.transformOrigin = "center";
  return node;
}

// 四芒星 path（8 點交替外/內半徑，外點朝上下左右）
function starPath(outerR, innerR) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const rad = (Math.PI / 4) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(Math.cos(rad) * r).toFixed(2)},${(Math.sin(rad) * r).toFixed(2)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

// ── seeded PRNG：背景星空每次 render 長一樣，不會跳位 ──
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeDepths(nodes, allNodesById) {
  const depth = {};
  function getDepth(node) {
    if (depth[node.id] !== undefined) return depth[node.id];
    const prereqNodes = (node.prereq ?? []).map((pid) => allNodesById[pid]).filter(Boolean);
    if (prereqNodes.length === 0) {
      depth[node.id] = 0;
      return 0;
    }
    const d = Math.max(...prereqNodes.map(getDepth)) + 1;
    depth[node.id] = d;
    return d;
  }
  nodes.forEach(getDepth);
  return depth;
}

export function splitLabelLines(text, maxChars = LABEL_CHARS_PER_LINE) {
  const chars = [...text.trim()];
  if (chars.length <= maxChars) return [chars.join("")];

  const lineCount = Math.ceil(chars.length / maxChars);
  const balancedLength = Math.ceil(chars.length / lineCount);
  return Array.from({ length: lineCount }, (_, index) => (
    chars.slice(index * balancedLength, (index + 1) * balancedLength).join("")
  )).filter(Boolean);
}

export function layoutNodes(nodes, allNodesById, containerWidth = MIN_MAP_WIDTH) {
  const isNarrow = containerWidth < 600;
  const nodesPerRow = isNarrow ? MAX_NODES_PER_ROW - 2 : MAX_NODES_PER_ROW;
  const spacingX = isNarrow ? 120 : SPACING_X;
  const depth = computeDepths(nodes, allNodesById);
  const byDepth = {};
  nodes.forEach((n) => {
    const d = depth[n.id];
    (byDepth[d] = byDepth[d] ?? []).push(n);
  });
  const depthGroups = Object.entries(byDepth).sort(([a], [b]) => Number(a) - Number(b));
  const rows = depthGroups.flatMap(([, depthNodes]) => (
    Array.from({ length: Math.ceil(depthNodes.length / nodesPerRow) }, (_, rowIndex) => (
      depthNodes.slice(rowIndex * nodesPerRow, (rowIndex + 1) * nodesPerRow)
    ))
  ));
  const maxCount = Math.max(...rows.map((row) => row.length));
  const width = isNarrow ? Math.max(1, containerWidth) : Math.max(MIN_MAP_WIDTH, maxCount * spacingX + PAD * 2);
  const height = rows.length * SPACING_Y + PAD_TOP + PAD;

  const positions = {};
  rows.forEach((arr, rowIndex) => {
    arr.forEach((node, idx) => {
      const offset = (idx - (arr.length - 1) / 2) * spacingX;
      positions[node.id] = { x: width / 2 + offset, y: rowIndex * SPACING_Y + PAD_TOP };
    });
  });
  return { positions, width, height };
}

function starCount(masteryPct, threshold) {
  if (masteryPct >= 0.98) return 3;
  if (masteryPct >= 0.9) return 2;
  if (masteryPct >= threshold) return 1;
  return 0;
}

export function masteryThresholdForNode(node, tree) {
  return tree.masteryThresholds?.[node.tier] ?? tree.masteryThreshold ?? 0.8;
}

export function lockedNodeMessage(node, tree, progress, nodesById) {
  if (node.contentPending) return `「${node.name}」題庫尚未完成，現在還不能進入`;
  if (!node.prereq || node.prereq.length === 0) return "";
  const names = node.prereq
    .filter((id) => !isNodeMastered(id, tree, progress))
    .map((id) => `「${nodesById[id]?.name ?? id}」`);
  return names.length > 0 ? `先精通${names.join("、")}才能解鎖` : "";
}

let sketchDefsInjected = false;
function makeSketchDefs() {
  // 手繪抖動 filter：CSS 以 url(#sketch-mid)/url(#sketch-strong) 引用，全頁只需一份
  const defs = svgEl("defs");
  if (sketchDefsInjected) return defs;
  sketchDefsInjected = true;
  const specs = [
    { id: "sketch-mid", freq: "0.03", scale: "3", seed: "13" },
    { id: "sketch-strong", freq: "0.045", scale: "4.5", seed: "7" },
  ];
  specs.forEach(({ id, freq, scale, seed }) => {
    const filter = svgEl("filter", { id, x: "-20%", y: "-20%", width: "140%", height: "140%" });
    filter.appendChild(svgEl("feTurbulence", {
      type: "fractalNoise", baseFrequency: freq, numOctaves: "2", seed, result: "noise",
    }));
    filter.appendChild(svgEl("feDisplacementMap", {
      in: "SourceGraphic", in2: "noise", scale, xChannelSelector: "R", yChannelSelector: "G",
    }));
    defs.appendChild(filter);
  });
  return defs;
}

// 星圖 defs：每個 strand SVG 各注入一份，id 一律帶 strand 後綴（跨 SVG 引用會壞，紅線）
function makeStarDefs(strandId) {
  const defs = svgEl("defs");

  // 雙漸層：sigil-ember＝燭火微光（unlocked）、sigil-lit＝完全點亮的白金印記（mastered）
  [
    { id: `sigil-ember-${strandId}`, stops: [["0%", "#fff8e6"], ["40%", "#ffd98a"], ["100%", "#e8a13c"]] },
    { id: `sigil-lit-${strandId}`, stops: [["0%", "#ffffff"], ["35%", "#ffe9a8"], ["100%", "#f2c94c"]] },
  ].forEach(({ id, stops }) => {
    const grad = svgEl("radialGradient", { id });
    stops.forEach(([offset, color]) => {
      grad.appendChild(svgEl("stop", { offset, "stop-color": color }));
    });
    defs.appendChild(grad);
  });

  [
    { id: `star-glow-soft-${strandId}`, blur: "2.5" },
    { id: `star-glow-strong-${strandId}`, blur: "4.5" },
  ].forEach(({ id, blur }) => {
    const filter = svgEl("filter", { id, x: "-120%", y: "-120%", width: "340%", height: "340%" });
    filter.appendChild(svgEl("feGaussianBlur", { in: "SourceGraphic", stdDeviation: blur }));
    defs.appendChild(filter);
  });

  return defs;
}

// 背景星空：seeded PRNG、上限 80 顆、只 1/4 掛 twinkle、只動 opacity、絕不掛 SVG filter
function makeStarField(strand, width, height) {
  const field = svgEl("g", { class: "star-field" });
  const rand = mulberry32(hashStr(strand.id));
  const mobileCap = width < 600 ? 30 : MAX_BG_STARS;
  const count = Math.min(mobileCap, Math.round((width * height) / 3500));
  for (let i = 0; i < count; i++) {
    const star = svgEl("circle", {
      class: "bg-star",
      cx: (rand() * width).toFixed(1),
      cy: (rand() * height).toFixed(1),
      r: (0.5 + rand() * 1.1).toFixed(2),
      opacity: (0.2 + rand() * 0.5).toFixed(2),
    });
    if (i % 4 === 0) {
      star.classList.add("twinkle");
      star.style.animationDelay = `${(rand() * 4).toFixed(2)}s`;
    }
    // 魔法混色：每第 6 顆秘術紫、每第 9 顆魔力青（附加 class，總數與 twinkle 比例不變）
    if (i % 6 === 5) star.classList.add("bg-star-arcane");
    if (i % 9 === 8) star.classList.add("bg-star-mana");
    field.appendChild(star);
  }
  return field;
}

// 星座線：直線、兩端內縮；未通過＝星塵虛點，通過＝glow 底線＋亮芯雙層
function makeConstellationLines(from, to, isActive) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= LINE_TRIM * 2) return [];
  const ux = dx / dist;
  const uy = dy / dist;
  const x1 = from.x + ux * LINE_TRIM;
  const y1 = from.y + uy * LINE_TRIM;
  const x2 = to.x - ux * LINE_TRIM;
  const y2 = to.y - uy * LINE_TRIM;
  const lineLen = (dist - LINE_TRIM * 2).toFixed(1);

  const make = (cls) => {
    const line = svgEl("line", { x1, y1, x2, y2, class: cls, "stroke-linecap": "round" });
    line.style.setProperty("--line-length", lineLen);
    return line;
  };

  if (!isActive) {
    const dust = make("map-path constellation-dust");
    dust.setAttribute("stroke-dasharray", "1 7");
    return [dust];
  }
  return [
    make("map-path path-active constellation-glow"),
    make("map-path path-active constellation-core"),
  ];
}

// 伴星冠冕：弧排小四芒星取代 ★ 文字
function makeCrown(stars) {
  const crown = svgEl("g", { class: "node-crown" });
  const step = (26 * Math.PI) / 180;
  const start = -Math.PI / 2 - ((stars - 1) / 2) * step;
  for (let i = 0; i < stars; i++) {
    const rad = start + i * step;
    const cx = (Math.cos(rad) * CROWN_R).toFixed(2);
    const cy = (Math.sin(rad) * CROWN_R).toFixed(2);
    crown.appendChild(svgEl("path", {
      class: "crown-star",
      d: starPath(4.5, 1.8),
      transform: `translate(${cx}, ${cy})`,
    }));
  }
  return crown;
}

// 星星三態本體
function makeNodeStar(state, strandId, twinkleIndex) {
  const star = centerTransformBox(svgEl("g", { class: `node-star node-star-${state}` }));

  if (state === "locked") {
    // 沉睡符文石：沉暗星體＋秘術紫刻痕描邊＋休眠石環
    star.appendChild(svgEl("path", {
      class: "node-star-core",
      d: starPath(7, 2.8),
      fill: "#3d4663",
      stroke: "rgba(143,111,212,0.45)",
      "stroke-width": "1",
    }));
    star.appendChild(svgEl("circle", { class: "rune-stone-ring", r: 11 }));
    return star;
  }

  if (state === "unlocked") {
    // 燭火微光星符：sigil-ember 星核＋soft glow＋錯拍 twinkle
    const emberFill = `url(#sigil-ember-${strandId})`;
    star.appendChild(svgEl("path", {
      class: "node-star-glow",
      d: starPath(13, 5),
      fill: emberFill,
      filter: `url(#star-glow-soft-${strandId})`,
    }));
    star.appendChild(svgEl("path", {
      class: "node-star-core",
      d: starPath(12, 4.6),
      fill: emberFill,
    }));
    star.classList.add("twinkle");
    star.style.animationDelay = `${((twinkleIndex % 7) * 0.55).toFixed(2)}s`;
    return star;
  }

  // mastered：完全點亮的魔法印記：sigil-lit＋strong glow＋十字光芒（fill 交給 CSS）＋封印環
  const litFill = `url(#sigil-lit-${strandId})`;
  star.appendChild(svgEl("path", {
    class: "node-star-glow",
    d: starPath(16, 6),
    fill: litFill,
    filter: `url(#star-glow-strong-${strandId})`,
  }));
  star.appendChild(centerTransformBox(svgEl("path", {
    class: "star-rays ray-breathe",
    d: starPath(26, 1.6),
  })));
  star.appendChild(svgEl("path", {
    class: "node-star-core",
    d: starPath(14, 5.5),
    fill: litFill,
  }));
  star.appendChild(svgEl("circle", { class: "sigil-seal", r: 17 }));
  return star;
}

// ── 點亮儀式：render 間 diff 出「這次新精熟」的節點 ──
let lastMasteredIds = null;

export function renderSkillTree(container, tree, onSelectNode, onStartDiagnostic) {
  sketchDefsInjected = false;
  container.innerHTML = "";
  const progress = getProgress();
  const nodesById = Object.fromEntries(allNodes(tree).map((n) => [n.id, n]));
  let frontierAssigned = false;
  let twinkleIndex = 0;

  const masteredNow = new Set(
    allNodes(tree).filter((n) => nodeState(n, tree, progress) === "mastered").map((n) => n.id)
  );
  // 首次 render 不放儀式（進頁面不該爆一輪煙火）
  const justMastered = new Set(
    lastMasteredIds ? [...masteredNow].filter((id) => !lastMasteredIds.has(id)) : []
  );
  lastMasteredIds = masteredNow;

  tree.strands.forEach((strand) => {
    const strandBox = el("section", "strand");
    strandBox.dataset.strandId = strand.id;
    const visuals = tree.strandVisuals?.[strand.id] ?? {};
    if (visuals.colorVar) strandBox.style.setProperty("--strand-color", `var(${visuals.colorVar})`);

    const header = el("div", "strand-header");
    header.appendChild(el("h3", "strand-name", strand.name));
    strandBox.appendChild(header);

    if (strand.status === "coming-soon" || strand.nodes.length === 0) {
      strandBox.appendChild(renderComingSoonStrand(strand));
      container.appendChild(strandBox);
      return;
    }

    const mapWrap = el("div", "skill-map");
    const containerWidth = Math.floor(mapWrap.getBoundingClientRect().width || container.clientWidth || MIN_MAP_WIDTH);
    const { positions, width, height } = layoutNodes(strand.nodes, nodesById, containerWidth);

    const realmBackground = document.createElement("img");
    realmBackground.className = "realm-background";
    realmBackground.src = REALM_BACKGROUNDS[strand.id];
    realmBackground.alt = "";
    realmBackground.loading = "lazy";
    realmBackground.decoding = "async";
    realmBackground.onerror = () => { realmBackground.hidden = true; };
    mapWrap.appendChild(realmBackground);

    const svg = svgEl("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: "group",
      "aria-label": `${strand.name}技能星圖`,
    });
    svg.style.setProperty("--skill-map-width", `${width}px`);
    svg.appendChild(makeSketchDefs());
    svg.appendChild(makeStarDefs(strand.id));
    svg.appendChild(makeStarField(strand, width, height));

    strand.nodes.forEach((node) => {
      (node.prereq ?? []).forEach((prereqId) => {
        const from = positions[prereqId];
        const to = positions[node.id];
        if (!from || !to) return;
        const isActive = nodeState(nodesById[prereqId], tree, progress) === "mastered";
        makeConstellationLines(from, to, isActive).forEach((line) => {
          // 儀式：新精熟節點「連出去」的星座線描線點亮
          if (justMastered.has(prereqId)) line.classList.add("constellation-draw");
          svg.appendChild(line);
        });
      });
    });

    let frontierNode = null;
    strand.nodes.forEach((node) => {
      const state = nodeState(node, tree, progress);
      const visualState = state === "content-pending" ? "locked" : state;
      const pos = positions[node.id];
      const mastery = getNodeMastery(node.id, progress);
      const masteryThreshold = masteryThresholdForNode(node, tree);
      const stars = starCount(mastery, masteryThreshold);

      if (!frontierAssigned && state === "unlocked") {
        frontierNode = node;
        frontierAssigned = true;
      }

      const lockReason = lockedNodeMessage(node, tree, progress, nodesById);
      const diagnosticAction = state === "locked"
        && hasPrerequisiteDiagnostic(node)
        && typeof onStartDiagnostic === "function"
        ? () => onStartDiagnostic(node)
        : null;
      const progressPct = Math.round(Math.min(1, mastery / masteryThreshold) * 100);
      const stateLabel = state === "mastered" ? "已精熟" : state === "unlocked" ? "可挑戰" : "尚未解鎖";
      const g = svgEl("g", {
        class: `map-node state-${visualState}${frontierNode === node ? " is-frontier" : ""}`,
        "data-state": state,
        transform: `translate(${pos.x}, ${pos.y})`,
        role: "button",
        tabindex: "0",
        "aria-disabled": state === "locked" || state === "content-pending" ? "true" : "false",
        "aria-label": `${node.name}，${stateLabel}，進度 ${progressPct}%，${stars} 星${lockReason ? `，${lockReason}` : ""}`,
      });

      const title = svgEl("title");
      title.textContent = lockReason ? `${node.name}：${lockReason}` : node.name;
      g.appendChild(title);

      // 星軌（進度環）
      g.appendChild(svgEl("circle", { class: "node-ring-bg", r: HALO_R }));
      const circumference = 2 * Math.PI * HALO_R;
      const pct = state === "mastered" ? 1 : Math.min(1, mastery / masteryThreshold);
      g.appendChild(svgEl("circle", {
        class: "node-ring-progress",
        r: HALO_R,
        "stroke-linecap": "round",
        "stroke-dasharray": circumference,
        "stroke-dashoffset": circumference * (1 - pct),
      }));

      // 點亮儀式：光環漣漪（transform 動畫，先掛 fill-box/center）
      if (justMastered.has(node.id)) {
        const ripple = centerTransformBox(svgEl("circle", { class: "halo-ripple", r: HALO_R }));
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
        setTimeout(() => ripple.remove(), 1200);
        g.appendChild(ripple);
      }

      // 星星本體
      const star = makeNodeStar(visualState, strand.id, twinkleIndex++);
      if (justMastered.has(node.id)) star.classList.add("star-ignite");
      g.appendChild(star);

      // 伴星冠冕（locked 不顯示星等）
      if (visualState !== "locked" && stars > 0) g.appendChild(makeCrown(stars));

      const label = svgEl("text", { class: "node-label", y: HALO_R + 18, "paint-order": "stroke" });
      splitLabelLines(node.name).forEach((line, lineIndex) => {
        const tspan = svgEl("tspan", { x: 0, dy: lineIndex === 0 ? 0 : LABEL_LINE_HEIGHT });
        tspan.textContent = line;
        label.appendChild(tspan);
      });
      g.appendChild(label);

      // 透明熱區：維持觸控 44px
      g.appendChild(svgEl("circle", { class: "node-hit", r: HIT_R, fill: "transparent" }));

      g.addEventListener("click", () => {
        if (state === "unlocked" || state === "mastered") onSelectNode(node);
        else if (lockReason) showLockTapTip(mapWrap, pos, lockReason, diagnosticAction);
      });
      g.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (state === "unlocked" || state === "mastered") onSelectNode(node);
        else if (lockReason) showLockTapTip(mapWrap, pos, lockReason, diagnosticAction);
      });
      svg.appendChild(g);
    });

    mapWrap.appendChild(svg);

    if (frontierNode && GUARDIAN_IMAGES[strand.id]) {
      const pos = positions[frontierNode.id];
      const mascot = el("div", "map-mascot");
      const img = document.createElement("img");
      img.src = GUARDIAN_IMAGES[strand.id];
      img.alt = `${strand.name}守護者`;
      img.onerror = () => { mascot.style.display = "none"; };
      mascot.appendChild(img);
      mascot.style.left = `${pos.x}px`;
      mascot.style.top = `${pos.y}px`;
      mapWrap.appendChild(mascot);

      const tip = el("div", "node-suggested-tip", "✦ 從這枚星符開始");
      tip.style.left = `${pos.x}px`;
      tip.style.top = `${pos.y}px`;
      mapWrap.appendChild(tip);
    }

    strandBox.appendChild(mapWrap);
    container.appendChild(strandBox);
  });
}

// 觸控裝置點鎖住的星星沒有 hover title 可看，補一個會自動消失的提示泡泡
let activeLockTapTip = null;
function showLockTapTip(mapWrap, pos, reason, onStartDiagnostic) {
  activeLockTapTip?.remove();
  const tip = el("div", "node-suggested-tip lock-tap-tip");
  tip.setAttribute("role", "status");
  tip.setAttribute("aria-live", "polite");
  tip.appendChild(el("div", "lock-tap-message", `🔒 ${reason}`));
  tip.style.left = `${pos.x}px`;
  tip.style.top = `${pos.y}px`;
  if (pos.y < 150) tip.classList.add("lock-tap-tip-below");
  mapWrap.appendChild(tip);
  activeLockTapTip = tip;
  const dismiss = () => {
    if (activeLockTapTip === tip) activeLockTapTip = null;
    tip.remove();
    document.removeEventListener("click", dismiss);
  };
  if (onStartDiagnostic) {
    const button = el("button", "lock-diagnostic-btn", "參加先備診斷");
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      dismiss();
      onStartDiagnostic();
    });
    tip.appendChild(button);
  }
  setTimeout(dismiss, 6000);
  setTimeout(() => document.addEventListener("click", dismiss), 0);
}

function renderComingSoonStrand(strand) {
  const banner = el("div", "strand-soon-banner");
  banner.appendChild(el("div", "soon-title", "這幾張星象圖，導師還沒繪完…"));
  banner.appendChild(el("div", "", "敬請期待"));
  const tip = el("div", "soon-tip", "");
  banner.appendChild(tip);
  banner.addEventListener("click", () => {
    banner.style.animation = "none";
    void banner.offsetWidth;
    banner.style.animation = "shake-x 0.3s";
    tip.textContent = "星屑未凝，先去別的神諭卷軸練功吧！";
  });
  return banner;
}

export function computeOverview(tree) {
  const progress = getProgress();
  const nodes = allNodes(tree).filter((node) => !node.contentPending);
  const masteredCount = nodes.filter((n) => nodeState(n, tree, progress) === "mastered").length;
  return { totalNodes: nodes.length, masteredCount, nodes };
}
