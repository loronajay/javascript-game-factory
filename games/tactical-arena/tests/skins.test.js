import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { writeUnlockProgress } from "../src/progression/unlocks.js";
import { getBoardSprite } from "../src/ui/boardSprites.js";
import { getPortrait } from "../src/ui/portraits.js";
import { SKIN_MANIFEST } from "../src/ui/skinManifest.generated.js";
import {
  SKIN_COLLECTIONS,
  SKINS_BY_UNIT,
  SKIN_PREF_STORAGE_KEY,
  SUMMER_VIBES_SKIN_SLUG,
  getSkinPref,
  getSkin,
  getUnitSkins,
  loadSkinPrefs,
  normalizeAuthoredSkinSlug,
  normalizeSkinLoadout,
  normalizeSkinSlug,
  saveSkinPref,
  skinAssetPath
} from "../src/ui/skinModel.js";

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

class FakeLocalStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function storageWithUnlockedSkin(type, slug, extra = {}) {
  const storage = new FakeLocalStorage(extra);
  writeUnlockProgress(storage, { purchasedSkins: [{ type, slug }] });
  return storage;
}

function expectedSkinEntriesFromDisk() {
  const skinRoot = join(GAME_ROOT, "assets", "units", "skins");
  return Object.keys(UNIT_TYPES).flatMap((type) => {
    const unitDir = join(skinRoot, type);
    const entriesByKey = new Map();
    for (const entry of readdirSync(unitDir)
      .filter((file) => /\.(png|webp)$/i.test(file))
      .map((file) => {
        const basename = file.replace(/\.(png|webp)$/i, "");
        const suffix = `-${type}`;
        const slug = basename.endsWith(suffix) ? basename.slice(0, -suffix.length) : basename;
        return { type, slug, file };
      })) {
      const key = `${type}:${entry.slug}`;
      const existing = entriesByKey.get(key);
      if (!existing || skinAssetSort(entry, existing) < 0) entriesByKey.set(key, entry);
    }
    return [...entriesByKey.values()];
  }).sort((left, right) =>
    left.type.localeCompare(right.type) ||
    left.slug.localeCompare(right.slug) ||
    skinAssetSort(left, right));
}

function skinAssetSort(left, right) {
  const extensionPriority = { ".webp": 0, ".png": 1 };
  const leftExtension = left.file.slice(left.file.lastIndexOf(".")).toLowerCase();
  const rightExtension = right.file.slice(right.file.lastIndexOf(".")).toLowerCase();
  return (extensionPriority[leftExtension] ?? 99) - (extensionPriority[rightExtension] ?? 99) ||
    left.file.localeCompare(right.file);
}

function expectedSkinAssetPath(type, slug) {
  const basename = `${slug}-${type}`;
  for (const extension of ["webp", "png"]) {
    const path = `assets/units/skins/${type}/${basename}.${extension}`;
    if (existsSync(join(GAME_ROOT, path))) return path;
  }
  return `assets/units/skins/${type}/${basename}.webp`;
}

test("summer-vibes is the first authored skin collection slug", () => {
  assert.equal(SKIN_COLLECTIONS[0].slug, SUMMER_VIBES_SKIN_SLUG);
  assert.equal(SUMMER_VIBES_SKIN_SLUG, "summer-vibes");
});

test("every registered unit's skins are locked by default with real assets on disk", () => {
  for (const type of Object.keys(UNIT_TYPES)) {
    const skins = getUnitSkins(type);
    if (!skins.length) continue;
    // The first skin is locked until the skin-choice UI ships, and every declared skin
    // points at a real asset.
    assert.equal(skins[0].unlocked, false, `${type} first skin should be locked until the skin-choice UI ships`);
    for (const entry of skins) {
      assert.ok(existsSync(join(GAME_ROOT, entry.portraitSrc)), `${type} skin asset is missing: ${entry.portraitSrc}`);
    }
    // Launch-roster units lead with the summer-vibes collection; a unit that ships a
    // bespoke themed set instead (e.g. Blacksword) simply has no summer-vibes entry.
    if (skins.some((entry) => entry.slug === SUMMER_VIBES_SKIN_SLUG)) {
      assert.equal(skins[0].slug, SUMMER_VIBES_SKIN_SLUG, `${type} should lead with summer-vibes`);
      assert.equal(skinAssetPath(type, SUMMER_VIBES_SKIN_SLUG), expectedSkinAssetPath(type, SUMMER_VIBES_SKIN_SLUG));
    }
  }
});

test("generated skin manifest matches every image dropped in unit skin folders", () => {
  assert.deepEqual(
    [...SKIN_MANIFEST].sort((left, right) =>
      left.type.localeCompare(right.type) ||
      left.slug.localeCompare(right.slug) ||
      left.file.localeCompare(right.file)),
    expectedSkinEntriesFromDisk()
  );
});

test("newly dropped skin files become selectable by inferred slug", () => {
  assert.equal(getSkin("swordsman", "medieval")?.portraitSrc, expectedSkinAssetPath("swordsman", "medieval"));
  assert.equal(getSkin("sniper", "medieval")?.portraitSrc, expectedSkinAssetPath("sniper", "medieval"));
  assert.equal(getSkin("nemesis", "infernal")?.portraitSrc, expectedSkinAssetPath("nemesis", "infernal"));
});

test("skin entries carry marketplace-ready premium metadata", () => {
  const skin = getSkin("swordsman", "medieval");
  const common = getSkin("swordsman", "summer-vibes");
  const epic = getSkin("swordsman", "blood-moon");
  const legendary = getSkin("paladin", "crusader");
  const legendaryPlus = getSkin("blacksword", "apprentice");
  const charity = getSkin("juggernaut", "fuck-cancer");

  assert.equal(skin.id, "skin:swordsman:medieval");
  assert.equal(skin.unitType, "swordsman");
  assert.equal(skin.sku, "ta.skin.swordsman.medieval");
  assert.equal(skin.price.kind, "premium");
  assert.equal(skin.price.currency, "USD");
  assert.equal(skin.rarity, "rare");
  assert.equal(skin.price.cents, 199);
  assert.equal(common.rarity, "common");
  assert.equal(common.price.cents, 99);
  assert.equal(epic.rarity, "epic");
  assert.equal(epic.price.cents, 299);
  assert.equal(legendary.rarity, "legendary");
  assert.equal(legendary.price.cents, 399);
  assert.equal(legendaryPlus.rarity, "legendary+");
  assert.equal(legendaryPlus.price.cents, 499);
  assert.equal(charity.donationNote, "All proceeds for this skin will be donated for cancer research.");
});

test("every Fuck Cancer skin is legendary charity-pack metadata", () => {
  const entries = SKIN_MANIFEST.filter((entry) => entry.slug === "fuck-cancer");

  assert.equal(entries.length, Object.keys(UNIT_TYPES).length);
  for (const entry of entries) {
    const skin = getSkin(entry.type, entry.slug);
    assert.equal(skin.rarity, "legendary", `${entry.type} Fuck Cancer rarity`);
    assert.equal(skin.price.cents, 399, `${entry.type} Fuck Cancer price`);
    if (entry.type === "ghoul") {
      assert.equal(skin.packId, null);
      assert.equal(skin.packName, null);
      assert.equal(skin.donationNote, null);
    } else {
      assert.equal(skin.packId, "fuck-cancer");
      assert.equal(skin.packName, "Fuck Cancer Charity Pack");
      assert.equal(skin.donationNote, "All proceeds for this skin will be donated for cancer research.");
    }
  }
});

test("new fat squad collection skins use authored rarity and pack metadata", () => {
  const fatSquad = ["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"];

  for (const type of fatSquad) {
    const bloodMoon = getSkin(type, "blood-moon");
    assert.equal(bloodMoon.rarity, "epic", `${type} Blood Moon rarity`);
    assert.equal(bloodMoon.price.cents, 299, `${type} Blood Moon price`);
    assert.equal(bloodMoon.packId, "blood-moon", `${type} Blood Moon pack id`);
    assert.equal(bloodMoon.packName, "Blood Moon Pack", `${type} Blood Moon pack name`);

    const southernKingdom = getSkin(type, "southern-kingdom");
    assert.equal(southernKingdom.rarity, "epic", `${type} Southern Kingdom rarity`);
    assert.equal(southernKingdom.price.cents, 299, `${type} Southern Kingdom price`);
    assert.equal(southernKingdom.packId, "southern-kingdom", `${type} Southern Kingdom pack id`);
    assert.equal(southernKingdom.packName, "Southern Kingdom Pack", `${type} Southern Kingdom pack name`);

    const gothicWarrior = getSkin(type, "gothic-warrior");
    assert.equal(gothicWarrior.rarity, "epic", `${type} Gothic Warrior rarity`);
    assert.equal(gothicWarrior.price.cents, 299, `${type} Gothic Warrior price`);
    assert.equal(gothicWarrior.packId, null, `${type} Gothic Warrior should stay a single skin`);

    const tattered = getSkin(type, "tattered");
    assert.equal(tattered.rarity, "common", `${type} Tattered rarity`);
    assert.equal(tattered.price.cents, 99, `${type} Tattered price`);
    assert.equal(tattered.packId, null, `${type} Tattered should stay a single skin`);

    const wandering = getSkin(type, "wandering");
    assert.equal(wandering.rarity, "common", `${type} Wandering rarity`);
    assert.equal(wandering.price.cents, 99, `${type} Wandering price`);
    assert.equal(wandering.packId, null, `${type} Wandering should stay outside paid skin packs`);
  }
});

test("all Southern Kingdom skins are epic pack skins", () => {
  const entries = SKIN_MANIFEST.filter((entry) => entry.slug === "southern-kingdom");

  assert.equal(entries.length, 12);
  for (const entry of entries) {
    const skin = getSkin(entry.type, entry.slug);
    assert.equal(skin.rarity, "epic", `${entry.type} Southern Kingdom rarity`);
    assert.equal(skin.price.cents, 299, `${entry.type} Southern Kingdom price`);
    assert.equal(skin.packId, "southern-kingdom", `${entry.type} Southern Kingdom pack id`);
    assert.equal(skin.packName, "Southern Kingdom Pack", `${entry.type} Southern Kingdom pack name`);
  }
});

test("unknown or locked skin slugs normalize to classic (every skin is currently locked)", () => {
  assert.equal(normalizeSkinSlug("swordsman", "summer-vibes"), null);
  assert.equal(normalizeSkinSlug("swordsman", "not-real"), null);
  assert.equal(normalizeSkinSlug("dragon", "summer-vibes"), null);
  assert.equal(getSkin("swordsman", null), null);
});

test("authored skin slugs can normalize without requiring local ownership", () => {
  assert.equal(normalizeAuthoredSkinSlug("monk", "summer-vibes"), "summer-vibes");
  assert.equal(normalizeAuthoredSkinSlug("monk", "not-real"), null);
  assert.equal(normalizeAuthoredSkinSlug("dragon", "summer-vibes"), null);
});

test("skin loadouts normalize against the unit in the same squad slot", () => {
  const composition = ["swordsman", "archer", "mystic", "magician"];
  assert.deepEqual(
    normalizeSkinLoadout(composition, ["summer-vibes", "missing", null, "summer-vibes"]),
    [null, null, null, null]
  );
});

test("skin preferences persist per unit type and only keep unlocked skins", () => {
  const storage = storageWithUnlockedSkin("archer", "desert-warrior");
  saveSkinPref("archer", "desert-warrior", storage);
  saveSkinPref("swordsman", "summer-vibes", storage);

  assert.equal(getSkinPref("archer", storage), "desert-warrior");
  assert.equal(getSkinPref("swordsman", storage), null);
  assert.deepEqual(loadSkinPrefs(storage), { archer: "desert-warrior" });
});

test("skin preferences fill default loadouts without overriding explicit classic", () => {
  const storage = storageWithUnlockedSkin("archer", "desert-warrior", {
    [SKIN_PREF_STORAGE_KEY]: JSON.stringify({ archer: "desert-warrior" }),
  });
  const composition = ["swordsman", "archer", "mystic", "magician"];

  assert.deepEqual(normalizeSkinLoadout(composition, null, storage), [null, "desert-warrior", null, null]);
  assert.deepEqual(normalizeSkinLoadout(composition, [null, null, null, null], storage), [null, null, null, null]);
});

test("skin registry does not invent entries for unknown units", () => {
  assert.equal(SKINS_BY_UNIT.dragon, undefined);
  assert.deepEqual(getUnitSkins("dragon"), []);
});

test("portrait and board sprite metadata swap to a skin asset by slug", () => {
  assert.equal(getPortrait("swordsman", "summer-vibes").src, expectedSkinAssetPath("swordsman", "summer-vibes"));
  assert.equal(getBoardSprite("swordsman", "summer-vibes").src, expectedSkinAssetPath("swordsman", "summer-vibes"));
  assert.equal(getPortrait("swordsman", "missing").src, "assets/units/swordsman.webp");
});

test("skinned board sprites inherit base framing metadata", () => {
  const base = getBoardSprite("ghoul");
  const summer = getBoardSprite("ghoul", "summer-vibes");
  assert.equal(summer.src, expectedSkinAssetPath("ghoul", "summer-vibes"));
  assert.equal(summer.scale, base.scale);
  assert.deepEqual(summer.box, base.box);
});

test("match state normalizes every skin selection to classic while skins are locked", () => {
  const state = createMatchState({
    seed: 1,
    squads: { 1: ["swordsman", "archer", "mystic", "magician"], 2: ["swordsman", "archer", "mystic", "magician"] },
    skins: { 1: ["summer-vibes", null, "missing", "summer-vibes"], 2: [null, "summer-vibes", null, null] }
  });
  assert.deepEqual(
    state.units.filter((unit) => unit.player === 1).map((unit) => [unit.type, unit.skin]),
    [["swordsman", null], ["archer", null], ["mystic", null], ["magician", null]]
  );
  assert.deepEqual(
    state.units.filter((unit) => unit.player === 2).map((unit) => [unit.type, unit.skin]),
    [["swordsman", null], ["archer", null], ["mystic", null], ["magician", null]]
  );
});

test("match state accepts authored skins for trusted online seats without local entitlements", () => {
  const previousStorage = globalThis.localStorage;
  const storage = new FakeLocalStorage();
  writeUnlockProgress(storage, {
    serverEntitlementSkins: [{ type: "swordsman", slug: "medieval" }],
  });
  globalThis.localStorage = storage;

  try {
    const state = createMatchState({
      seed: 1,
      squads: { 1: ["swordsman", "archer", "mystic", "magician"], 2: ["monk", "archer", "mystic", "magician"] },
      skins: { 1: ["medieval", "summer-vibes", null, null], 2: ["summer-vibes", null, null, null] },
      trustedSkinSeats: [1, 2],
    });

    assert.deepEqual(
      state.units.filter((unit) => unit.player === 1).map((unit) => [unit.type, unit.skin]),
      [["swordsman", "medieval"], ["archer", "summer-vibes"], ["mystic", null], ["magician", null]]
    );
    assert.deepEqual(
      state.units.filter((unit) => unit.player === 2).map((unit) => [unit.type, unit.skin]),
      [["monk", "summer-vibes"], ["archer", null], ["mystic", null], ["magician", null]]
    );
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
