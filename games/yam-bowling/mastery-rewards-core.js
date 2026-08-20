(function exposeMasteryRewards(root, factory) {
  "use strict";
  const rewardTree = typeof require === "function" ? require("./reward-tree-core.js") : root.YamRewardTree;
  const api = factory(rewardTree);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamMasteryRewards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMasteryRewards(rewardTree) {
  "use strict";

  // Mastery answers one question: what did dedication to THIS bowler earn?
  // Account-wide effects, rooms, entrances and generic titles belong to the
  // player ladder. Putting them here made the second bowler's path a row of
  // already-owned rewards. This deliberately sparse cadence shows only real
  // character milestones; levels between them still advance mastery and point
  // toward the next actual unlock.

  // All displayed launch milestones are bound. Keep this exported list so
  // authoring and UI diagnostics retain a stable contract if future mastery
  // levels are drafted before their content types land.
  const PENDING_CONTENT = Object.freeze([]);

  const RAW_CADENCE = [
    [1, [["default-bowler", "bowler", "Canon Bowler", ["bowler", "skin", "canon"]]]],
    [3, [["profile-icon", "profile-icon", "{first} Profile Icon", ["character", "profileIcon", "canon"]]]],
    [5, [["spotlight-victory", "victory-pose", "Spotlight Victory Pose", ["character", "victoryPose", "spotlight"]]]],
    [9, [["rivalry-card", "player-card", "Rivalry Player Card", ["character", "playerCard", "rivalry"]]]],
    [12, [["player-card-art", "player-card", "{first} Player-Card Artwork", ["character", "playerCard", "signature"]]]],
    [18, [["victory-pose-ii", "victory-pose", "Victory Pose II", ["character", "victoryPose", "champion"]]]],
    [24, [["elite-card-border", "player-card", "Elite Player-Card Border", ["character", "playerCard", "elite"]]]],
    [29, [["mastery-nameplate", "title", "{first} Mastery Nameplate", ["global", "bowlerTitle", "nameplate"]]]],
    [30, [["exclusive-title", "title", "{first} Master", ["global", "bowlerTitle", "master"]]]],
  ];

  function displayName(characterSlug, characterName) {
    if (typeof characterName === "string" && characterName.trim()) return characterName.trim();
    return String(characterSlug || "Bowler").split("-").filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ") || "Bowler";
  }

  function resolveEquipment(context, equipment) {
    if (!equipment) return null;
    const [scope, slot, value] = equipment;
    const slug = context.slug;
    let itemId = null;
    if (slot === "skin") itemId = `skin:${slug}:${value}`;
    else if (slot === "victoryPose") itemId = `victory-pose:${slug}:${value}`;
    else if (slot === "profileIcon") itemId = `profile-icon:${slug}:${value}`;
    else if (slot === "profileArt") itemId = `profile-art:${slug}`;
    else if (slot === "playerCard") itemId = `player-card:${slug}${value ? `:${value}` : ""}`;
    else if (slot === "menuSplash") itemId = `menu-splash:${slug}`;
    else if (slot === "ballTrail") itemId = `ball-trail:${value}`;
    else if (slot === "strikeBurst") itemId = `strike-burst:${value}`;
    else if (slot === "badge") itemId = `badge:${value}`;
    else if (slot === "emote") itemId = `emote:${value}`;
    else if (slot === "entrance") itemId = `entrance:${value}`;
    else if (slot === "room") itemId = `room:${value}`;
    else if (slot === "title") itemId = `title:${value}`;
    // A mastery title is earned from one bowler but worn in the one global
    // title slot, so it is the only reward whose id is bowler-scoped while its
    // slot is not. Resolving it back to `title` here is what lets the equipped
    // check below stay a plain global-slot comparison.
    else if (slot === "bowlerTitle") return Object.freeze({ scope, slot: "title", itemId: `title:${slug}:${value}` });
    return Object.freeze({ scope, slot, itemId });
  }

  function defaultIsEquipped(loadout, context, reward) {
    const target = reward.equipment;
    const characterSlug = context.slug;
    if (!target?.itemId || !loadout) return false;
    if (target.scope === "global") return loadout.getGlobalSlot?.(target.slot) === target.itemId;
    if (target.slot === "skin") return `skin:${characterSlug}:${loadout.getEquippedSkinId?.(characterSlug)}` === target.itemId;
    return loadout.getBowlerSlot?.(characterSlug, target.slot) === target.itemId;
  }

  // Both entry points below have accepted their own caller shape since launch --
  // a `character` object here, loose `characterSlug`/`characterName` there -- so
  // the context resolver reads either rather than breaking a shipped signature.
  const track = rewardTree.createRewardTrack({
    namespace: "mastery",
    cadence: RAW_CADENCE,
    maxLevel: 30,
    resolveContext: (options) => {
      const slug = String(options.character?.slug || options.characterSlug || "");
      const name = displayName(slug, options.character?.name ?? options.characterName);
      return { slug, first: name.split(/\s+/)[0] };
    },
    resolveScopeParts: (context) => [context.slug],
    resolveLabel: (context, label) => label.replaceAll("{first}", context.first),
    resolveEquipment,
    resolveEquipped: defaultIsEquipped,
  });

  // A bowler-scoped reward id is meaningless without its bowler, so an unnamed
  // track yields nothing rather than minting `mastery::level-05:...`.
  function rewardsBetween(options = {}) {
    if (!options.characterSlug) return [];
    return track.rewardsBetween(options);
  }

  return {
    PENDING_CONTENT,
    REWARD_CADENCE: track.REWARD_CADENCE,
    buildRewardTree: track.buildRewardTree,
    earnedItemIds: track.earnedItemIds,
    rewardsBetween,
  };
});
