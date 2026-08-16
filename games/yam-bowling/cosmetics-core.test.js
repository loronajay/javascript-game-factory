const { test } = require("node:test");
const assert = require("node:assert/strict");

const animation = require("./animation-core.js");
const menuSplash = require("./menu-splash-core.js");
const cosmetics = require("./cosmetics-core.js");

const {
  CATALOG,
  REWARD_TYPES,
  PRESENTATION_TIERS,
  UNLOCK_SOURCES,
  buildItemId,
  getItem,
  isOwnedByDefault,
  listByType,
  listForCharacter,
} = cosmetics;

test("every reward type named by the metagame scope has a stable catalog identity", () => {
  assert.deepEqual([...REWARD_TYPES], [
    "skin",
    "victory-pose",
    "defeat-pose",
    "player-card",
    "menu-splash",
    "profile-art",
    "ball-trail",
    "strike-burst",
    "title",
    "badge",
  ]);

  for (const type of REWARD_TYPES) {
    assert.ok(listByType(type).length > 0, `${type} should have at least one catalog item`);
  }
});

test("catalog items declare the full contract and use unique ids", () => {
  const seen = new Set();

  for (const item of CATALOG) {
    assert.match(item.id, /^[a-z-]+:[a-z0-9:-]+$/, `${item.id} should be a kebab-case namespaced id`);
    assert.ok(!seen.has(item.id), `${item.id} is duplicated`);
    seen.add(item.id);

    assert.ok(typeof item.name === "string" && item.name.trim(), `${item.id} needs a display name`);
    assert.ok(REWARD_TYPES.includes(item.type), `${item.id} has an unknown reward type`);
    assert.ok(["global", "character"].includes(item.scope), `${item.id} has an unknown scope`);
    assert.equal(
      item.scope === "character",
      typeof item.characterSlug === "string",
      `${item.id} scope and characterSlug must agree`,
    );
    assert.ok(item.assets && typeof item.assets === "object", `${item.id} needs an assets record`);
    assert.ok(PRESENTATION_TIERS.includes(item.tier), `${item.id} has an unknown tier`);
    assert.ok(UNLOCK_SOURCES.includes(item.unlock.source), `${item.id} has an unknown unlock source`);
    assert.ok(Object.isFrozen(item), `${item.id} should be frozen`);
  }
});

test("character-scoped items only reference canon bowlers", () => {
  const canonSlugs = new Set(animation.CANON_BOWLERS.map((bowler) => bowler.slug));

  for (const item of CATALOG) {
    if (item.scope !== "character") continue;
    assert.ok(canonSlugs.has(item.characterSlug), `${item.id} references a bowler outside the canon roster`);
  }
});

test("existing skins, poses, and menu splashes are migration inputs rather than hard-coded exceptions", () => {
  for (const bowler of animation.CANON_BOWLERS) {
    for (const skin of animation.AVAILABLE_SKINS) {
      const skinItem = getItem(buildItemId("skin", bowler.slug, skin.id));
      assert.ok(skinItem, `${bowler.slug}/${skin.id} should be catalogued`);
      assert.equal(skinItem.name, skin.name);
      assert.equal(skinItem.assets.portrait, animation.getPortraitAssetPath(bowler, skin.id));

      const victory = getItem(buildItemId("victory-pose", bowler.slug, skin.id));
      const defeat = getItem(buildItemId("defeat-pose", bowler.slug, skin.id));
      assert.equal(victory.assets.art, animation.getResultPortraitAssetPath(bowler, "victory", skin.id));
      assert.equal(defeat.assets.art, animation.getResultPortraitAssetPath(bowler, "defeat", skin.id));
    }

    assert.ok(getItem(buildItemId("player-card", bowler.slug)), `${bowler.slug} needs a default player card`);
    assert.ok(getItem(buildItemId("profile-art", bowler.slug)), `${bowler.slug} needs default profile art`);
  }

  for (const splash of menuSplash.MENU_SPLASHES) {
    const item = getItem(buildItemId("menu-splash", splash.slug));
    assert.ok(item, `${splash.slug} splash should be catalogued`);
    assert.equal(item.assets.art, splash.src);
    assert.equal(item.assets.thumbnail, splash.thumbnailSrc);
  }
});

test("shipped content is owned by default while future rewards are not", () => {
  const shippedSkin = getItem(buildItemId("skin", "reina-sato", "maid"));
  assert.equal(shippedSkin.unlock.source, "founding");
  assert.ok(isOwnedByDefault(shippedSkin.id));

  const defaultTrail = getItem("ball-trail:none");
  const rewardTrail = getItem("ball-trail:red-neon");
  assert.ok(isOwnedByDefault(defaultTrail.id), "the no-trail default must always be available");
  assert.equal(isOwnedByDefault(rewardTrail.id), false, "progression rewards are not owned before they are earned");
  assert.notEqual(rewardTrail.unlock.source, "founding");
});

test("unknown ids resolve to nothing rather than a fabricated item", () => {
  assert.equal(getItem("skin:not-a-bowler:canon"), null);
  assert.equal(getItem("nonsense"), null);
  assert.equal(getItem(null), null);
  assert.equal(isOwnedByDefault("skin:not-a-bowler:canon"), false);
});

test("lookups narrow by type and by character", () => {
  const reinaSkins = listByType("skin", { characterSlug: "reina-sato" });
  assert.equal(reinaSkins.length, animation.AVAILABLE_SKINS.length);
  assert.ok(reinaSkins.every((item) => item.characterSlug === "reina-sato"));

  const globalTrails = listByType("ball-trail");
  assert.ok(globalTrails.every((item) => item.scope === "global"));

  const forReina = listForCharacter("reina-sato");
  assert.ok(forReina.every((item) => item.characterSlug === "reina-sato"));
  assert.ok(forReina.some((item) => item.type === "player-card"));
  assert.equal(listForCharacter("not-a-bowler").length, 0);
});

test("the catalog exposes no prices or XP claims before server-backed ownership exists", () => {
  for (const item of CATALOG) {
    assert.equal("price" in item, false, `${item.id} must not carry a price`);
    assert.equal("cost" in item, false, `${item.id} must not carry a cost`);
    assert.equal("xp" in item.unlock, false, `${item.id} must not claim an XP amount`);
  }
});
