(function exposeRoomCore(root, factory) {
  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.YamRoomCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRoomCore(root) {
  "use strict";

  // The player-room catalog: the full-screen backdrop a bowler's own space is
  // painted in.
  //
  // Unlike lanes and menu splashes, this module owns NO persistence. Those two
  // shipped before the loadout existed and still carry a legacy key for their
  // migration; rooms are new, so the loadout is their only owner from the first
  // line and there is nothing to migrate. Equipping happens through
  // `loadout-core.js`, and ownership through the cosmetic catalog.
  //
  // Being new is also what lets rooms ship LOCKED without taking anything away
  // from anyone — the problem that makes retro-fitting locks onto existing
  // content unfair. A player starts with a room; the rest are earned.
  //
  // Nothing else names a room's image file: the path is derived from the slug,
  // and `tools/optimize_runtime_assets.py` globs the folder, so a new room is
  // one PNG master plus one row below.

  const DEFAULT_ROOM_SLUG = "default";

  const campaign = Object.freeze({ source: "campaign", detail: "Earned in the campaign." });
  const founding = Object.freeze({ source: "founding", detail: "Available to every bowler." });

  const achievement = Object.freeze({ source: "achievement", detail: "Won at the top of the circuit." });
  const tournament = Object.freeze({ source: "tournament", detail: "Rare prize from a rotating Yam tournament." });

  // `default` is the room every bowler starts in and the only founding entry:
  // every other room is earned. That is only fair because rooms are new content
  // -- nothing is being taken from a player who already had it.
  const ROOMS = Object.freeze([
    ["Starter Room", "default", "Afternoon light, a good chair, and shelf space waiting to be filled.", founding, "standard"],
    ["Teal Lounge", "teal-lounge", "Low couches and cool green glass.", campaign, "standard"],
    ["Hot Pink Hideout", "hot-pink-hideout", "Loud, warm, and entirely unapologetic.", campaign, "standard"],
    ["Retro Arcade", "retro-arcade", "Cabinet glow and carpet that has seen things.", campaign, "standard"],
    ["Beach House", "beach-house", "Salt air through open doors and sand you never quite sweep out.", campaign, "standard"],
    ["Industrial Workshop", "industrial-workshop", "Bare bulbs, steel benches, and a ball drilled to your hand.", campaign, "standard"],
    ["Botanical Glasshouse", "botanical-glasshouse", "Green light under glass, quiet enough to hear the approach.", campaign, "rare"],
    ["Frosted Suite", "frosted-suite", "Pale winter light on white stone.", campaign, "rare"],
    ["Lavender Cosmic", "lavender-cosmic", "Violet nebulae drifting past the window.", campaign, "rare"],
    ["Black Gothic", "black-gothic", "Dark arches and candlelight over polished stone.", campaign, "rare"],
    ["Circuit Red", "circuit-red", "Sanctioned red and chrome, the colours of the tour.", campaign, "rare"],
    ["Tower Penthouse", "tower-penthouse", "The whole city below, and nobody above you.", achievement, "legendary"],
    ["Champion's Room", "champion-room", "Silverware on every surface. You earned each piece.", tournament, "legendary"],
  ].map(([name, slug, description, unlock, tier]) => Object.freeze({
    name,
    slug,
    description,
    unlock,
    tier,
    // Full-screen backdrops, so there is no picker thumbnail: the optimizer
    // deliberately generates none for this collection.
    src: `assets/menu-splashes/player-rooms/${slug}.webp`,
    alt: `${name} player room`,
  })));

  function getRoom(slug) {
    return ROOMS.find((room) => room.slug === slug)
      || ROOMS.find((room) => room.slug === DEFAULT_ROOM_SLUG);
  }

  return {
    DEFAULT_ROOM_SLUG,
    ROOMS,
    getRoom,
  };
});
