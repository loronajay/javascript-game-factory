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
  // Several node KEYS below no longer describe what they pay -- `gym-day-skin`
  // pays a trail, `character-banner` pays a room. That is deliberate: a reward
  // id is permanent, and renaming one would re-fire its level-up celebration
  // for every player who has already seen it. The label is what the player
  // reads; the key is only an identity.

  // The rungs still awaiting a reward type this cabinet does not have yet.
  // Declared rather than left silently unbound, exactly as the player ladder
  // declares its own, so a rung that pays nothing is a visible decision instead
  // of something to discover later.
  //
  // All eight need a new equippable type rather than new art: profile icons crop
  // the portrait already on disk, card frames are drawn over the card that
  // already ships, entrances are CSS, and the two victory poses can bind to the
  // outcome art the alternate skins already carry. None of them is blocked on a
  // per-bowler asset, which is what the banner, splash and skin rungs were.
  const PENDING_CONTENT = Object.freeze([
    Object.freeze({ level: 3, family: "profile-icon", key: "profile-icon" }),
    Object.freeze({ level: 5, family: "victory-pose", key: "spotlight-victory" }),
    Object.freeze({ level: 9, family: "player-card", key: "rivalry-card" }),
    Object.freeze({ level: 12, family: "player-card", key: "player-card-art" }),
    Object.freeze({ level: 14, family: "entrance", key: "entrance-stinger" }),
    Object.freeze({ level: 18, family: "victory-pose", key: "victory-pose-ii" }),
    Object.freeze({ level: 24, family: "player-card", key: "elite-card-border" }),
    Object.freeze({ level: 26, family: "entrance", key: "champion-entrance" }),
  ]);

  const RAW_CADENCE = [
    [1, [["default-bowler", "bowler", "Canon Bowler", ["bowler", "skin", "canon"]]]],
    [2, [["red-neon-trail", "ball-trail", "Red Neon Ball Trail", ["global", "ballTrail", "red-neon"]]]],
    [3, [["profile-icon", "profile-icon", "{first} Profile Icon"]]],
    [4, [["ember-burst", "strike-burst", "Ember Strike Burst", ["global", "strikeBurst", "ember"]]]],
    [5, [["spotlight-victory", "victory-pose", "Spotlight Victory Pose"]]],
    [6, [["orange-flare-trail", "ball-trail", "Orange Flare Ball Trail", ["global", "ballTrail", "orange-flare"]]]],
    [7, [["character-banner", "room", "Fireside Lodge", ["global", "room", "fireside-lodge"]]]],
    [8, [["strike-spark", "strike-burst", "Crimson Strike Spark", ["global", "strikeBurst", "red-supernova"]]]],
    [9, [["rivalry-card", "player-card", "Rivalry Player Card"]]],
    [10, [["gym-day-skin", "ball-trail", "Rose Gold Ball Trail", ["global", "ballTrail", "rose-gold"]]]],
    [11, [["sky-blue-trail", "ball-trail", "Sky Blue Ball Trail", ["global", "ballTrail", "sky-blue"]]]],
    [12, [["player-card-art", "player-card", "{first} Player-Card Artwork"]]],
    [13, [["focus-badge", "title", "Pocket Hunter Title", ["global", "title", "pocket-hunter"]]]],
    [14, [["entrance-stinger", "entrance", "Spotlight Entrance Stinger"]]],
    [15, [["alt-menu-splash", "room", "Desert Vista", ["global", "room", "desert-vista"]]]],
    [16, [["gold-trail", "ball-trail", "Gold Rush Ball Trail", ["global", "ballTrail", "gold-rush"]]]],
    [17, [["signature-emote", "emote", "Game Face Emote", ["global", "emote", "game-face"]]]],
    [18, [["victory-pose-ii", "victory-pose", "Victory Pose II"]]],
    [19, [["pin-chaser-title", "title", "Pin Chaser Title", ["global", "title", "pin-chaser"]]]],
    [20, [["special-skin", "strike-burst", "Rose Gold Burst", ["global", "strikeBurst", "rose-gold"]]]],
    [21, [["precision-badge", "title", "Lane Reader Title", ["global", "title", "lane-reader"]]]],
    [22, [["crowd-burst", "strike-burst", "Crowd Roar Strike Burst", ["global", "strikeBurst", "sky-shatter"]]]],
    [23, [
      ["diamond-trail", "ball-trail", "Diamond White Ball Trail", ["global", "ballTrail", "diamond-white"]],
      ["diamond-burst", "strike-burst", "Diamond Spark Burst", ["global", "strikeBurst", "diamond-spark"]],
    ]],
    [24, [["elite-card-border", "player-card", "Elite Player-Card Border"]]],
    [25, [["rare-splash-card", "room", "Deep Sea Suite", ["global", "room", "deep-sea-suite"]]]],
    [26, [["champion-entrance", "entrance", "Champion Entrance"]]],
    [27, [["perfect-line-trail", "ball-trail", "Perfect Line Ball Trail", ["global", "ballTrail", "perfect-line"]]]],
    [28, [["legend-badge", "title", "Shotmaker Title", ["global", "title", "shotmaker"]]]],
    [29, [["mastery-nameplate", "title", "{first} Mastery Nameplate", ["global", "bowlerTitle", "nameplate"]]]],
    [30, [
      ["mastery-skin", "ball-trail", "Eclipse Ball Trail", ["global", "ballTrail", "eclipse"]],
      ["mastery-burst", "strike-burst", "Eclipse Corona Burst", ["global", "strikeBurst", "eclipse-corona"]],
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
    else if (slot === "emote") itemId = `emote:${value}`;
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
