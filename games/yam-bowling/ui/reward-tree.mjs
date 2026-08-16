import { escapeHtml } from "./dom.mjs";

const STATE_LABELS = Object.freeze({ locked: "Locked", owned: "Owned", equipped: "Equipped" });

// One renderer for both ladders. It paints whatever node list it is handed and
// knows nothing about bowlers, levels or ownership rules -- the track that built
// the nodes already decided all of that. The class prefix is a parameter so each
// screen keeps its own styling without a second copy of this markup.
export function rewardTreeMarkup(nodes, { prefix = "reward", levelAttribute = "data-reward-level" } = {}) {
  if (!Array.isArray(nodes) || !nodes.length) {
    return `<li class="${prefix}-empty">Reward path unavailable.</li>`;
  }
  return nodes.map((node) => {
    const state = Object.hasOwn(STATE_LABELS, node?.state) ? node.state : "locked";
    return `<li class="${prefix}-node is-${state}" ${levelAttribute}="${escapeHtml(node.level)}">
      <b>${escapeHtml(String(node.level).padStart(2, "0"))}</b>
      <span><strong>${escapeHtml(node.label)}</strong><small>${STATE_LABELS[state]}</small></span>
    </li>`;
  }).join("");
}

export function masteryRewardTreeMarkup(nodes) {
  return rewardTreeMarkup(nodes, { prefix: "mastery-reward", levelAttribute: "data-mastery-level" });
}

export function playerRewardTreeMarkup(nodes) {
  return rewardTreeMarkup(nodes, { prefix: "player-reward", levelAttribute: "data-player-level" });
}
