(function exposePlayerRewards(root, factory) {
  "use strict";
  const rewardTree = typeof require === "function" ? require("./reward-tree-core.js") : root.YamRewardTree;
  const api = factory(rewardTree);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamPlayerRewards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayerRewards(rewardTree) {
  "use strict";

  // The player track rewards the PLAYER; bowler mastery rewards the BOWLER. That
  // split is the whole reason two trees do not feel like one tree shown twice,
  // so every reward here is global and none of them is a bowler's art. The two
  // trees also never promise the same trail or burst -- a reward you could have
  // earned on the other ladder is not a reward -- and a test asserts it rather
  // than trusting this comment.
  //
  // Ownership is NOT stored anywhere. A node is owned when its level is at or
  // below the authoritative player level, which `progression-core.js` derives
  // from server-synced XP. There is deliberately no local unlock record here to
  // fall out of step with the account.
  //
  // Reward ids are `player:level-<nn>:<key>` and must never be rewritten:
  // appending levels 31-40 has to leave every launch id alone.

  // Levels that pay a Skin Voucher. Deliberately only two: a voucher is the
  // scarce reward of this track, and the rest of its supply is meant to come
  // from tournaments and the circuit rather than from levelling alone. The first
  // lands early enough to teach the mechanic while there is still tree left.
  const SKIN_VOUCHER_LEVELS = Object.freeze([10, 25]);

  // Emote Vouchers are the commoner currency: four of them against two skin
  // vouchers, because the emote pool is thirty deep where the skin pool is two
  // per bowler. They sit on the rungs that badges used to occupy.
  const EMOTE_VOUCHER_LEVELS = Object.freeze([7, 16, 22, 30]);

  const voucher = ["skin-voucher", "skin-voucher", "Skin Voucher"];
  // The emote pool is thirty deep and this ladder has four rungs to spend, so
  // naming one emote per rung would leave most of the pool unreachable. A
  // voucher spends on any emote the player does not already own.
  const emoteVoucher = ["emote-voucher", "emote-voucher", "Emote Voucher"];

  // Titles the tree wants but the catalog does not carry crest art for yet.
  // They are declared here as label-only nodes so the ladder is complete and
  // playable, and binding one later is a single `equipment` edit that cannot
  // disturb any id a player has already earned.
  //
  // Badges are deliberately absent: they certify achievements, not passive
  // progress through a level ladder. The four rungs that once promised them now
  // pay Emote Vouchers, which are spendable today, so those rungs left this
  // pending list entirely rather than waiting on art.
  const PENDING_CONTENT = Object.freeze([
    Object.freeze({ level: 4, family: "title", key: "title-i" }),
    Object.freeze({ level: 13, family: "title", key: "title-ii" }),
    Object.freeze({ level: 19, family: "title", key: "title-iii" }),
    Object.freeze({ level: 30, family: "title", key: "title-master" }),
  ]);

  const RAW_CADENCE = [
    [1, [["starter-title", "title", "Rookie Title", ["global", "title", "rookie"]]]],
    [2, [["lime-shock-trail", "ball-trail", "Lime Shock Ball Trail", ["global", "ballTrail", "lime-shock"]]]],
    [3, [["gold-star-burst", "strike-burst", "Gold Star Burst", ["global", "strikeBurst", "gold-star"]]]],
    [4, [["title-i", "title", "Lane Regular Title"]]],
    [5, [["emerald-glow-trail", "ball-trail", "Emerald Glow Ball Trail", ["global", "ballTrail", "emerald-glow"]]]],
    [6, [["emerald-impact-burst", "strike-burst", "Emerald Impact Burst", ["global", "strikeBurst", "emerald-impact"]]]],
    [7, [emoteVoucher]],
    [8, [["mint-frost-trail", "ball-trail", "Mint Frost Ball Trail", ["global", "ballTrail", "mint-frost"]]]],
    [9, [["mint-crackle-burst", "strike-burst", "Mint Crackle Burst", ["global", "strikeBurst", "mint-crackle"]]]],
    [10, [voucher]],
    [11, [["cyan-pulse-trail", "ball-trail", "Cyan Pulse Ball Trail", ["global", "ballTrail", "cyan-pulse"]]]],
    [12, [["cyan-flash-burst", "strike-burst", "Cyan Flash Burst", ["global", "strikeBurst", "cyan-flash"]]]],
    [13, [["title-ii", "title", "House Favourite Title"]]],
    [14, [["electric-blue-trail", "ball-trail", "Electric Blue Ball Trail", ["global", "ballTrail", "electric-blue"]]]],
    [15, [["electric-blue-burst", "strike-burst", "Electric Blue Burst", ["global", "strikeBurst", "electric-blue"]]]],
    [16, [emoteVoucher]],
    [17, [["indigo-drive-trail", "ball-trail", "Indigo Drive Ball Trail", ["global", "ballTrail", "indigo-drive"]]]],
    [18, [["indigo-ring-burst", "strike-burst", "Indigo Ring Burst", ["global", "strikeBurst", "indigo-ring"]]]],
    [19, [["title-iii", "title", "Lane Veteran Title"]]],
    [20, [["violet-haze-trail", "ball-trail", "Violet Haze Ball Trail", ["global", "ballTrail", "violet-haze"]]]],
    [21, [["violet-bloom-burst", "strike-burst", "Violet Bloom Burst", ["global", "strikeBurst", "violet-bloom"]]]],
    [22, [emoteVoucher]],
    [23, [["purple-plasma-trail", "ball-trail", "Purple Plasma Ball Trail", ["global", "ballTrail", "purple-plasma"]]]],
    [24, [["purple-nova-burst", "strike-burst", "Purple Nova Burst", ["global", "strikeBurst", "purple-nova"]]]],
    [25, [voucher]],
    [26, [["magenta-pop-trail", "ball-trail", "Magenta Pop Ball Trail", ["global", "ballTrail", "magenta-pop"]]]],
    [27, [["magenta-blast-burst", "strike-burst", "Magenta Blast Burst", ["global", "strikeBurst", "magenta-blast"]]]],
    [28, [["hot-pink-trail", "ball-trail", "Hot Pink Ball Trail", ["global", "ballTrail", "hot-pink"]]]],
    [29, [["hot-pink-pop-burst", "strike-burst", "Hot Pink Pop Burst", ["global", "strikeBurst", "hot-pink-pop"]]]],
    [30, [
      ["title-master", "title", "Yam Legend Title"],
      emoteVoucher,
      // The summit lands three rewards at once: a title, an emote voucher,
      // and this.
      ["lime-pop-burst", "strike-burst", "Lime Pop Burst", ["global", "strikeBurst", "lime-pop"]],
    ]],
  ];

  function resolveEquipment(context, equipment) {
    if (!equipment) return null;
    const [scope, slot, value] = equipment;
    let itemId = null;
    if (slot === "ballTrail") itemId = `ball-trail:${value}`;
    else if (slot === "strikeBurst") itemId = `strike-burst:${value}`;
    else if (slot === "badge") itemId = `badge:${value}`;
    else if (slot === "emote") itemId = `emote:${value}`;
    else if (slot === "title") itemId = `title:${value}`;
    return Object.freeze({ scope, slot, itemId });
  }

  // Every slot this track can fill is global, so there is exactly one question
  // to ask the loadout and no bowler to ask it about.
  function defaultIsEquipped(loadout, _context, reward) {
    const target = reward.equipment;
    if (!target?.itemId || !loadout) return false;
    return loadout.getGlobalSlot?.(target.slot) === target.itemId;
  }

  const track = rewardTree.createRewardTrack({
    namespace: "player",
    cadence: RAW_CADENCE,
    maxLevel: 30,
    resolveScopeParts: () => [],
    resolveEquipment,
    resolveEquipped: defaultIsEquipped,
  });

  // What a level gain just paid out in vouchers. It reports a count and banks
  // nothing: the balance is server inventory, and this cabinet must never be the
  // thing that decides how many vouchers an account holds.
  function vouchersBetween({ fromLevel = 1, toLevel = 1 } = {}) {
    return track.rewardsBetween({ fromLevel, toLevel })
      .filter((reward) => reward.family === "skin-voucher").length;
  }

  // The same count for the other currency. Kept as its own function rather than
  // a parameterised one so a caller cannot accidentally spend a skin voucher's
  // count on an emote redemption.
  function emoteVouchersBetween({ fromLevel = 1, toLevel = 1 } = {}) {
    return track.rewardsBetween({ fromLevel, toLevel })
      .filter((reward) => reward.family === "emote-voucher").length;
  }

  return {
    EMOTE_VOUCHER_LEVELS,
    PENDING_CONTENT,
    REWARD_CADENCE: track.REWARD_CADENCE,
    SKIN_VOUCHER_LEVELS,
    emoteVouchersBetween,
    buildRewardTree: track.buildRewardTree,
    earnedItemIds: track.earnedItemIds,
    listRewards: track.listRewards,
    rewardsBetween: track.rewardsBetween,
    vouchersBetween,
  };
});
