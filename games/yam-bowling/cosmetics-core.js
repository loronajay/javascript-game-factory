(function exposeCosmeticsCore(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const animation = isCommonJs ? require("./animation-core.js") : root.YamBowlingCore;
  const menuSplash = isCommonJs ? require("./menu-splash-core.js") : root.YamMenuSplash;
  const roomCore = isCommonJs ? require("./room-core.js") : root.YamRoomCore;
  const emoteCore = isCommonJs ? require("./emote-core.js") : root.YamEmoteCore;
  const campaign = isCommonJs ? require("./campaign-core.js") : root.YamCampaign;
  const api = factory(animation, menuSplash, roomCore, emoteCore, campaign);
  if (isCommonJs) module.exports = api;
  root.YamCosmetics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCosmeticsCore(animation, menuSplash, roomCore, emoteCore, campaign) {
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
    "emote",
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
    // Bought with an Emote Voucher rather than pinned to one level or prize.
    // The pool is far deeper than the number of rungs that could name an entry
    // from it, so the currency is what makes all of it reachable.
    "emote-voucher",
    "bowler-level",
    "player-level",
    "campaign",
    "tournament",
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

      // The two rewards that make the summit of a bowler's ladder mean
      // something. They are scoped to the bowler who earned them but worn in
      // the global title slot, because a title says something about the player
      // wearing it — you are Reina's master whichever bowler you take to the
      // lane. Text only, so a mastery ladder can pay out without new art.
      const firstName = bowler.name.split(/\s+/)[0];
      items.push(defineItem({
        type: "title",
        idParts: [bowler.slug, "nameplate"],
        name: `${bowler.name} Nameplate`,
        characterSlug: bowler.slug,
        assets: {},
        tier: "rare",
        unlock: Object.freeze({
          source: "bowler-level",
          detail: `Reach mastery level 29 with ${bowler.name}.`,
        }),
      }));
      items.push(defineItem({
        type: "title",
        idParts: [bowler.slug, "master"],
        name: `${firstName} Master`,
        characterSlug: bowler.slug,
        assets: {},
        tier: "legendary",
        unlock: Object.freeze({
          source: "bowler-level",
          detail: `Reach maximum mastery with ${bowler.name}.`,
        }),
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

  // Emotes carry no presentation tier. Unlike a trail or a room there is no
  // rarer version of a gesture -- a wave is a wave -- so rarity would be a
  // label with nothing underneath it. What separates them is where they are
  // earned, which the catalog already records.
  function buildEmoteItems() {
    return emoteCore.EMOTES.map((emote) => defineItem({
      type: "emote",
      idParts: [emote.slug],
      name: emote.name,
      assets: { art: emote.src, alt: emote.alt, description: emote.description },
      unlock: emote.unlock,
    }));
  }

  // Effects are pure code, so they are catalogued here before milestone 3
  // renders them. Declaring them early is what lets the loadout contract and
  // its slots be tested without waiting on a particle emitter.
  function buildEffectItems() {
    const effectUnlock = Object.freeze({ source: "bowler-level", detail: "Earned through bowler mastery." });
    const playerUnlock = Object.freeze({ source: "player-level", detail: "Earned through Yam Bowling play." });
    const tournamentUnlock = Object.freeze({ source: "tournament", detail: "Random prize from a rotating Yam tournament." });

    // Which ladder earns an effect is a fact about the item, so it is recorded
    // here beside the item rather than inferred from whichever tree happens to
    // list it -- the catalog cannot import the ladders, since they are built on
    // top of it. `player-rewards-core.test.js` asserts the two agree, so a
    // retuned cadence that forgets to move an id fails rather than shipping a
    // reward whose own unlock copy contradicts the tree offering it.
    const PLAYER_LEVEL_EFFECTS = new Set([
      "lime-shock", "emerald-glow", "mint-frost", "cyan-pulse", "electric-blue",
      "indigo-drive", "violet-haze", "purple-plasma", "magenta-pop", "hot-pink",
      "gold-star", "emerald-impact", "mint-crackle", "cyan-flash",
      "indigo-ring", "violet-bloom", "purple-nova", "magenta-blast", "hot-pink-pop",
      // The player ladder's summit. It sits here rather than on the mastery
      // ladder because that one has no lime trail to pair it with, and a burst
      // no level pays out would be a reward whose own unlock copy contradicts
      // every ladder offering it.
      "lime-pop",
    ]);
    const unlockFor = (id) => (PLAYER_LEVEL_EFFECTS.has(id) ? playerUnlock : effectUnlock);
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
      ["perfect-line", "Perfect Line Ball Trail", ["#fdfdff", "#9d7bff"], "legendary"],
      // The mastery ladder's own metals. The player ladder owns the whole
      // green-to-pink spectrum above, so these deliberately sit outside it:
      // a warm metal, and the summit's deep-indigo eclipse with a warm corona.
      ["rose-gold", "Rose Gold Ball Trail", ["#f4a08c", "#ffd9c9"]],
      ["eclipse", "Eclipse Ball Trail", ["#312e81", "#f0abfc"], "legendary"],
    ];
    const colorBursts = [
      ["ember", "Ember Burst", ["#ffb347", "#ff5f1f"]],
      ["red-supernova", "Red Supernova Burst", ["#ff1744", "#ff6b6b"]],
      ["gold-star", "Gold Star Burst", ["#ffd60a", "#fff3a3"]],
      ["lime-pop", "Lime Pop Burst", ["#b7ff00", "#efff85"]],
      ["emerald-impact", "Emerald Impact Burst", ["#00e676", "#69f0ae"]],
      ["mint-crackle", "Mint Crackle Burst", ["#00f5d4", "#b8fff4"]],
      ["cyan-flash", "Cyan Flash Burst", ["#00e5ff", "#80f3ff"]],
      ["sky-shatter", "Sky Shatter Burst", ["#38bdf8", "#bae6fd"]],
      ["electric-blue", "Electric Blue Burst", ["#2563ff", "#70a5ff"]],
      ["indigo-ring", "Indigo Ring Burst", ["#5b5cff", "#a5a6ff"]],
      ["violet-bloom", "Violet Bloom Burst", ["#8b5cf6", "#d8b4fe"]],
      ["purple-nova", "Purple Nova Burst", ["#c026ff", "#efabff"]],
      ["magenta-blast", "Magenta Blast Burst", ["#ff00d4", "#ff8ae8"]],
      ["hot-pink-pop", "Hot Pink Pop Burst", ["#ff1493", "#ff9bd4"]],
      ["diamond-spark", "Diamond Spark Burst", ["#ffffff", "#b8e9ff"], "legendary"],
      // The bursts that pair with the mastery ladder's two metals, so levels
      // 10/20 and the summit read as one escalating set rather than three
      // unrelated colours.
      ["rose-gold", "Rose Gold Burst", ["#f4a08c", "#ffd9c9"]],
      ["eclipse-corona", "Eclipse Corona Burst", ["#1e1b4b", "#fde68a"], "legendary"],
    ];
    const tournamentTrails = [
      ["championship-gold", "Championship Gold Ball Trail", ["#ffd96a", "#fff7c2"]],
      ["bracket-fire", "Bracket Fire Ball Trail", ["#ff3b30", "#ffb347"]],
      ["cosmic-ribbon", "Cosmic Ribbon Ball Trail", ["#6e5cff", "#f15bff"]],
      ["royal-confetti", "Royal Confetti Ball Trail", ["#ffd60a", "#ff2d9a"]],
    ];
    const tournamentBursts = [
      ["pin-crown", "Pin Crown Burst", ["#ffe27a", "#ffffff"]],
      ["finals-fireworks", "Finals Fireworks Burst", ["#ff453a", "#ffd60a"]],
      ["cosmic-cup", "Cosmic Cup Burst", ["#7d5cff", "#55e6ff"]],
      ["victory-ribbon", "Victory Ribbon Burst", ["#ff2d9a", "#fff0a6"]],
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
        unlock: unlockFor(id),
      })),
      ...tournamentTrails.map(([id, name, palette]) => defineItem({
        type: "ball-trail",
        idParts: [id],
        name,
        assets: { palette: Object.freeze(palette) },
        tier: "rare",
        unlock: tournamentUnlock,
      })),
      defineItem({
        type: "strike-burst",
        idParts: ["classic"],
        name: "Classic Burst",
        assets: { palette: Object.freeze(["#fff6d5", "#ffd166"]) },
        unlock: founding,
      }),
      ...colorBursts.map(([id, name, palette, tier = "rare"]) => defineItem({
        type: "strike-burst",
        idParts: [id],
        name,
        assets: { palette: Object.freeze(palette) },
        tier,
        unlock: unlockFor(id),
      })),
      ...tournamentBursts.map(([id, name, palette]) => defineItem({
        type: "strike-burst",
        idParts: [id],
        name,
        assets: { palette: Object.freeze(palette) },
        tier: "rare",
        unlock: tournamentUnlock,
      })),
    ];
  }

  function buildProfileItems() {
    const mastery = (detail) => Object.freeze({ source: "bowler-level", detail });
    const achievement = (detail) => Object.freeze({ source: "achievement", detail });
    const tournament = (detail) => Object.freeze({ source: "tournament", detail });
    const art = (slug) => ({ art: `assets/profile-rewards/${slug}.webp` });

    return [
      defineItem({ type: "title", idParts: ["rookie"], name: "Rookie", assets: {}, unlock: founding }),
      defineItem({
        type: "title",
        idParts: ["pin-chaser"],
        name: "Pin Chaser",
        assets: art("pin-chaser"),
        tier: "rare",
        unlock: mastery("Reach mastery level 19 with any bowler."),
      }),
      defineItem({
        type: "title",
        idParts: ["comeback-kid"],
        name: "Comeback Kid",
        assets: art("comeback-kid"),
        tier: "rare",
        unlock: achievement("Win after trailing by 30 or more entering the final frame."),
      }),
      defineItem({
        type: "title",
        idParts: ["yam-champion"],
        name: "Yam Champion",
        assets: art("yam-champion"),
        tier: "legendary",
        unlock: tournament("Win the Yam Championship tournament."),
      }),
      defineItem({ type: "badge", idParts: ["founding-bowler"], name: "Founding Bowler", assets: {}, unlock: founding }),
      // The mastery ladder's three title rungs, replacing the badges that used
      // to sit at 13/21/28 -- a badge is an achievement reward now, never a
      // level one. Crest art is deliberately optional: a title is live text, so
      // these are wearable the moment the level lands and gain a crest later,
      // exactly as `title:rookie` has always worked.
      defineItem({
        type: "title",
        idParts: ["pocket-hunter"],
        name: "Pocket Hunter",
        assets: {},
        tier: "rare",
        unlock: mastery("Reach mastery level 13 with any bowler."),
      }),
      defineItem({
        type: "title",
        idParts: ["lane-reader"],
        name: "Lane Reader",
        assets: {},
        tier: "rare",
        unlock: mastery("Reach mastery level 21 with any bowler."),
      }),
      defineItem({
        type: "title",
        idParts: ["shotmaker"],
        name: "Shotmaker",
        assets: {},
        tier: "legendary",
        unlock: mastery("Reach mastery level 28 with any bowler."),
      }),
      // These three keep `badge` as their type, and therefore their launch ids,
      // even though a badge is no longer a level reward. Retyping them to
      // `title` would rename `badge:laser-focus` to `title:laser-focus`, and
      // since `db/game-loadouts.mts` builds ownership from `game_entitlements`
      // alone, every row already granted to a live account would stop resolving
      // and be stripped on that account's next save. Moving the unlock SOURCE
      // costs nothing and takes no migration: the id is what a granted row is
      // keyed by, and it has not moved. Accounts that earned these through
      // mastery keep them; everyone after earns them where badges now live.
      defineItem({
        type: "badge",
        idParts: ["laser-focus"],
        name: "Laser Focus",
        assets: art("laser-focus"),
        tier: "rare",
        unlock: achievement("Bowl a game with no shot outside the pocket."),
      }),
      defineItem({
        type: "badge",
        idParts: ["precision-bowler"],
        name: "Precision Bowler",
        assets: art("precision-bowler"),
        tier: "rare",
        unlock: achievement("Convert twenty spares without missing one."),
      }),
      defineItem({
        type: "badge",
        idParts: ["lane-legend"],
        name: "Lane Legend",
        assets: art("lane-legend"),
        tier: "legendary",
        unlock: achievement("Win a sanctioned match on every lane in the house."),
      }),
      defineItem({
        type: "title",
        idParts: ["ice-in-the-tenth"],
        name: "Ice in the Tenth",
        assets: art("ice-in-the-tenth"),
        tier: "rare",
        unlock: achievement("Strike in the tenth when only a strike can preserve the win."),
      }),
      defineItem({
        type: "title",
        idParts: ["spare-architect"],
        name: "Spare Architect",
        assets: art("spare-architect"),
        tier: "rare",
        unlock: achievement("Convert 100 spares in sanctioned career play."),
      }),
      defineItem({
        type: "title",
        idParts: ["bracket-breaker"],
        name: "Bracket Breaker",
        assets: art("bracket-breaker"),
        tier: "rare",
        unlock: tournament("Win a first sanctioned tournament."),
      }),
      defineItem({
        type: "title",
        idParts: ["undisputed"],
        name: "Undisputed",
        assets: art("undisputed"),
        tier: "legendary",
        unlock: tournament("Win every major tournament in one season."),
      }),
      defineItem({
        type: "badge",
        idParts: ["perfect-game"],
        name: "Perfect Game",
        assets: art("perfect-game"),
        tier: "legendary",
        unlock: achievement("Bowl a 300."),
      }),
      defineItem({
        type: "badge",
        idParts: ["split-decision"],
        name: "Split Decision",
        assets: art("split-decision"),
        tier: "rare",
        unlock: achievement("Convert a 7-10 split."),
      }),
      defineItem({
        type: "badge",
        idParts: ["clean-card"],
        name: "Clean Card",
        assets: art("clean-card"),
        tier: "rare",
        unlock: achievement("Complete a regulation game without an open frame."),
      }),
      defineItem({
        type: "badge",
        idParts: ["turkey-club"],
        name: "Turkey Club",
        assets: art("turkey-club"),
        tier: "rare",
        unlock: achievement("Roll three consecutive strikes in sanctioned play."),
      }),
      defineItem({
        type: "badge",
        idParts: ["road-tested"],
        name: "Road Tested",
        assets: art("road-tested"),
        tier: "rare",
        unlock: achievement("Complete a sanctioned match at every venue."),
      }),
      defineItem({
        type: "badge",
        idParts: ["deep-bench"],
        name: "Deep Bench",
        assets: art("deep-bench"),
        tier: "legendary",
        unlock: achievement("Record a sanctioned win with every unlocked bowler."),
      }),
    ];
  }

  const CATALOG = Object.freeze([
    ...buildCharacterItems(),
    ...buildMenuSplashItems(),
    ...buildRoomItems(),
    ...buildEmoteItems(),
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
