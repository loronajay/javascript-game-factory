(function exposeEmoteCore(root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.YamEmoteCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEmoteCore(root) {
  "use strict";

  // The emote catalog: sticker reactions a player throws on the lane.
  //
  // Emotes are deliberately a GLOBAL pool rather than per-bowler art. Thirty
  // stickers shared by thirty bowlers is thirty images; one set each would be
  // nine hundred, which is the same wall the character banners and alternate
  // splashes hit. Because the pool is global, an emote is named for the gesture
  // it shows and never for whoever happens to be drawn making it -- any bowler
  // can wear any of them.
  //
  // Like `room-core.js` and unlike lanes and splashes, this module owns NO
  // persistence. Emotes postdate the loadout, so there is no legacy key to
  // migrate and `loadout-core.js` is their only owner from the first line.
  //
  // Nothing else names an emote's image file: the path is derived from the
  // slug, and `tools/optimize_runtime_assets.py` globs the folder, so a new
  // emote is one PNG master plus one row below.

  const DEFAULT_EMOTE_SLUG = "wave";

  const founding = Object.freeze({ source: "founding", detail: "Available to every bowler." });
  // Every earnable emote is bought with an Emote Voucher rather than being
  // pinned to one level or one prize. Naming a specific emote per source was
  // the obvious design and the wrong one: there are thirty of them and only a
  // handful of level rungs, so most of the pool would never have been reachable
  // at all. A voucher makes the whole remainder obtainable and lets the player
  // pick the reaction they actually want, exactly as a Skin Voucher does.
  const voucher = Object.freeze({
    source: "emote-voucher",
    detail: "Redeem an Emote Voucher.",
  });
  const masteryLevel = (level) => Object.freeze({
    source: "bowler-level",
    detail: `Reach mastery level ${level} with any bowler.`,
  });

  // Six founding emotes, all of them warm or neutral. A player who has just
  // arrived can still react, and nothing in the starter set reads as taunting
  // when it lands on an opponent's open frame -- the sharper ones are earned.
  const EMOTES = Object.freeze([
    ["Wave", "wave", "A friendly hello across the lanes.", founding],
    ["Thumbs Up", "thumbs-up", "Clean approval, no notes.", founding],
    ["Good Luck", "good-luck", "Hands together before the first ball.", founding],
    ["Nice One", "nice-one", "Warm credit where it is due.", founding],
    ["Let's Go", "lets-go", "Fist up, pins already flying.", founding],
    ["Oh No", "oh-no", "Hands to cheeks as it drifts wide.", founding],

    ["Cheer", "cheer", "Both fists up, delighted.", voucher],
    ["Peace", "peace", "Two fingers and a wink.", voucher],
    ["Hair Flip", "hair-flip", "Unbothered, sparkling.", voucher],
    ["Crowned", "crowned", "A crown of pins, worn like it was always yours.", voucher],

    ["Game Face", "game-face", "The look that arrives before the shot does.", masteryLevel(17)],

    ["Fist Pump", "fist-pump", "The full-body yes.", voucher],
    ["Salute", "salute", "Two fingers off the brow, target acquired.", voucher],
    ["Number One", "number-one", "One finger, aimed squarely at you.", voucher],
    ["Proud", "proud", "Hand on heart, fist in the air.", voucher],
    ["Finger Heart", "finger-heart", "A small heart, thrown sideways.", voucher],
    ["Blow Kiss", "blow-kiss", "Sent down the lane with the ball.", voucher],
    ["Cheeky", "cheeky", "Tongue out, entirely unrepentant.", voucher],
    ["Wink", "wink", "Called it.", voucher],
    ["Brush It Off", "brush-it-off", "Dusting the shoulder as the ball lands.", voucher],
    ["You're Next", "you-next", "A fist pointed straight down the lane.", voucher],

    ["Phew", "phew", "Wiping the brow after a rack that nearly stood.", voucher],
    ["Please Fall", "please-fall", "Hands clasped at the one still wobbling.", voucher],
    ["Rattled", "rattled", "Teeth gritted at a pin that would not go.", voucher],
    ["Shush", "shush", "One finger to the lips. Watch this.", voucher],
    ["Well Actually", "well-actually", "Glasses adjusted, point about to be made.", voucher],
    ["Heads Up", "heads-up", "One finger raised. Listen a second.", voucher],
    ["After You", "after-you", "An open palm and a very patient smile.", voucher],
    ["Lock In", "lock-in", "Everything else goes quiet.", voucher],
    ["Fist Bump", "fist-bump", "Knuckles to the ball before it goes.", voucher],
  ].map(([name, slug, description, unlock]) => Object.freeze({
    name,
    slug,
    description,
    unlock,
    // Sticker overlays beside a bowler, so there is no picker thumbnail: the
    // optimizer deliberately generates none for this collection.
    src: `assets/emotes/${slug}.webp`,
    alt: `${name} emote`,
  })));

  function getEmote(slug) {
    return EMOTES.find((emote) => emote.slug === slug)
      || EMOTES.find((emote) => emote.slug === DEFAULT_EMOTE_SLUG);
  }

  function isEmoteSlug(slug) {
    return EMOTES.some((emote) => emote.slug === slug);
  }

  function normalizeEmoteSlug(slug) {
    return isEmoteSlug(slug) ? slug : DEFAULT_EMOTE_SLUG;
  }

  return {
    DEFAULT_EMOTE_SLUG,
    EMOTES,
    getEmote,
    isEmoteSlug,
    normalizeEmoteSlug,
  };
});
