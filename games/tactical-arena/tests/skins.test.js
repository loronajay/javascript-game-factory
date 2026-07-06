import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import { getBoardSprite } from "../src/ui/boardSprites.js";
import { getPortrait } from "../src/ui/portraits.js";
import { SKIN_MANIFEST } from "../src/ui/skinManifest.generated.js";
import {
  SKIN_COLLECTIONS,
  SKINS_BY_UNIT,
  SUMMER_VIBES_SKIN_SLUG,
  getSkin,
  getUnitSkins,
  normalizeSkinLoadout,
  normalizeSkinSlug,
  skinAssetPath
} from "../src/ui/skinModel.js";

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function expectedSkinEntriesFromDisk() {
  const skinRoot = join(GAME_ROOT, "assets", "units", "skins");
  return Object.keys(UNIT_TYPES).flatMap((type) => {
    const unitDir = join(skinRoot, type);
    return readdirSync(unitDir)
      .filter((file) => file.toLowerCase().endsWith(".png"))
      .map((file) => {
        const basename = file.replace(/\.png$/i, "");
        const suffix = `-${type}`;
        const slug = basename.endsWith(suffix) ? basename.slice(0, -suffix.length) : basename;
        return { type, slug, file };
      });
  }).sort((left, right) =>
    left.type.localeCompare(right.type) ||
    left.slug.localeCompare(right.slug) ||
    left.file.localeCompare(right.file));
}

test("summer-vibes is the first authored skin collection slug", () => {
  assert.equal(SKIN_COLLECTIONS[0].slug, SUMMER_VIBES_SKIN_SLUG);
  assert.equal(SUMMER_VIBES_SKIN_SLUG, "summer-vibes");
});

test("every registered unit has an unlocked summer-vibes skin asset", () => {
  for (const type of Object.keys(UNIT_TYPES)) {
    const skins = getUnitSkins(type);
    assert.equal(skins[0]?.slug, SUMMER_VIBES_SKIN_SLUG, `${type} first skin should be summer-vibes`);
    assert.equal(skins[0]?.unlocked, true, `${type} summer-vibes should be unlocked`);
    assert.equal(skinAssetPath(type, SUMMER_VIBES_SKIN_SLUG), `assets/units/skins/${type}/summer-vibes-${type}.png`);
    assert.ok(
      existsSync(join(GAME_ROOT, skinAssetPath(type, SUMMER_VIBES_SKIN_SLUG))),
      `${type} summer-vibes asset is missing`
    );
  }
});

test("generated skin manifest matches every png dropped in unit skin folders", () => {
  assert.deepEqual(
    [...SKIN_MANIFEST].sort((left, right) =>
      left.type.localeCompare(right.type) ||
      left.slug.localeCompare(right.slug) ||
      left.file.localeCompare(right.file)),
    expectedSkinEntriesFromDisk()
  );
});

test("newly dropped skin files become selectable by inferred slug", () => {
  assert.equal(getSkin("swordsman", "medieval")?.portraitSrc, "assets/units/skins/swordsman/medieval-swordsman.png");
  assert.equal(getSkin("sniper", "medieval")?.portraitSrc, "assets/units/skins/sniper/medieval-sniper.png");
  assert.equal(getSkin("nemesis", "infernal")?.portraitSrc, "assets/units/skins/nemesis/infernal-nemesis.png");
});

test("unknown or locked skin slugs normalize to classic", () => {
  assert.equal(normalizeSkinSlug("swordsman", "summer-vibes"), "summer-vibes");
  assert.equal(normalizeSkinSlug("swordsman", "not-real"), null);
  assert.equal(normalizeSkinSlug("dragon", "summer-vibes"), null);
  assert.equal(getSkin("swordsman", null), null);
});

test("skin loadouts normalize against the unit in the same squad slot", () => {
  const composition = ["swordsman", "archer", "mystic", "magician"];
  assert.deepEqual(
    normalizeSkinLoadout(composition, ["summer-vibes", "missing", null, "summer-vibes"]),
    ["summer-vibes", null, null, "summer-vibes"]
  );
});

test("skin registry does not invent entries for unknown units", () => {
  assert.equal(SKINS_BY_UNIT.dragon, undefined);
  assert.deepEqual(getUnitSkins("dragon"), []);
});

test("portrait and board sprite metadata swap to a skin asset by slug", () => {
  assert.equal(getPortrait("swordsman", "summer-vibes").src, "assets/units/skins/swordsman/summer-vibes-swordsman.png");
  assert.equal(getBoardSprite("swordsman", "summer-vibes").src, "assets/units/skins/swordsman/summer-vibes-swordsman.png");
  assert.equal(getPortrait("swordsman", "missing").src, "assets/units/swordsman.png");
});

test("match state carries normalized skin selections for roster units", () => {
  const state = createMatchState({
    seed: 1,
    squads: { 1: ["swordsman", "archer", "mystic", "magician"], 2: ["swordsman", "archer", "mystic", "magician"] },
    skins: { 1: ["summer-vibes", null, "missing", "summer-vibes"], 2: [null, "summer-vibes", null, null] }
  });
  assert.deepEqual(
    state.units.filter((unit) => unit.player === 1).map((unit) => [unit.type, unit.skin]),
    [["swordsman", "summer-vibes"], ["archer", null], ["mystic", null], ["magician", "summer-vibes"]]
  );
  assert.deepEqual(
    state.units.filter((unit) => unit.player === 2).map((unit) => [unit.type, unit.skin]),
    [["swordsman", null], ["archer", "summer-vibes"], ["mystic", null], ["magician", null]]
  );
});
