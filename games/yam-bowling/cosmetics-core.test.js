const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const animation = require("./animation-core.js");
const campaign = require("./campaign-core.js");
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
    "profile-icon",
    "entrance",
    "catch-line",
    "menu-splash",
    // A player room is the eleventh type and the first added after the metagame
    // scope was written: rooms are new content, so unlike everything above them
    // they ship mostly locked rather than all founding.
    "room",
    // The twelfth type. Emotes are the first reward that is global by design
    // rather than by convenience: one shared pool of gestures, because a set
    // per bowler would be thirty times the art for the same thirty reactions.
    "emote",
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
    assert.ok(["live", "planned"].includes(item.availability), `${item.id} has an unknown availability`);
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

test("menu art follows the bowler unlock it represents", () => {
  const starterSlugs = new Set(campaign.STARTER_BOWLER_SLUGS);

  assert.ok(UNLOCK_SOURCES.includes("character-unlock"));
  for (const splash of menuSplash.MENU_SPLASHES) {
    const item = getItem(buildItemId("menu-splash", splash.slug));
    assert.equal(item.characterSlug, splash.slug);
    assert.equal(item.scope, "character");
    assert.equal(
      item.unlock.source,
      starterSlugs.has(splash.slug) ? "founding" : "character-unlock",
      `${splash.slug} should follow its campaign bowler unlock`,
    );
  }
});

test("Canon is the only default-owned skin and its entitlement gates matching outcome poses", () => {
  const canonSkin = getItem(buildItemId("skin", "reina-sato", "canon"));
  assert.equal(canonSkin.unlock.source, "founding");
  assert.ok(isOwnedByDefault(canonSkin.id));

  for (const skinId of ["swimsuit", "maid", "halloween"]) {
    const entitlementId = buildItemId("skin", "reina-sato", skinId);
    for (const type of ["skin", "victory-pose", "defeat-pose"]) {
      const item = getItem(buildItemId(type, "reina-sato", skinId));
      assert.equal(item.unlock.source, "server-entitlement");
      assert.equal(item.entitlementId, entitlementId);
      assert.equal(isOwnedByDefault(item.id), false);
    }
  }

  const defaultTrail = getItem("ball-trail:none");
  const rewardTrail = getItem("ball-trail:red-neon");
  assert.ok(isOwnedByDefault(defaultTrail.id), "the no-trail default must always be available");
  assert.equal(isOwnedByDefault(rewardTrail.id), false, "progression rewards are not owned before they are earned");
  assert.notEqual(rewardTrail.unlock.source, "founding");
});

test("the trail cabinet offers a broad, distinct color collection to unlock", () => {
  const trails = listByType("ball-trail");
  const colorTrails = trails.filter((item) => item.id !== "ball-trail:none");

  assert.equal(trails.length, 23, "No Trail plus twenty-two color rewards should be visible");
  assert.deepEqual(colorTrails.map((item) => item.id), [
    "ball-trail:red-neon",
    "ball-trail:orange-flare",
    "ball-trail:gold-rush",
    "ball-trail:lime-shock",
    "ball-trail:emerald-glow",
    "ball-trail:mint-frost",
    "ball-trail:cyan-pulse",
    "ball-trail:sky-blue",
    "ball-trail:electric-blue",
    "ball-trail:indigo-drive",
    "ball-trail:violet-haze",
    "ball-trail:purple-plasma",
    "ball-trail:magenta-pop",
    "ball-trail:hot-pink",
    "ball-trail:diamond-white",
    "ball-trail:perfect-line",
    "ball-trail:rose-gold",
    "ball-trail:eclipse",
    "ball-trail:championship-gold",
    "ball-trail:bracket-fire",
    "ball-trail:cosmic-ribbon",
    "ball-trail:royal-confetti",
  ]);

  const paletteSignatures = new Set();
  for (const trail of colorTrails) {
    // Effects are split across the two ladders -- some are mastery loot, some
    // are player-level loot -- so what matters here is that every one of them
    // is earned by levelling and none of it starts owned.
    assert.ok(
      ["bowler-level", "player-level", "tournament"].includes(trail.unlock.source),
      `${trail.id} should have an earn route`,
    );
    assert.equal(isOwnedByDefault(trail.id), false, `${trail.id} must begin locked`);
    assert.ok(trail.assets.palette.length >= 2, `${trail.id} needs a gradient palette`);
    for (const color of trail.assets.palette) assert.match(color, /^#[0-9a-f]{6}$/i);
    paletteSignatures.add(trail.assets.palette.join(","));
  }
  assert.equal(paletteSignatures.size, colorTrails.length, "every trail needs its own visible color identity");
});

test("the strike cabinet offers a broad, distinct burst collection to unlock", () => {
  const bursts = listByType("strike-burst");
  const rewardBursts = bursts.filter((item) => item.id !== "strike-burst:classic");

  assert.equal(bursts.length, 22, "Classic plus twenty-one color rewards should be visible");
  assert.deepEqual(rewardBursts.map((item) => item.id), [
    "strike-burst:ember",
    "strike-burst:red-supernova",
    "strike-burst:gold-star",
    "strike-burst:lime-pop",
    "strike-burst:emerald-impact",
    "strike-burst:mint-crackle",
    "strike-burst:cyan-flash",
    "strike-burst:sky-shatter",
    "strike-burst:electric-blue",
    "strike-burst:indigo-ring",
    "strike-burst:violet-bloom",
    "strike-burst:purple-nova",
    "strike-burst:magenta-blast",
    "strike-burst:hot-pink-pop",
    "strike-burst:diamond-spark",
    "strike-burst:rose-gold",
    "strike-burst:eclipse-corona",
    "strike-burst:pin-crown",
    "strike-burst:finals-fireworks",
    "strike-burst:cosmic-cup",
    "strike-burst:victory-ribbon",
  ]);

  const paletteSignatures = new Set();
  for (const burst of rewardBursts) {
    assert.ok(
      ["bowler-level", "player-level", "tournament"].includes(burst.unlock.source),
      `${burst.id} should have an earn route`,
    );
    assert.equal(isOwnedByDefault(burst.id), false, `${burst.id} must begin locked`);
    assert.ok(burst.assets.palette.length >= 2, `${burst.id} needs a gradient palette`);
    for (const color of burst.assets.palette) assert.match(color, /^#[0-9a-f]{6}$/i);
    paletteSignatures.add(burst.assets.palette.join(","));
  }
  assert.equal(paletteSignatures.size, rewardBursts.length, "every burst needs its own visible color identity");
});

test("profile rewards span mastery, achievement, behavior, and tournament prestige", () => {
  const expected = [
    ["title:pin-chaser", "player-level", "rare"],
    ["title:comeback-kid", "achievement", "rare"],
    ["title:yam-champion", "tournament", "legendary"],
    ["title:ice-in-the-tenth", "achievement", "rare"],
    ["title:spare-architect", "achievement", "rare"],
    ["title:bracket-breaker", "tournament", "rare"],
    ["title:undisputed", "tournament", "legendary"],
    // Badges, and earned by achievement rather than by level. Their type is
    // pinned here because it is also their entitlement id: retyping them would
    // orphan every row already granted to a live account.
    ["badge:laser-focus", "achievement", "rare"],
    ["badge:precision-bowler", "achievement", "rare"],
    ["badge:lane-legend", "achievement", "legendary"],
    ["badge:perfect-game", "achievement", "legendary"],
    ["badge:split-decision", "achievement", "rare"],
    ["badge:clean-card", "achievement", "rare"],
    ["badge:turkey-club", "achievement", "rare"],
    ["badge:road-tested", "achievement", "rare"],
    ["badge:deep-bench", "achievement", "legendary"],
  ];

  for (const [id, source, tier] of expected) {
    const item = getItem(id);
    assert.ok(item, `${id} should be in the display cabinet`);
    assert.equal(item.unlock.source, source);
    assert.equal(item.tier, tier);
    assert.match(item.unlock.detail, /\S/);
    assert.match(item.assets.art, /^assets\/profile-rewards\/[a-z-]+\.webp$/);
    assert.equal(fs.existsSync(path.join(__dirname, item.assets.art)), true, `${id} needs shipped crest art`);
    assert.equal(isOwnedByDefault(id), false, `${id} must be earned`);
  }

  assert.ok(UNLOCK_SOURCES.includes("tournament"), "tournament prizes need a first-class unlock source");
  assert.equal(new Set(expected.map(([, source]) => source)).size, 3, "the pilot collection should not be one-note");
});

test("badges certify earned distinctions rather than passive level milestones", () => {
  for (const badge of CATALOG.filter((item) => item.type === "badge")) {
    assert.ok(
      ["founding", "achievement", "tournament"].includes(badge.unlock.source),
      `${badge.id} should represent an earned distinction`,
    );
  }
});

test("catalog-only rewards are explicitly marked as planned", () => {
  assert.deepEqual(
    CATALOG.filter((item) => item.availability === "planned").map((item) => item.id),
    [
      "title:ice-in-the-tenth",
      "title:spare-architect",
      "title:bracket-breaker",
      "title:undisputed",
    ],
  );
  for (const id of ["badge:laser-focus", "badge:precision-bowler", "badge:lane-legend", "badge:road-tested", "badge:deep-bench"]) {
    assert.equal(getItem(id).availability, "live", `${id} has a complete earning route`);
  }
  assert.equal(getItem("badge:clean-card").availability, "live");
  assert.equal(getItem("badge:turkey-club").availability, "live");
});

test("rotating tournaments have an exclusive common effect pool", () => {
  const tournamentEffects = CATALOG
    .filter((item) => ["ball-trail", "strike-burst"].includes(item.type) && item.unlock.source === "tournament")
    .map((item) => item.id);
  assert.deepEqual(tournamentEffects, [
    "ball-trail:championship-gold",
    "ball-trail:bracket-fire",
    "ball-trail:cosmic-ribbon",
    "ball-trail:royal-confetti",
    "strike-burst:pin-crown",
    "strike-burst:finals-fireworks",
    "strike-burst:cosmic-cup",
    "strike-burst:victory-ribbon",
  ]);
  for (const itemId of tournamentEffects) {
    const item = getItem(itemId);
    assert.equal(item.tier, "rare");
    assert.equal(item.assets.palette.length, 2);
  }
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

// The summit of every bowler's ladder. Text-only rewards on purpose: a mastery
// ladder that can only pay out when new art exists is a ladder that stays
// unbound, and these two are what let levels 29 and 30 mean something now.
test("every bowler has a mastery nameplate and an exclusive master title", () => {
  const titles = listByType("title");

  for (const bowler of animation.CANON_BOWLERS) {
    const nameplate = titles.find((item) => item.id === `title:${bowler.slug}:nameplate`);
    const master = titles.find((item) => item.id === `title:${bowler.slug}:master`);

    for (const [item, tier] of [[nameplate, "rare"], [master, "legendary"]]) {
      assert.ok(item, `${bowler.slug} is missing a mastery title`);
      assert.equal(item.type, "title");
      assert.equal(item.characterSlug, bowler.slug, "a mastery title belongs to its bowler");
      assert.equal(item.unlock.source, "bowler-level");
      assert.equal(item.tier, tier);
      assert.equal(isOwnedByDefault(item.id), false, "a mastery title must be earned");
    }
    assert.equal(master.name, `${bowler.name.split(/\s+/)[0]} Master`);
  }

  assert.equal(
    titles.filter((item) => item.characterSlug).length,
    animation.CANON_BOWLERS.length * 2,
  );
});
