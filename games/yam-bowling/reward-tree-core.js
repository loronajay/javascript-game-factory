(function exposeRewardTree(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamRewardTree = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRewardTreeCore() {
  "use strict";

  // The shape both reward tracks share. A track is a fixed ladder of levels,
  // each level carrying one or more named rewards, and the only questions a
  // caller ever asks are "what does this level give", "have I reached it", and
  // "am I wearing it". That is identical for bowler mastery and player level;
  // what differs is the id namespace, how a label is written, and how a reward
  // maps onto a loadout slot. Those three are the hooks below, so the state
  // machine itself exists once.
  //
  // Nothing here knows what a reward *is*. A track can hand out a cosmetic, a
  // currency, or a pure label, and this file cannot tell the difference -- which
  // is what keeps it from growing a second purpose.

  const STATES = Object.freeze({ locked: "locked", owned: "owned", equipped: "equipped" });

  function normalizeCadence(raw) {
    return Object.freeze(raw.map(([level, rewards]) => Object.freeze({
      level,
      rewards: Object.freeze(rewards.map(([key, family, label, equipment = null]) => Object.freeze({
        key,
        family,
        label,
        equipment: equipment ? Object.freeze([...equipment]) : null,
      }))),
    })));
  }

  function levelClamp(maxLevel) {
    return function safeLevel(value) {
      const parsed = Math.floor(Number(value));
      return Number.isFinite(parsed) ? Math.max(1, Math.min(maxLevel, parsed)) : 1;
    };
  }

  // Reward ids are built from immutable parts and never from a display string,
  // so retitling a reward cannot rename something a player already earned.
  function buildRewardId(namespace, scopeParts, level, key) {
    return [namespace, ...scopeParts, `level-${String(level).padStart(2, "0")}`, key].join(":");
  }

  function createRewardTrack({
    namespace,
    cadence,
    maxLevel = 30,
    resolveContext = () => ({}),
    resolveScopeParts = () => [],
    resolveLabel = (context, label) => label,
    resolveEquipment = () => null,
    resolveEquipped = () => false,
  } = {}) {
    const REWARD_CADENCE = normalizeCadence(cadence);
    const safeLevel = levelClamp(maxLevel);

    function resolvedRewards(context, node) {
      const scopeParts = resolveScopeParts(context);
      return node.rewards.map((reward) => Object.freeze({
        id: buildRewardId(namespace, scopeParts, node.level, reward.key),
        key: reward.key,
        family: reward.family,
        label: resolveLabel(context, reward.label),
        level: node.level,
        equipment: resolveEquipment(context, reward.equipment),
      }));
    }

    function buildRewardTree(options = {}) {
      const { currentLevel = 1, loadout = null, isEquipped = null } = options;
      const context = resolveContext(options);
      const level = safeLevel(currentLevel);
      const equippedResolver = typeof isEquipped === "function"
        ? isEquipped
        : (reward) => resolveEquipped(loadout, context, reward);

      const nodes = REWARD_CADENCE.map((node) => {
        const earned = node.level <= level;
        // A locked reward is never asked whether it is worn: ownership decides
        // what may be equipped, so querying an unearned one could only ever
        // produce a false positive.
        const rewards = resolvedRewards(context, node).map((reward) => Object.freeze({
          ...reward,
          owned: earned,
          equipped: earned && equippedResolver(reward),
        }));
        const equipped = rewards.some((reward) => reward.equipped);
        return Object.freeze({
          level: node.level,
          label: rewards.map((reward) => reward.label).join(" + "),
          rewards: Object.freeze(rewards),
          state: earned ? (equipped ? STATES.equipped : STATES.owned) : STATES.locked,
        });
      });

      return Object.freeze({
        currentLevel: level,
        nodes: Object.freeze(nodes),
        nextReward: nodes.find((node) => node.level > level) || null,
      });
    }

    // The half-open range `(fromLevel, toLevel]` -- what a level gain just paid
    // out, never what the player already had.
    function rewardsBetween(options = {}) {
      const { fromLevel = 1, toLevel = 1 } = options;
      const context = resolveContext(options);
      const from = safeLevel(fromLevel);
      const to = safeLevel(toLevel);
      if (to <= from) return [];
      return REWARD_CADENCE
        .filter((node) => node.level > from && node.level <= to)
        .flatMap((node) => resolvedRewards(context, node));
    }

    // Every equipment id the ladder has already paid out at this level. A
    // level-earned reward is provable from the level itself, so this is derived
    // on demand and never stored: an "owned" row saved beside the XP that proves
    // it is exactly the second source of truth that can disagree with the
    // account.
    function earnedItemIds(options = {}) {
      const { currentLevel = 1 } = options;
      const context = resolveContext(options);
      const level = safeLevel(currentLevel);
      return REWARD_CADENCE
        .filter((node) => node.level <= level)
        .flatMap((node) => resolvedRewards(context, node))
        .map((reward) => reward.equipment?.itemId)
        .filter(Boolean);
    }

    function listRewards() {
      return REWARD_CADENCE.flatMap((node) => node.rewards.map((reward) => ({ level: node.level, ...reward })));
    }

    return { REWARD_CADENCE, buildRewardTree, earnedItemIds, listRewards, rewardsBetween };
  }

  return { STATES, buildRewardId, createRewardTrack };
});
