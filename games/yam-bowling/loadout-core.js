(function exposeLoadoutCore(root, factory) {
  "use strict";
  const isCommonJs = typeof module === "object" && module.exports;
  const animation = isCommonJs ? require("./animation-core.js") : root.YamBowlingCore;
  const menuSplash = isCommonJs ? require("./menu-splash-core.js") : root.YamMenuSplash;
  const cosmetics = isCommonJs ? require("./cosmetics-core.js") : root.YamCosmetics;
  const roomCore = isCommonJs ? require("./room-core.js") : root.YamRoomCore;
  const api = factory(root, animation, menuSplash, cosmetics, roomCore);
  if (isCommonJs) module.exports = api;
  root.YamLoadout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLoadoutCore(root, animation, menuSplash, cosmetics, roomCore) {
  "use strict";

  // The presentation loadout: what this device has, and what it has equipped.
  //
  // `cosmetics-core.js` says what exists; this module says what is owned and
  // worn. Keeping the two apart is the whole point of the contract -- when
  // milestone 4 makes ownership authoritative, only the ownership source in
  // here changes, and no catalog entry, slot, or UI call site moves.
  //
  // Ownership has four sources, in this order:
  //   1. catalog default   -- everything that shipped before progression.
  //   2. campaign progress -- character-linked art follows its bowler live.
  //   3. persisted grants  -- the ledger an authoritative server will own.
  //   4. dev entitlement   -- a deliberate authoring switch, never a grant.
  // A dev entitlement is deliberately NOT written to the grant ledger, so no
  // local experiment can turn into a balance the server has to reconcile.

  const SCHEMA_VERSION = 1;
  const LOADOUT_STORAGE_KEY = "yam-bowling.loadout.v1";
  const DEV_ENTITLEMENT_STORAGE_KEY = "yam-bowling.dev-entitlement";
  const LEGACY_EQUIPPED_SKINS_KEY = animation.LEGACY_EQUIPPED_SKINS_STORAGE_KEY;
  const LEGACY_MENU_SPLASH_KEY = menuSplash.MENU_SPLASH_STORAGE_KEY;

  // A slot declares the one reward type it accepts. `character` slots also
  // require the item to belong to that bowler, which is what stops another
  // bowler's art from being worn.
  const BOWLER_SLOTS = Object.freeze({
    skin: Object.freeze({ type: "skin", perSkin: true }),
    victoryPose: Object.freeze({ type: "victory-pose", perSkin: true }),
    defeatPose: Object.freeze({ type: "defeat-pose", perSkin: true }),
    playerCard: Object.freeze({ type: "player-card", perSkin: false }),
    // A bowler's own splash variant. Only the canon one exists today; the
    // alternate splash at bowler level 15 lands in this slot.
    menuSplash: Object.freeze({ type: "profile-art", perSkin: false }),
    profileArt: Object.freeze({ type: "profile-art", perSkin: false }),
  });

  const GLOBAL_SLOTS = Object.freeze({
    ballTrail: Object.freeze({ type: "ball-trail", defaultId: "ball-trail:none" }),
    strikeBurst: Object.freeze({ type: "strike-burst", defaultId: "strike-burst:classic" }),
    title: Object.freeze({ type: "title", defaultId: "title:rookie" }),
    badge: Object.freeze({ type: "badge", defaultId: "badge:founding-bowler" }),
    // The title-screen splash: the one global cosmetic that already shipped.
    menuSplash: Object.freeze({ type: "menu-splash", defaultId: null }),
    // The player's own room. New content, so unlike every slot above it has no
    // legacy key to migrate -- this has been its only owner from the first line.
    room: Object.freeze({ type: "room", defaultId: null }),
    // Profile decoration reuses character profile art, so a featured bowler
    // can frame and back their own page without new asset types.
    profileFrame: Object.freeze({ type: "profile-art", defaultId: null }),
    profileBackground: Object.freeze({ type: "profile-art", defaultId: null }),
  });

  function canonBowler(slug) {
    return animation.CANON_BOWLERS.find((bowler) => bowler.slug === slug) || null;
  }

  function defaultBowlerSlotId(slug, slotName, skinId) {
    const slot = BOWLER_SLOTS[slotName];
    if (!slot) return null;
    return slot.perSkin
      ? cosmetics.buildItemId(slot.type, slug, skinId)
      : cosmetics.buildItemId(slot.type, slug);
  }

  function defaultGlobalSlotId(slotName) {
    const slot = GLOBAL_SLOTS[slotName];
    if (!slot) return null;
    if (slot.defaultId) return slot.defaultId;
    if (slotName === "menuSplash") {
      return cosmetics.buildItemId("menu-splash", menuSplash.DEFAULT_MENU_SPLASH_SLUG);
    }
    if (slotName === "room") {
      return cosmetics.buildItemId("room", roomCore.DEFAULT_ROOM_SLUG);
    }
    return null;
  }

  function emptyRecord() {
    return { version: SCHEMA_VERSION, bowlers: {}, global: {}, featured: { bowlerSlug: null, skinId: animation.DEFAULT_SKIN_ID }, granted: [] };
  }

  function readLegacySkinIds(storage) {
    try {
      const parsed = JSON.parse(storage?.getItem?.(LEGACY_EQUIPPED_SKINS_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  // The migration is a one-way read of the two preferences that already exist
  // on players' devices. The legacy keys are left in place on purpose: an
  // older build still boots into the same look if this one is rolled back.
  function migrateLegacyPreferences(storage) {
    const record = emptyRecord();

    for (const [slug, skinId] of Object.entries(readLegacySkinIds(storage))) {
      if (!canonBowler(slug)) continue;
      const normalizedSkinId = animation.normalizeSkinId(skinId);
      if (normalizedSkinId === animation.DEFAULT_SKIN_ID) continue;
      record.bowlers[slug] = { skin: cosmetics.buildItemId("skin", slug, normalizedSkinId) };
    }

    let legacySplash = null;
    try {
      legacySplash = storage?.getItem?.(LEGACY_MENU_SPLASH_KEY) ?? null;
    } catch {
      legacySplash = null;
    }
    if (legacySplash) {
      record.global.menuSplash = cosmetics.buildItemId("menu-splash", menuSplash.getMenuSplash(legacySplash).slug);
    }

    return record;
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== "object" || raw.version !== SCHEMA_VERSION) return null;
    const record = emptyRecord();

    if (raw.bowlers && typeof raw.bowlers === "object") {
      for (const [slug, slots] of Object.entries(raw.bowlers)) {
        if (!canonBowler(slug) || !slots || typeof slots !== "object") continue;
        const kept = {};
        for (const slotName of Object.keys(BOWLER_SLOTS)) {
          if (cosmetics.isValidItemId(slots[slotName])) kept[slotName] = slots[slotName];
        }
        if (Object.keys(kept).length) record.bowlers[slug] = kept;
      }
    }

    if (raw.global && typeof raw.global === "object") {
      for (const slotName of Object.keys(GLOBAL_SLOTS)) {
        if (cosmetics.isValidItemId(raw.global[slotName])) record.global[slotName] = raw.global[slotName];
      }
    }

    if (raw.featured && typeof raw.featured === "object") {
      record.featured = {
        bowlerSlug: canonBowler(raw.featured.bowlerSlug) ? raw.featured.bowlerSlug : null,
        skinId: animation.normalizeSkinId(raw.featured.skinId),
      };
    }

    if (Array.isArray(raw.granted)) {
      record.granted = raw.granted.filter((id) => {
        const item = cosmetics.getItem(id);
        return item && !cosmetics.isOwnedByDefault(id) && item.unlock.source !== "character-unlock";
      });
    }

    return record;
  }

  function defaultStorage() {
    try {
      return root.localStorage;
    } catch {
      return null;
    }
  }

  function createLoadoutStore({ storage = defaultStorage(), campaign = null } = {}) {
    let record = null;
    try {
      record = normalizeRecord(JSON.parse(storage?.getItem?.(LOADOUT_STORAGE_KEY) || "null"));
    } catch {
      record = null;
    }

    // No usable record means either a first run or a version this build does
    // not understand. Either way the legacy preferences are the safest source.
    let migrated = false;
    if (!record) {
      record = migrateLegacyPreferences(storage);
      migrated = true;
    }

    let devEntitlement = false;
    try {
      devEntitlement = storage?.getItem?.(DEV_ENTITLEMENT_STORAGE_KEY) === "on";
    } catch {
      devEntitlement = false;
    }

    function persist() {
      try {
        storage?.setItem?.(LOADOUT_STORAGE_KEY, JSON.stringify(record));
      } catch {
        // Storage is a convenience; the loadout still applies to this session.
      }
    }

    if (migrated) persist();

    function owns(itemId) {
      const item = cosmetics.getItem(itemId);
      if (!item) return false;
      let unlockedWithBowler = false;
      if (item.unlock.source === "character-unlock" && item.characterSlug) {
        try {
          unlockedWithBowler = campaign.getUnlockedBowlerSlugs().includes(item.characterSlug);
        } catch {
          unlockedWithBowler = false;
        }
      }
      return cosmetics.isOwnedByDefault(itemId) || unlockedWithBowler
        || record.granted.includes(itemId) || devEntitlement;
    }

    function accepts(slot, item, characterSlug) {
      if (!item || item.type !== slot.type) return false;
      if (characterSlug === undefined) return true;
      return item.characterSlug === characterSlug;
    }

    function getBowlerSlot(slug, slotName) {
      const slot = BOWLER_SLOTS[slotName];
      if (!slot || !canonBowler(slug)) return null;
      const stored = record.bowlers[slug]?.[slotName];
      if (stored && owns(stored)) return stored;
      return defaultBowlerSlotId(slug, slotName, getEquippedSkinId(slug));
    }

    function equipBowlerSlot(slug, slotName, itemId) {
      const slot = BOWLER_SLOTS[slotName];
      if (!slot || !canonBowler(slug)) return null;
      const item = cosmetics.getItem(itemId);
      if (accepts(slot, item, slug) && owns(itemId)) {
        record.bowlers[slug] = { ...record.bowlers[slug], [slotName]: itemId };
        persist();
      }
      return getBowlerSlot(slug, slotName);
    }

    function getGlobalSlot(slotName) {
      if (!GLOBAL_SLOTS[slotName]) return null;
      const stored = record.global[slotName];
      if (stored && owns(stored)) return stored;
      return defaultGlobalSlotId(slotName);
    }

    function equipGlobalSlot(slotName, itemId) {
      const slot = GLOBAL_SLOTS[slotName];
      if (!slot) return null;
      const item = cosmetics.getItem(itemId);
      if (accepts(slot, item) && owns(itemId)) {
        record.global[slotName] = itemId;
        persist();
      }
      return getGlobalSlot(slotName);
    }

    // The equipped skin is the one loadout slot gameplay reads every frame, so
    // it keeps a skin-id shaped accessor rather than making every caller parse
    // an item id.
    function getEquippedSkinId(slug) {
      if (!canonBowler(slug)) return animation.DEFAULT_SKIN_ID;
      const stored = record.bowlers[slug]?.skin;
      const item = cosmetics.getItem(stored);
      if (!item || !owns(stored)) return animation.DEFAULT_SKIN_ID;
      return animation.normalizeSkinId(stored.split(":")[2]);
    }

    function equipSkin(slug, skinId) {
      if (!canonBowler(slug)) return animation.DEFAULT_SKIN_ID;
      const normalizedSkinId = animation.normalizeSkinId(skinId);
      equipBowlerSlot(slug, "skin", cosmetics.buildItemId("skin", slug, normalizedSkinId));
      return getEquippedSkinId(slug);
    }

    function getMenuSplashSlug() {
      const itemId = getGlobalSlot("menuSplash");
      return menuSplash.getMenuSplash(itemId?.split(":")[1]).slug;
    }

    function setMenuSplashSlug(slug) {
      const normalizedSlug = menuSplash.getMenuSplash(slug).slug;
      equipGlobalSlot("menuSplash", cosmetics.buildItemId("menu-splash", normalizedSlug));
      return getMenuSplashSlug();
    }

    // Room accessors mirror the splash pair: callers deal in slugs, and the item
    // id stays an implementation detail of the loadout.
    function getRoomSlug() {
      const itemId = getGlobalSlot("room");
      return roomCore.getRoom(itemId?.split(":")[1]).slug;
    }

    function setRoomSlug(slug) {
      const normalizedSlug = roomCore.getRoom(slug).slug;
      equipGlobalSlot("room", cosmetics.buildItemId("room", normalizedSlug));
      return getRoomSlug();
    }

    function getFeatured() {
      return { ...record.featured };
    }

    function setFeatured(bowlerSlug, skinId) {
      record.featured = {
        bowlerSlug: canonBowler(bowlerSlug) ? bowlerSlug : null,
        skinId: animation.normalizeSkinId(skinId),
      };
      persist();
      return getFeatured();
    }

    function grant(itemId) {
      const item = cosmetics.getItem(itemId);
      if (!item || cosmetics.isOwnedByDefault(itemId) || item.unlock.source === "character-unlock") return false;
      if (record.granted.includes(itemId)) return false;
      record.granted = [...record.granted, itemId];
      persist();
      return true;
    }

    function listOwned(type) {
      return cosmetics.CATALOG.filter((item) => (!type || item.type === type) && owns(item.id));
    }

    function hasDevEntitlement() {
      return devEntitlement;
    }

    function setDevEntitlement(enabled) {
      devEntitlement = Boolean(enabled);
      try {
        storage?.setItem?.(DEV_ENTITLEMENT_STORAGE_KEY, devEntitlement ? "on" : "off");
      } catch {
        // The switch still applies to this session.
      }
      return devEntitlement;
    }

    return {
      equipBowlerSlot,
      equipGlobalSlot,
      equipSkin,
      getBowlerSlot,
      getEquippedSkinId,
      getFeatured,
      getGlobalSlot,
      getMenuSplashSlug,
      getRoomSlug,
      grant,
      hasDevEntitlement,
      listOwned,
      owns,
      setDevEntitlement,
      setFeatured,
      setMenuSplashSlug,
      setRoomSlug,
    };
  }

  return {
    BOWLER_SLOTS,
    DEV_ENTITLEMENT_STORAGE_KEY,
    GLOBAL_SLOTS,
    LOADOUT_STORAGE_KEY,
    SCHEMA_VERSION,
    createLoadoutStore,
  };
});
