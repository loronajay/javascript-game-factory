const {
  AVAILABLE_SKINS,
  CANON_BOWLERS,
  DEFAULT_SKIN_ID,
  THROW_FRAME_COUNT,
  getEquippedSkinId,
  getFrameAssetPath,
  getFrameAtElapsed,
  getFrameDuration,
  getPortraitAssetPath,
  getResultPortraitAssetPath,
  saveEquippedSkinId,
} = require("./animation-core.js");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

describe("canon bowler manifest", () => {
  const EXPECTED_ROSTER = [
    ["Daisy Monroe", "daisy-monroe"],
    ["Nia Brooks", "nia-brooks"],
    ["Tessa Quinn", "tessa-quinn"],
    ["Zuri Banks", "zuri-banks"],
    ["Amara Reed", "amara-reed"],
    ["Claire Rowan", "claire-rowan"],
    ["Lumi Vega", "lumi-vega"],
    ["Cassy Cruz", "cassy-cruz"],
    ["Fiona Vale", "fiona-vale"],
    ["Nyx Calder", "nyx-calder"],
    ["Skye Bennett", "skye-bennett"],
    ["Carmen Blaze", "carmen-blaze"],
    ["Piper Hart", "piper-hart"],
    ["Reina Sato", "reina-sato"],
    ["Imani Cole", "imani-cole"],
    ["Sabrina Wilde", "sabrina-wilde"],
    ["Aaliyah Storm", "aaliyah-storm"],
    ["Mina Park", "mina-park"],
    ["Scarlett Voss", "scarlett-voss"],
    ["Sage Holloway", "sage-holloway"],
    ["Hazel Ward", "hazel-ward"],
    ["Roxy Chen", "roxy-chen"],
    ["Naomi Okafor", "naomi-okafor"],
    ["Echo Sterling", "echo-sterling"],
    ["Kevya Desai", "kevya-desai"],
    ["Lillie Chen", "lillie-chen"],
    ["Marisol Cruz", "marisol-cruz"],
    ["Rei Nakamura", "rei-nakamura"],
    ["Simone Carter", "simone-carter"],
    ["Talia Dodson", "talia-dodson"],
  ];

  test("includes the complete named canon roster in stable order", () => {
    assert.equal(CANON_BOWLERS.length, 30);
    assert.deepEqual(CANON_BOWLERS.map(({ name, slug }) => [name, slug]), EXPECTED_ROSTER);
  });

  test("uses unique firstname-lastname PNG slugs while retaining provenance", () => {
    assert.equal(new Set(CANON_BOWLERS.map(({ slug }) => slug)).size, 30);
    assert.equal(CANON_BOWLERS.every(({ file, slug }) => file === `${slug}.png`), true);
    assert.equal(
      CANON_BOWLERS.every(({ legacyId }) => legacyId === null || /^[a-f0-9-]{36}$/.test(legacyId)),
      true,
    );

    const sourceRoot = path.join(__dirname, "assets/characters/usable/canon");
    assert.equal(CANON_BOWLERS.every(({ file }) => fs.existsSync(path.join(sourceRoot, file))), true);
    assert.deepEqual(
      fs.readdirSync(sourceRoot).sort(),
      CANON_BOWLERS.map(({ file }) => file).sort(),
    );
  });
});

describe("throw playback", () => {
  test("uses only the five throw poses after the portrait frame", () => {
    assert.equal(THROW_FRAME_COUNT, 5);
    assert.equal(getFrameAtElapsed(0, 200), 1);
    assert.equal(getFrameAtElapsed(199, 200), 1);
    assert.equal(getFrameAtElapsed(200, 200), 2);
    assert.equal(getFrameAtElapsed(999, 200), 5);
    assert.equal(getFrameAtElapsed(1000, 200), 1);
  });

  test("maps every throw pose to its own cleaned transparent asset", () => {
    assert.equal(getFrameAssetPath(CANON_BOWLERS[0], 1),
      "assets/characters/processed/canon/daisy-monroe/throw-01.png",
    );

    const framePaths = CANON_BOWLERS.flatMap((bowler) =>
      Array.from({ length: THROW_FRAME_COUNT }, (_, index) =>
        getFrameAssetPath(bowler, index + 1),
      ),
    );

    assert.equal(framePaths.length, 150);
    assert.equal(framePaths.every((framePath) => fs.existsSync(path.join(__dirname, framePath))), true);
  });

  test("maps every bowler to a dedicated front-facing portrait", () => {
    assert.equal(
      getPortraitAssetPath(CANON_BOWLERS[0]),
      "assets/characters/portraits/canon/daisy-monroe.png",
    );
    assert.equal(
      CANON_BOWLERS.every((bowler) => fs.existsSync(path.join(__dirname, getPortraitAssetPath(bowler)))),
      true,
    );
  });

  test("maps every bowler to dedicated victory and defeat portraits", () => {
    assert.equal(
      getResultPortraitAssetPath(CANON_BOWLERS[0], "victory"),
      "assets/characters/portraits/victory/daisy-monroe.png",
    );
    assert.equal(
      getResultPortraitAssetPath(CANON_BOWLERS[0], "defeat"),
      "assets/characters/portraits/defeat/daisy-monroe.png",
    );

    for (const outcome of ["victory", "defeat"]) {
      for (const bowler of CANON_BOWLERS) {
        const resultPath = getResultPortraitAssetPath(bowler, outcome);
        assert.equal(fs.existsSync(path.join(__dirname, resultPath)), true);
        assert.equal(resultPath, `assets/characters/portraits/${outcome}/${bowler.slug}.png`);
      }
    }
  });

  test("has no stale or misnamed processed character directories", () => {
    const processedRoot = path.join(__dirname, "assets/characters/processed/canon");
    const processedSlugs = fs
      .readdirSync(processedRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(processedSlugs, CANON_BOWLERS.map(({ slug }) => slug).sort());
  });

  test("turns playback speed into a consistent frame duration", () => {
    assert.equal(getFrameDuration(0.5), 400);
    assert.equal(getFrameDuration(1), 200);
    assert.equal(getFrameDuration(2), 100);
  });

  test("rejects invalid playback inputs", () => {
    assert.throws(() => getFrameAtElapsed(0, 0));
    assert.throws(() => getFrameAssetPath(CANON_BOWLERS[0], 0));
    assert.throws(() => getFrameDuration(-1));
    assert.throws(() => getResultPortraitAssetPath(CANON_BOWLERS[0], "draw"));
  });
});

describe("character skins", () => {
  function memoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
    };
  }

  test("publishes stable classic and swimsuit skin ids", () => {
    assert.equal(DEFAULT_SKIN_ID, "canon");
    assert.deepEqual(
      AVAILABLE_SKINS.map(({ id, name }) => [id, name]),
      [["canon", "Classic"], ["swimsuit", "Swimsuit"]],
    );
  });

  test("resolves throw and portrait artwork from the equipped skin", () => {
    const bowler = CANON_BOWLERS[0];
    assert.equal(
      getFrameAssetPath(bowler, 2, "swimsuit"),
      "assets/characters/skins/daisy-monroe/swimsuit/throw-02.png",
    );
    assert.equal(
      getPortraitAssetPath(bowler, "swimsuit"),
      "assets/characters/skins/daisy-monroe/swimsuit/portrait.png",
    );
    assert.equal(
      getResultPortraitAssetPath(bowler, "victory", "swimsuit"),
      "assets/characters/skins/daisy-monroe/swimsuit/portrait.png",
    );
  });

  test("persists one equipped skin per bowler and rejects unknown skin ids", () => {
    const storage = memoryStorage();
    const bowler = CANON_BOWLERS[0];

    assert.equal(getEquippedSkinId(bowler, storage), "canon");
    assert.equal(saveEquippedSkinId(bowler, "swimsuit", storage), "swimsuit");
    assert.equal(getEquippedSkinId(bowler, storage), "swimsuit");
    assert.equal(saveEquippedSkinId(bowler, "future-invalid-skin", storage), "canon");
    assert.equal(getEquippedSkinId(bowler, storage), "canon");
  });
});
