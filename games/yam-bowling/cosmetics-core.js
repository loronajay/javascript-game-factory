(function exposeCosmeticsCore(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const animation = isCommonJs ? require("./animation-core.js") : root.YamBowlingCore;
  const menuSplash = isCommonJs ? require("./menu-splash-core.js") : root.YamMenuSplash;
  const roomCore = isCommonJs ? require("./room-core.js") : root.YamRoomCore;
  const campaign = isCommonJs ? require("./campaign-core.js") : root.YamCampaign;
  const api = factory(animation, menuSplash, roomCore, campaign);
  if (isCommonJs) module.exports = api;
  root.YamCosmetics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCosmeticsCore(animation, menuSplash, roomCore, campaign) {
  "use strict";

  // One catalog contract for every present and future cosmetic reward.
  //
  // The rule that keeps this honest: the catalog describes what EXISTS, never
  // what a player has. Ownership and equipment live in `loadout-core.js`, so a
  // server-backed unlock milestone can replace the ownership source without
  // touching a single item definition here.
  //
  // Existing skins and their outcome portraits are derived from the animation
  // catalog rather than re-listed. Canon is the starter look; every alternate
  // names the exact server entitlement that owns it and its paired poses.

  const REWARD_TYPES = Object.freeze([
    "skin",
    "victory-pose",
    "defeat-pose",
    "player-card",
    "menu-splash",
    "room",
    "profile-art",
    "ball-trail",
    "strike-burst",
    "title",
    "badge",
  ]);

  // Presentation tier only. It shapes how an item is framed in the UI and never
  // how it performs -- progression rewards in this cabinet are cosmetic.
  const PRESENTATION_TIERS = Object.freeze(["standard", "rare", "legendary"]);

  // `founding` marks starter content. Shipped alternate skins are deliberately
  // server-entitled rather than grandfathered as one whole catalog.
  const UNLOCK_SOURCES = Object.freeze([
    "founding",
    "server-entitlement",
    "bowler-level",
    "player-level",
    "campaign",
    "achievement",
    "character-unlock",
  ]);

  const DEFAULT_OWNED_SOURCE = "founding";

  function buildItemId(type, ...parts) {
    return [type, ...parts].join(":");
  }

  function defineItem({
    type,
    idParts,
    name,
    characterSlug = null,
    assets = {},
    tier = "standard",
    unlock,
    entitlementId = null,
  }) {
    return Object.freeze({
      id: buildItemId(type, ...idParts),
      name,
      type,
      scope: characterSlug ? "character" : "global",
      characterSlug,
      assets: Object.freeze({ ...assets }),
      tier,
      unlock: Object.freeze({ ...unlock }),
      entitlementId,
    });
  }

  const founding = Object.freeze({ source: "founding", detail: "Available to every bowler." });
  const serverEntitlement = Object.freeze({
    source: "server-entitlement",
    detail: "Requires an authoritative skin entitlement; acquisition cadence is deferred.",
  });
  const starterBowlerSlugs = new Set(campaign.STARTER_BOWLER_SLUGS);

  function buildCharacterItems() {
    const items = [];

    for (const bowler of animation.CANON_BOWLERS) {
      for (const skin of animation.AVAILABLE_SKINS) {
        const isCanon = skin.id === animation.DEFAULT_SKIN_ID;
        const entitlementId = isCanon ? null : buildItemId("skin", bowler.slug, skin.id);
        const unlock = isCanon ? founding : serverEntitlement;
        items.push(defineItem({
          type: "skin",
          idParts: [bowler.slug, skin.id],
          name: skin.name,
          characterSlug: bowler.slug,
          assets: { portrait: animation.getPortraitAssetPath(bowler, skin.id) },
          unlock,
          entitlementId,
        }));

        // A skin's outcome art is a separate equippable slot even though it
        // ships alongside the skin today: milestone 5 hands out alternate
        // victory poses that are not tied to the equipped look.
        items.push(defineItem({
          type: "victory-pose",
          idParts: [bowler.slug, skin.id],
          name: `${skin.name} Victory`,
          characterSlug: bowler.slug,
          assets: { art: animation.getResultPortraitAssetPath(bowler, "victory", skin.id) },
          unlock,
          entitlementId,
        }));

        items.push(defineItem({
          type: "defeat-pose",
          idParts: [bowler.slug, skin.id],
          name: `${skin.name} Defeat`,
          characterSlug: bowler.slug,
          assets: { art: animation.getResultPortraitAssetPath(bowler, "defeat", skin.id) },
          unlock,
          entitlementId,
        }));
      }

      // The default card and profile art reuse art the cabinet already ships,
      // so the slot has something real to fall back to before any card
      // artwork is authored.
      items.push(defineItem({
        type: "player-card",
        idParts: [bowler.slug],
        name: `${bowler.name} Card`,
        characterSlug: bowler.slug,
        assets: { art: animation.getPortraitAssetPath(bowler, animation.DEFAULT_SKIN_ID) },
        unlock: founding,
      }));

      const splash = menuSplash.getMenuSplash(bowler.slug);
      items.push(defineItem({
        type: "profile-art",
        idParts: [bowler.slug],
        name: `${bowler.name} Portrait`,
        characterSlug: bowler.slug,
        assets: { art: splash.src, thumbnail: splash.thumbnailSrc },
        unlock: founding,
      }));
    }

    return items;
  }

  function buildMenuSplashItems() {
    return menuSplash.MENU_SPLASHES.map((splash) => defineItem({
      type: "menu-splash",
      idParts: [splash.slug],
      name: `${splash.name} Splash`,
      characterSlug: splash.slug,
      assets: { art: splash.src, thumbnail: splash.thumbnailSrc, alt: splash.alt },
      unlock: starterBowlerSlugs.has(splash.slug)
        ? founding
        : Object.freeze({ source: "character-unlock", detail: `Unlock ${splash.name} in the circuit.` }),
    }));
  }

  // A player room is the backdrop of a bowler's own space. Unlike every other
  // entry above, rooms did not ship before progression, so their unlock sources
  // come straight from the room catalog rather than all defaulting to founding.
  function buildRoomItems() {
    return roomCore.ROOMS.map((room) => defineItem({
      type: "room",
      idParts: [room.slug],
      name: room.name,
      assets: { art: room.src, alt: room.alt },
      tier: room.tier,
      unlock: room.unlock,
    }));
  }

  // Effects are pure code, so they are catalogued here before milestone 3
  // renders them. Declaring them early is what lets the loadout contract and
  // its slots be tested without waiting on a particle emitter.
  function buildEffectItems() {
    const trailUnlock = Object.freeze({ source: "bowler-level", detail: "Earned through bowler mastery." });
    const colorTrails = [
      ["red-neon", "Red Neon Ball Trail", ["#ff2d55", "#ff8a5c"]],
      ["orange-flare", "Orange Flare Ball Trail", ["#ff6b00", "#ffb000"]],
      ["gold-rush", "Gold Rush Ball Trail", ["#ffd60a", "#fff3a3"]],
      ["lime-shock", "Lime Shock Ball Trail", ["#b7ff00", "#efff85"]],
      ["emerald-glow", "Emerald Glow Ball Trail", ["#00e676", "#69f0ae"]],
      ["mint-frost", "Mint Frost Ball Trail", ["#00f5d4", "#b8fff4"]],
      ["cyan-pulse", "Cyan Pulse Ball Trail", ["#00e5ff", "#80f3ff"]],
      ["sky-blue", "Sky Blue Ball Trail", ["#38bdf8", "#bae6fd"]],
      ["electric-blue", "Electric Blue Ball Trail", ["#2563ff", "#70a5ff"]],
      ["indigo-drive", "Indigo Drive Ball Trail", ["#5b5cff", "#a5a6ff"]],
      ["violet-haze", "Violet Haze Ball Trail", ["#8b5cf6", "#d8b4fe"]],
      ["purple-plasma", "Purple Plasma Ball Trail", ["#c026ff", "#efabff"]],
      ["magenta-pop", "Magenta Pop Ball Trail", ["#ff00d4", "#ff8ae8"]],
      ["hot-pink", "Hot Pink Ball Trail", ["#ff1493", "#ff9bd4"]],
      ["diamond-white", "Diamond White Ball Trail", ["#ffffff", "#b8e9ff"], "legendary"],
    ];

    return [
      defineItem({
        type: "ball-trail",
        idParts: ["none"],
        name: "No Trail",
        assets: {},
        unlock: founding,
      }),
      ...colorTrails.map(([id, name, palette, tier = "rare"]) => defineItem({
        type: "ball-trail",
        idParts: [id],
        name,
        assets: { palette: Object.freeze(palette) },
        tier,
        unlock: trailUnlock,
      })),
      defineItem({
        type: "strike-burst",
        idParts: ["classic"],
        name: "Classic Burst",
        assets: { palette: Object.freeze(["#fff6d5", "#ffd166"]) },
        unlock: founding,
      }),
      defineItem({
        type: "strike-burst",
        idParts: ["ember"],
        name: "Ember Burst",
        assets: { palette: Object.freeze(["#ffb347", "#ff5f1f"]) },
        tier: "rare",
        unlock: Object.freeze({ source: "bowler-level", detail: "Earned through bowler mastery." }),
      }),
    ];
  }

  function buildProfileItems() {
    return [
      defineItem({ type: "title", idParts: ["rookie"], name: "Rookie", assets: {}, unlock: founding }),
      defineItem({
        type: "title",
        idParts: ["pin-chaser"],
        name: "Pin Chaser",
        assets: {},
        tier: "rare",
        unlock: Object.freeze({ source: "player-level", detail: "Earned through Yam Bowling play." }),
      }),
      defineItem({ type: "badge", idParts: ["founding-bowler"], name: "Founding Bowler", assets: {}, unlock: founding }),
      defineItem({
        type: "badge",
        idParts: ["perfect-game"],
        name: "Perfect Game",
        assets: {},
        tier: "legendary",
        unlock: Object.freeze({ source: "achievement", detail: "Bowl a 300." }),
      }),
    ];
  }

  const CATALOG = Object.freeze([
    ...buildCharacterItems(),
    ...buildMenuSplashItems(),
    ...buildRoomItems(),
    ...buildEffectItems(),
    ...buildProfileItems(),
  ]);

  const itemsById = new Map(CATALOG.map((item) => [item.id, item]));

  function getItem(itemId) {
    return (typeof itemId === "string" && itemsById.get(itemId)) || null;
  }

  function isValidItemId(itemId) {
    return getItem(itemId) !== null;
  }

  // Default ownership is a catalog fact, not a player record: it is what a
  // brand-new device already has. Everything else must come from an
  // authoritative grant once milestone 4 exists.
  function isOwnedByDefault(itemId) {
    return getItem(itemId)?.unlock.source === DEFAULT_OWNED_SOURCE;
  }

  function listByType(type, { characterSlug = null } = {}) {
    return CATALOG.filter((item) => item.type === type
      && (characterSlug === null || item.characterSlug === characterSlug));
  }

  function listForCharacter(characterSlug) {
    return CATALOG.filter((item) => item.characterSlug === characterSlug);
  }

  return {
    CATALOG,
    DEFAULT_OWNED_SOURCE,
    PRESENTATION_TIERS,
    REWARD_TYPES,
    UNLOCK_SOURCES,
    buildItemId,
    getItem,
    isOwnedByDefault,
    isValidItemId,
    listByType,
    listForCharacter,
  };
});
