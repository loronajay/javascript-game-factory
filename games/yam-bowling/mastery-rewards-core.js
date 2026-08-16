(function exposeMasteryRewards(root, factory) {
  "use strict";
  const rewardTree = typeof require === "function" ? require("./reward-tree-core.js") : root.YamRewardTree;
  const api = factory(rewardTree);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamMasteryRewards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMasteryRewards(rewardTree) {
  "use strict";

  // One reusable launch cadence for every bowler. Reward ids contain the bowler,
  // level and semantic key, so adding levels 31-40 later cannot rename anything
  // a player has already earned. Everything here is presentational: there is no
  // route for a reward to carry a physics, scoring or input value.
  const RAW_CADENCE = [
    [1, [["default-bowler", "bowler", "Canon Bowler", ["bowler", "skin", "canon"]]]],
    [2, [["red-neon-trail", "ball-trail", "Red Neon Ball Trail", ["global", "ballTrail", "red-neon"]]]],
    [3, [["profile-icon", "profile-icon", "{first} Profile Icon"]]],
    [4, [["ember-burst", "strike-burst", "Ember Strike Burst", ["global", "strikeBurst", "ember"]]]],
    [5, [["spotlight-victory", "victory-pose", "Spotlight Victory Pose"]]],
    [6, [["orange-flare-trail", "ball-trail", "Orange Flare Ball Trail", ["global", "ballTrail", "orange-flare"]]]],
    [7, [["character-banner", "character-banner", "{first} Character Banner"]]],
    [8, [["strike-spark", "strike-burst", "Crimson Strike Spark", ["global", "strikeBurst", "red-supernova"]]]],
    [9, [["rivalry-card", "player-card", "Rivalry Player Card"]]],
    [10, [["gym-day-skin", "skin", "Gym Day Skin"]]],
    [11, [["sky-blue-trail", "ball-trail", "Sky Blue Ball Trail", ["global", "ballTrail", "sky-blue"]]]],
    [12, [["player-card-art", "player-card", "{first} Player-Card Artwork"]]],
    [13, [["focus-badge", "badge", "Laser Focus Badge", ["global", "badge", "laser-focus"]]]],
    [14, [["entrance-stinger", "entrance", "Spotlight Entrance Stinger"]]],
    [15, [["alt-menu-splash", "menu-splash", "{first} Alt Menu Splash"]]],
    [16, [["gold-trail", "ball-trail", "Gold Rush Ball Trail", ["global", "ballTrail", "gold-rush"]]]],
    [17, [["signature-emote", "emote", "Signature Lane Emote"]]],
    [18, [["victory-pose-ii", "victory-pose", "Victory Pose II"]]],
    [19, [["pin-chaser-title", "title", "Pin Chaser Title", ["global", "title", "pin-chaser"]]]],
    [20, [["special-skin", "skin", "Special Event Skin"]]],
    [21, [["precision-badge", "badge", "Precision Bowler Badge", ["global", "badge", "precision-bowler"]]]],
    [22, [["crowd-burst", "strike-burst", "Crowd Roar Strike Burst", ["global", "strikeBurst", "sky-shatter"]]]],
    [23, [
      ["diamond-trail", "ball-trail", "Diamond White Ball Trail", ["global", "ballTrail", "diamond-white"]],
      ["diamond-burst", "strike-burst", "Diamond Spark Burst", ["global", "strikeBurst", "diamond-spark"]],
    ]],
    [24, [["elite-card-border", "player-card", "Elite Player-Card Border"]]],
    [25, [["rare-splash-card", "rare-card", "Rare Splash and Player Card"]]],
    [26, [["champion-entrance", "entrance", "Champion Entrance"]]],
    [27, [["perfect-line-trail", "ball-trail", "Perfect Line Ball Trail", ["global", "ballTrail", "perfect-line"]]]],
    [28, [["legend-badge", "badge", "Lane Legend Badge", ["global", "badge", "lane-legend"]]]],
    [29, [["mastery-nameplate", "title", "{first} Mastery Nameplate", ["global", "bowlerTitle", "nameplate"]]]],
    [30, [
      ["mastery-skin", "skin", "{first} Mastery Skin"],
      ["exclusive-title", "title", "{first} Master", ["global", "bowlerTitle", "master"]],
    ]],
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
    else if (slot === "profileArt") itemId = `profile-art:${slug}`;
    else if (slot === "playerCard") itemId = `player-card:${slug}`;
    else if (slot === "menuSplash") itemId = `menu-splash:${slug}`;
    else if (slot === "ballTrail") itemId = `ball-trail:${value}`;
    else if (slot === "strikeBurst") itemId = `strike-burst:${value}`;
    else if (slot === "badge") itemId = `badge:${value}`;
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
    REWARD_CADENCE: track.REWARD_CADENCE,
    buildRewardTree: track.buildRewardTree,
    earnedItemIds: track.earnedItemIds,
    rewardsBetween,
  };
});
