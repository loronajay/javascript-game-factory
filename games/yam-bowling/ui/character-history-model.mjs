function safeCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function percent(current, total) {
  const denominator = safeCount(total);
  if (!denominator) return 0;
  return Math.min(100, Math.round((safeCount(current) / denominator) * 100));
}

function unavailableModel(character, status, masteryRewards, loadout) {
  const heading = `Your ${character.name}`;
  const messages = {
    "signed-out": `Sign in to see your history with ${character.name}.`,
    syncing: `Loading your ${character.name} history…`,
    unavailable: `${character.name} history is unavailable until progression sync succeeds.`,
  };
  const model = { status, heading, message: messages[status] || messages.unavailable };
  if (masteryRewards?.buildRewardTree) {
    const tree = masteryRewards.buildRewardTree({ character, currentLevel: 1, loadout });
    model.rewardTree = tree.nodes;
    model.nextReward = tree.nextReward;
  }
  return model;
}

// Joins two read-only authoritative views: the progression snapshot owns the
// play history, while the loadout owns collection completion. Fictional bowler
// biography data deliberately never enters this model.
export function buildCharacterHistoryModel({ character, status, progression, cosmetics, loadout, masteryRewards }) {
  if (status !== "ready") return unavailableModel(character, status, masteryRewards, loadout);

  const mastery = progression?.getBowler?.(character.slug) || {};
  const listedItems = cosmetics?.listForCharacter?.(character.slug);
  const items = Array.isArray(listedItems) ? listedItems : [];
  const itemIds = [...new Set(items.map((item) => item?.id).filter((id) => typeof id === "string" && id))];
  const owned = itemIds.filter((itemId) => Boolean(loadout?.owns?.(itemId))).length;
  const total = itemIds.length;
  const isMaxLevel = Boolean(mastery.isMaxLevel);
  const xpIntoLevel = safeCount(mastery.xpIntoLevel);
  const xpForNextLevel = safeCount(mastery.xpForNextLevel);
  const tree = masteryRewards?.buildRewardTree?.({
    character,
    currentLevel: Math.max(1, safeCount(mastery.level)),
    loadout,
  }) || { nodes: [], nextReward: null };

  return {
    status: "ready",
    heading: `Your ${character.name}`,
    level: Math.max(1, safeCount(mastery.level)),
    xpLabel: isMaxLevel ? "Maximum mastery" : `${xpIntoLevel} / ${xpForNextLevel} XP`,
    progressPercent: isMaxLevel ? 100 : percent(xpIntoLevel, xpForNextLevel),
    matches: safeCount(mastery.matches),
    wins: safeCount(mastery.wins),
    strikes: safeCount(mastery.strikes),
    highGame: safeCount(mastery.highGame),
    collection: {
      owned,
      total,
      percent: percent(owned, total),
      label: `${owned} / ${total} owned`,
    },
    rewardTree: tree.nodes,
    nextReward: tree.nextReward,
  };
}
