import { allNodes, nodeState, getNodeMastery } from "./schema.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderSkillTree(container, tree, onSelectNode) {
  container.innerHTML = "";
  tree.strands.forEach((strand) => {
    const strandBox = el("section", "strand");
    strandBox.appendChild(el("h3", "strand-name", strand.name));

    if (strand.status === "coming-soon" || strand.nodes.length === 0) {
      strandBox.appendChild(el("p", "strand-soon", "即將推出"));
      container.appendChild(strandBox);
      return;
    }

    const nodeList = el("div", "node-list");
    strand.nodes.forEach((node) => {
      const state = nodeState(node, tree);
      const mastery = Math.round(getNodeMastery(node.id) * 100);
      const card = el("button", `node-card node-${state}`);
      card.appendChild(el("div", "node-name", node.name));
      card.appendChild(el("div", "node-tier", tree.tiers[node.tier]));
      if (state !== "locked") {
        card.appendChild(el("div", "node-mastery", `精熟度 ${mastery}%`));
      } else {
        card.appendChild(el("div", "node-mastery", "🔒 未解鎖"));
      }
      card.disabled = state === "locked";
      card.addEventListener("click", () => onSelectNode(node));
      nodeList.appendChild(card);
    });
    strandBox.appendChild(nodeList);
    container.appendChild(strandBox);
  });
}

export function computeOverview(tree) {
  const nodes = allNodes(tree);
  const masteredCount = nodes.filter((n) => nodeState(n, tree) === "mastered").length;
  return { totalNodes: nodes.length, masteredCount, nodes };
}
