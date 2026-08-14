const {
  CANON_BOWLERS,
  THROW_FRAME_COUNT,
  getFrameAssetPath,
  getFrameAtElapsed,
  getFrameDuration,
  getPortraitAssetPath,
  getResultPortraitAssetPath,
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
  ];

  test("includes the complete named canon roster in stable order", () => {
    assert.equal(CANON_BOWLERS.length, 24);
    assert.deepEqual(CANON_BOWLERS.map(({ name, slug }) => [name, slug]), EXPECTED_ROSTER);
  });

  test("uses unique firstname-lastname PNG slugs while retaining provenance", () => {
    assert.equal(new Set(CANON_BOWLERS.map(({ slug }) => slug)).size, 24);
    assert.equal(CANON_BOWLERS.every(({ file, slug }) => file === `${slug}.png`), true);
    assert.equal(CANON_BOWLERS.every(({ legacyId }) => /^[a-f0-9-]{36}$/.test(legacyId)), true);

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

    assert.equal(framePaths.length, 120);
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
      assert.equal(
        CANON_BOWLERS.every((bowler) =>
          fs.existsSync(path.join(__dirname, getResultPortraitAssetPath(bowler, outcome))),
        ),
        true,
      );
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
