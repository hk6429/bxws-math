import { allNodes, nodeState, getNodeMastery } from "./schema.js";

const NODE_R = 28;
const SPACING_X = 130;
const SPACING_Y = 140;
const PAD = 60;

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

function layoutNodes(nodes, allNodesById) {
  const depth = computeDepths(nodes, allNodesById);
  const byDepth = {};
  nodes.forEach((n) => {
    const d = depth[n.id];
    (byDepth[d] = byDepth[d] ?? []).push(n);
  });
  const maxCount = Math.max(...Object.values(byDepth).map((arr) => arr.length));
  const width = Math.max(320, maxCount * SPACING_X + PAD * 2);
  const layerCount = Object.keys(byDepth).length;
  const height = layerCount * SPACING_Y + PAD * 2;

  const positions = {};
  Object.entries(byDepth).forEach(([d, arr]) => {
    arr.forEach((node, idx) => {
      const offset = (idx - (arr.length - 1) / 2) * SPACING_X;
      positions[node.id] = { x: width / 2 + offset, y: Number(d) * SPACING_Y + PAD };
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

function lockReasonText(node, tree, nodesById) {
  if (!node.prereq || node.prereq.length === 0) return "";
  const names = node.prereq.map((id) => nodesById[id]?.name ?? id);
  return `先精熟「${names.join("、")}」解鎖`;
}

export function renderSkillTree(container, tree, onSelectNode) {
  container.innerHTML = "";
  const nodesById = Object.fromEntries(allNodes(tree).map((n) => [n.id, n]));
  let frontierAssigned = false;

  tree.strands.forEach((strand) => {
    const strandBox = el("section", "strand");
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
    const { positions, width, height } = layoutNodes(strand.nodes, nodesById);

    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}` });

    strand.nodes.forEach((node) => {
      (node.prereq ?? []).forEach((prereqId) => {
        const from = positions[prereqId];
        const to = positions[node.id];
        if (!from || !to) return;
        const midY = (from.y + to.y) / 2;
        const d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
        const isActive = nodeState(nodesById[prereqId], tree) === "mastered";
        svg.appendChild(svgEl("path", { d, class: `map-path ${isActive ? "path-active" : ""}` }));
      });
    });

    let frontierNode = null;
    strand.nodes.forEach((node) => {
      const state = nodeState(node, tree);
      const pos = positions[node.id];
      const mastery = getNodeMastery(node.id);
      const stars = starCount(mastery, tree.masteryThreshold ?? 0.8);

      if (!frontierAssigned && state === "unlocked") {
        frontierNode = node;
        frontierAssigned = true;
      }

      const g = svgEl("g", {
        class: `map-node state-${state}${frontierNode === node ? " is-frontier" : ""}`,
        transform: `translate(${pos.x}, ${pos.y})`,
      });
      g.appendChild(svgEl("circle", { class: "node-ring-bg", r: NODE_R + 6 }));

      const circumference = 2 * Math.PI * (NODE_R + 6);
      const pct = state === "mastered" ? 1 : Math.min(1, mastery / (tree.masteryThreshold ?? 0.8));
      const ring = svgEl("circle", {
        class: "node-ring-progress",
        r: NODE_R + 6,
        "stroke-dasharray": circumference,
        "stroke-dashoffset": circumference * (1 - pct),
      });
      g.appendChild(ring);

      g.appendChild(svgEl("circle", { class: "node-body", r: NODE_R }));

      if (state === "locked") {
        const lock = svgEl("text", { class: "node-lock-icon", y: 5 });
        lock.textContent = "🔒";
        g.appendChild(lock);
      } else if (stars > 0) {
        const starText = svgEl("text", { class: "node-star", x: NODE_R - 6, y: -NODE_R + 4 });
        starText.textContent = "★".repeat(stars);
        g.appendChild(starText);
      }

      const label = svgEl("text", { class: "node-label", y: NODE_R + 20 });
      label.textContent = node.name;
      g.appendChild(label);

      g.addEventListener("click", () => {
        if (state !== "locked") onSelectNode(node);
      });
      svg.appendChild(g);
    });

    mapWrap.appendChild(svg);

    strand.nodes.forEach((node) => {
      const state = nodeState(node, tree);
      if (state === "locked") {
        const pos = positions[node.id];
        const reason = lockReasonText(node, tree, nodesById);
        if (reason) {
          const tip = el("div", "lock-reason", reason);
          tip.style.position = "absolute";
          tip.style.left = `${(pos.x / width) * 100}%`;
          tip.style.top = `${((pos.y + NODE_R + 34) / height) * 100}%`;
          tip.style.transform = "translate(-50%, 0)";
          mapWrap.appendChild(tip);
        }
      }
    });

    if (frontierNode && visuals.mascot) {
      const pos = positions[frontierNode.id];
      const mascot = el("div", "map-mascot");
      const img = document.createElement("img");
      img.src = `assets/mascot/${visuals.mascot}-idle.png`;
      img.alt = "數字精靈";
      img.onerror = () => { mascot.style.display = "none"; };
      mascot.appendChild(img);
      mascot.style.left = `${(pos.x / width) * 100}%`;
      mascot.style.top = `${(pos.y / height) * 100}%`;
      mapWrap.appendChild(mascot);

      const tip = el("div", "node-suggested-tip", "👉 從這裡開始");
      tip.style.left = `${(pos.x / width) * 100}%`;
      tip.style.top = `${(pos.y / height) * 100}%`;
      mapWrap.appendChild(tip);
    }

    strandBox.appendChild(mapWrap);
    container.appendChild(strandBox);
  });
}

function renderComingSoonStrand(strand) {
  const banner = el("div", "strand-soon-banner");
  banner.appendChild(el("div", "soon-title", "這片國度的精靈還在沉睡…"));
  banner.appendChild(el("div", "", "敬請期待"));
  const tip = el("div", "soon-tip", "");
  banner.appendChild(tip);
  banner.addEventListener("click", () => {
    banner.style.animation = "none";
    void banner.offsetWidth;
    banner.style.animation = "shake-x 0.3s";
    tip.textContent = "這裡還在建造中，先去挑戰其他關卡吧！";
  });
  return banner;
}

export function computeOverview(tree) {
  const nodes = allNodes(tree);
  const masteredCount = nodes.filter((n) => nodeState(n, tree) === "mastered").length;
  return { totalNodes: nodes.length, masteredCount, nodes };
}
