const { test } = require("node:test");
const assert = require("node:assert/strict");

const animation = require("./animation-core.js");
const campaignCore = require("./campaign-core.js");
const menuSplashCore = require("./menu-splash-core.js");
const cosmetics = require("./cosmetics-core.js");
const roomCore = require("./room-core.js");
const loadoutCore = require("./loadout-core.js");

const {
  BOWLER_SLOTS,
  GLOBAL_SLOTS,
  LOADOUT_STORAGE_KEY,
  SCHEMA_VERSION,
  createLoadoutStore,
} = loadoutCore;

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    has: (key) => map.has(key),
    raw: () => map,
  };
}

function storeWith(seed = {}) {
  return createLoadoutStore({ storage: memoryStorage(seed) });
}

function campaignUnlocks(initialSlugs = campaignCore.STARTER_BOWLER_SLUGS) {
  let unlockedSlugs = [...initialSlugs];
  return {
    getUnlockedBowlerSlugs: () => [...unlockedSlugs],
    unlock: (slug) => { unlockedSlugs = [...new Set([...unlockedSlugs, slug])]; },
  };
}

test("a fresh device gets canon defaults in every slot", () => {
  const store = storeWith();

  assert.equal(store.getEquippedSkinId("reina-sato"), animation.DEFAULT_SKIN_ID);
  assert.equal(store.getMenuSplashSlug(), menuSplashCore.DEFAULT_MENU_SPLASH_SLUG);
  assert.equal(store.getGlobalSlot("ballTrail"), "ball-trail:none");
  assert.equal(store.getGlobalSlot("strikeBurst"), "strike-burst:classic");
  assert.equal(
    store.getBowlerSlot("reina-sato", "victoryPose"),
    cosmetics.buildItemId("victory-pose", "reina-sato", animation.DEFAULT_SKIN_ID),
  );
});

test("fresh menu art is an owned starter and locked bowlers stay out of the picker catalog", () => {
  const campaign = campaignUnlocks();
  const store = createLoadoutStore({ storage: memoryStorage(), campaign });
  const ownedSplashSlugs = store.listOwned("menu-splash").map((item) => item.characterSlug);

  assert.equal(store.getMenuSplashSlug(), campaignCore.STARTER_BOWLER_SLUGS[0]);
  assert.ok(store.owns(`menu-splash:${store.getMenuSplashSlug()}`));
  assert.deepEqual(ownedSplashSlugs, campaignCore.STARTER_BOWLER_SLUGS);
  assert.equal(store.setMenuSplashSlug("hazel-ward"), campaignCore.STARTER_BOWLER_SLUGS[0]);
});

test("menu art ownership is derived live from campaign unlocks and never becomes a grant", () => {
  const storage = memoryStorage();
  const campaign = campaignUnlocks();
  const store = createLoadoutStore({ storage, campaign });
  const hazelSplashId = "menu-splash:hazel-ward";

  assert.equal(store.owns(hazelSplashId), false);
  assert.equal(store.grant(hazelSplashId), false);

  campaign.unlock("hazel-ward");
  assert.equal(store.owns(hazelSplashId), true);
  assert.equal(store.setMenuSplashSlug("hazel-ward"), "hazel-ward");
  assert.deepEqual(JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY)).granted, []);
});

test("both existing local preferences migrate into one versioned record", () => {
  const storage = memoryStorage({
    "yam-bowling.equipped-skins.v1": JSON.stringify({ "reina-sato": "maid", "nia-brooks": "swimsuit" }),
    "yam-bowling.menu-splash": "nia-brooks",
  });
  const store = createLoadoutStore({ storage });

  assert.equal(store.getEquippedSkinId("reina-sato"), "maid");
  assert.equal(store.getEquippedSkinId("nia-brooks"), "swimsuit");
  assert.equal(store.getMenuSplashSlug(), "nia-brooks");

  const persisted = JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY));
  assert.equal(persisted.version, SCHEMA_VERSION);
  assert.equal(persisted.bowlers["reina-sato"].skin, cosmetics.buildItemId("skin", "reina-sato", "maid"));
  assert.equal(persisted.global.menuSplash, cosmetics.buildItemId("menu-splash", "nia-brooks"));

  // Legacy keys are left alone so an older build still boots into the same look.
  assert.ok(storage.has("yam-bowling.equipped-skins.v1"));
  assert.ok(storage.has("yam-bowling.menu-splash"));
});

test("migration ignores garbage in the legacy keys instead of failing to boot", () => {
  const store = storeWith({
    "yam-bowling.equipped-skins.v1": "{not json",
    "yam-bowling.menu-splash": "not-a-bowler",
  });

  assert.equal(store.getEquippedSkinId("reina-sato"), animation.DEFAULT_SKIN_ID);
  assert.equal(store.getMenuSplashSlug(), menuSplashCore.DEFAULT_MENU_SPLASH_SLUG);
});

test("a stored record from an unknown schema version is rebuilt rather than trusted", () => {
  const store = storeWith({
    [LOADOUT_STORAGE_KEY]: JSON.stringify({ version: 99, bowlers: { "reina-sato": { skin: "skin:reina-sato:maid" } } }),
    "yam-bowling.equipped-skins.v1": JSON.stringify({ "reina-sato": "swimsuit" }),
  });

  assert.equal(store.getEquippedSkinId("reina-sato"), "swimsuit");
});

test("equipping persists and normalizes through the catalog", () => {
  const storage = memoryStorage();
  const store = createLoadoutStore({ storage });

  assert.equal(store.equipSkin("reina-sato", "maid"), "maid");
  assert.equal(store.getEquippedSkinId("reina-sato"), "maid");
  assert.equal(createLoadoutStore({ storage }).getEquippedSkinId("reina-sato"), "maid");

  // An unknown skin id falls back to canon rather than writing a broken path.
  assert.equal(store.equipSkin("reina-sato", "future-skin"), animation.DEFAULT_SKIN_ID);
  assert.equal(store.equipSkin("not-a-bowler", "maid"), animation.DEFAULT_SKIN_ID);
});

test("ownership is separate from equipment and unowned items cannot be equipped", () => {
  const store = storeWith();

  assert.ok(store.owns("ball-trail:none"));
  assert.equal(store.owns("ball-trail:red-neon"), false);

  assert.equal(store.equipGlobalSlot("ballTrail", "ball-trail:red-neon"), "ball-trail:none");
  assert.equal(store.getGlobalSlot("ballTrail"), "ball-trail:none");

  store.grant("ball-trail:red-neon");
  assert.ok(store.owns("ball-trail:red-neon"));
  assert.equal(store.equipGlobalSlot("ballTrail", "ball-trail:red-neon"), "ball-trail:red-neon");
});

test("a granted item survives a reload while default ownership is never persisted", () => {
  const storage = memoryStorage();
  createLoadoutStore({ storage }).grant("ball-trail:red-neon");

  const persisted = JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY));
  assert.deepEqual(persisted.granted, ["ball-trail:red-neon"]);
  assert.ok(createLoadoutStore({ storage }).owns("ball-trail:red-neon"));
});

test("the dev entitlement is deliberate, opt-in, and never claims real ownership", () => {
  const storage = memoryStorage();
  const store = createLoadoutStore({ storage });

  assert.equal(store.hasDevEntitlement(), false);
  store.setDevEntitlement(true);
  assert.ok(store.hasDevEntitlement());
  assert.ok(store.owns("ball-trail:red-neon"));

  // It unlocks the catalog for authoring; it does not write a grant ledger the
  // authoritative server would later have to reconcile.
  assert.deepEqual(JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY)).granted, []);

  store.setDevEntitlement(false);
  assert.equal(store.owns("ball-trail:red-neon"), false);
});

test("a slot only accepts items of its own reward type and scope", () => {
  const store = storeWith();

  assert.equal(store.equipBowlerSlot("reina-sato", "victoryPose", "menu-splash:lumi-vega"),
    cosmetics.buildItemId("victory-pose", "reina-sato", animation.DEFAULT_SKIN_ID));
  // Another bowler's art cannot be equipped into this bowler's slot.
  assert.equal(store.equipBowlerSlot("reina-sato", "playerCard", "player-card:nia-brooks"),
    cosmetics.buildItemId("player-card", "reina-sato"));
  assert.equal(store.equipGlobalSlot("title", "badge:founding-bowler"), "title:rookie");
  assert.equal(store.getGlobalSlot("notASlot"), null);
});

test("the featured bowler is kept separate from the gameplay loadout", () => {
  const store = storeWith();

  store.equipSkin("reina-sato", "maid");
  assert.deepEqual(store.getFeatured(), { bowlerSlug: null, skinId: animation.DEFAULT_SKIN_ID });

  store.setFeatured("nia-brooks", "swimsuit");
  assert.deepEqual(store.getFeatured(), { bowlerSlug: "nia-brooks", skinId: "swimsuit" });
  // Featuring a bowler must not change who or what is equipped for a match.
  assert.equal(store.getEquippedSkinId("reina-sato"), "maid");
  assert.equal(store.getEquippedSkinId("nia-brooks"), animation.DEFAULT_SKIN_ID);
});

test("slot names cover the reward types the loadout is responsible for", () => {
  assert.deepEqual(Object.keys(BOWLER_SLOTS), [
    "skin", "victoryPose", "defeatPose", "playerCard", "menuSplash", "profileArt",
  ]);
  assert.deepEqual(Object.keys(GLOBAL_SLOTS), [
    "ballTrail", "strikeBurst", "title", "badge", "menuSplash", "room", "profileFrame", "profileBackground",
  ]);

  for (const slot of [...Object.values(BOWLER_SLOTS), ...Object.values(GLOBAL_SLOTS)]) {
    assert.ok(cosmetics.REWARD_TYPES.includes(slot.type), `${slot.type} should be a catalogued reward type`);
  }
});

test("unavailable storage still yields a usable session loadout", () => {
  const blocked = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  const store = createLoadoutStore({ storage: blocked });

  assert.equal(store.getEquippedSkinId("reina-sato"), animation.DEFAULT_SKIN_ID);
  assert.equal(store.equipSkin("reina-sato", "maid"), "maid");
  assert.equal(store.getEquippedSkinId("reina-sato"), "maid");
});

// --------------------------------------------------------------- player rooms

test("a new device starts in the starter room and owns no other", () => {
  const store = storeWith();

  assert.equal(store.getRoomSlug(), roomCore.DEFAULT_ROOM_SLUG);
  assert.equal(store.getGlobalSlot("room"), cosmetics.buildItemId("room", roomCore.DEFAULT_ROOM_SLUG));
  assert.deepEqual(store.listOwned("room").map((item) => item.id), [
    cosmetics.buildItemId("room", roomCore.DEFAULT_ROOM_SLUG),
  ]);
});

test("a locked room cannot be equipped, and the attempt leaves the starter room in place", () => {
  const store = storeWith();
  assert.equal(store.setRoomSlug("champion-room"), roomCore.DEFAULT_ROOM_SLUG);
  assert.equal(store.getRoomSlug(), roomCore.DEFAULT_ROOM_SLUG);
});

test("a granted room equips and persists, which is the whole point of the ledger", () => {
  const storage = memoryStorage();
  const first = createLoadoutStore({ storage });

  assert.equal(first.grant(cosmetics.buildItemId("room", "teal-lounge")), true);
  assert.equal(first.setRoomSlug("teal-lounge"), "teal-lounge");

  const second = createLoadoutStore({ storage });
  assert.equal(second.getRoomSlug(), "teal-lounge");
  assert.equal(second.owns(cosmetics.buildItemId("room", "champion-room")), false);
});

test("a room the player stops owning falls back rather than leaving them nowhere", () => {
  const store = storeWith({
    [LOADOUT_STORAGE_KEY]: JSON.stringify({
      version: SCHEMA_VERSION,
      bowlers: {},
      global: { room: cosmetics.buildItemId("room", "champion-room") },
      featured: { bowlerSlug: null, skinId: "canon" },
      granted: [],
    }),
  });
  assert.equal(store.getRoomSlug(), roomCore.DEFAULT_ROOM_SLUG);
});

test("an unknown room slug normalizes back to the starter room", () => {
  const store = storeWith();
  assert.equal(store.setRoomSlug("not-a-room"), roomCore.DEFAULT_ROOM_SLUG);
});

test("the dev entitlement opens every room for authoring without granting one", () => {
  const storage = memoryStorage();
  const store = createLoadoutStore({ storage });
  store.setDevEntitlement(true);

  assert.equal(store.listOwned("room").length, roomCore.ROOMS.length);
  assert.equal(store.setRoomSlug("champion-room"), "champion-room");

  // The ledger stays clean: a local experiment must never become a balance the
  // server has to reconcile.
  const stored = JSON.parse(storage.getItem(LOADOUT_STORAGE_KEY));
  assert.deepEqual(stored.granted, []);
});

test("a server snapshot becomes the only ownership source for an authenticated loadout", () => {
  const storage = memoryStorage();
  const campaign = campaignUnlocks([...campaignCore.STARTER_BOWLER_SLUGS, "hazel-ward", "roxy-chen"]);
  const store = createLoadoutStore({ storage, campaign });

  store.grant("room:champion-room");
  store.applyServerEntitlements([
    { entitlementId: "bowler:hazel-ward" },
    { entitlementId: "room:teal-lounge" },
  ]);
  store.applyServerGarage({
    version: SCHEMA_VERSION,
    bowlers: { "hazel-ward": { skin: "skin:hazel-ward:maid" } },
    global: { room: "room:teal-lounge" },
    featured: { bowlerSlug: "hazel-ward", skinId: "maid" },
  });

  assert.equal(store.isServerAuthoritative(), true);
  assert.equal(store.owns("room:teal-lounge"), true);
  assert.equal(store.owns("room:champion-room"), false, "a local grant must not survive authenticated sync");
  assert.equal(store.owns("menu-splash:hazel-ward"), true);
  assert.equal(store.owns("menu-splash:roxy-chen"), false, "cached campaign state must not create ownership");
  assert.deepEqual(store.listOwnedBowlerSlugs(), [...campaignCore.STARTER_BOWLER_SLUGS, "hazel-ward"]);
  assert.deepEqual(store.getFeatured(), { bowlerSlug: "hazel-ward", skinId: "maid" });
  assert.equal(store.getRoomSlug(), "teal-lounge");
  assert.equal(Object.hasOwn(store.exportGarage(), "granted"), false);
});

test("server entitlement revocation removes the choice and falls back safely", () => {
  const store = createLoadoutStore({ storage: memoryStorage(), campaign: campaignUnlocks() });
  store.applyServerEntitlements([{ entitlementId: "room:teal-lounge" }]);
  store.applyServerGarage({
    version: SCHEMA_VERSION,
    bowlers: {},
    global: { room: "room:teal-lounge" },
    featured: { bowlerSlug: "daisy-monroe", skinId: "canon" },
  });
  assert.equal(store.getRoomSlug(), "teal-lounge");

  store.applyServerEntitlements([]);

  assert.equal(store.owns("room:teal-lounge"), false);
  assert.equal(store.getRoomSlug(), roomCore.DEFAULT_ROOM_SLUG);
  assert.deepEqual(store.listOwned("room").map((item) => item.id), ["room:default"]);
});
