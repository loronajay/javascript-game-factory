(function exposeAnimationCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.YamBowlingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAnimationCore() {
  const CANON_ROSTER = [
    ["Daisy Monroe", "daisy-monroe", "055f40b8-ba11-4466-815a-e7613378200f"],
    ["Maren Holt", "maren-holt", "116c8343-9c0d-4ac3-920b-e12fb0791616"],
    ["Nia Brooks", "nia-brooks", "121280c1-15bc-44a6-9651-d48dc216707c"],
    ["Tessa Quinn", "tessa-quinn", "1604f430-19bd-4784-88a6-ea0b40a32701"],
    ["Zuri Banks", "zuri-banks", "216c1ecf-d93e-4216-8eb8-fd02eea3de90"],
    ["Amara Reed", "amara-reed", "22a5e2d8-61ba-4449-8f3b-cd2899db1b3f"],
    ["Claire Rowan", "claire-rowan", "4063646d-2080-47f5-af78-528de3a72514"],
    ["Lumi Vega", "lumi-vega", "42fd9466-d1bd-4c3f-8a0b-42874621c544"],
    ["Cassy Cruz", "cassy-cruz", "47772a50-e82c-4cc3-b08b-0f96ae561dda"],
    ["Fiona Vale", "fiona-vale", "4b55a196-76fd-4b28-83ae-35b8f244a8db"],
    ["Nyx Calder", "nyx-calder", "5b046d80-2c52-4241-94fa-1447a67f6a4b"],
    ["Skye Bennett", "skye-bennett", "6865360a-f471-456b-96a5-5050cc2b62d1"],
    ["Carmen Blaze", "carmen-blaze", "6fb7681c-ad7d-44d9-a8d9-6fb8e20e8d13"],
    ["Piper Hart", "piper-hart", "76232de6-1d24-47cb-b7b6-c95f3a2f1ba6"],
    ["Maeve Sinclair", "maeve-sinclair", "889d12fa-d791-489c-9436-1efd030419b8"],
    ["Reina Sato", "reina-sato", "89139eef-f8e9-4197-9e28-126d80fd037a"],
    ["Jade Mercer", "jade-mercer", "8f23884e-e464-45b2-a0a3-4dff8a570a8b"],
    ["Imani Cole", "imani-cole", "9c34c1a8-9ca6-4fd7-af29-c816edba3d0c"],
    ["Sabrina Wilde", "sabrina-wilde", "a33452cb-edc7-4067-b65f-7a6ae210d0b0"],
    ["Willa Grant", "willa-grant", "a7d77962-553c-4ee1-ba0f-6a6c1166be4d"],
    ["Aaliyah Storm", "aaliyah-storm", "a9fb839c-f8cd-40da-bc73-da6733c1b891"],
    ["Mina Park", "mina-park", "abe3a683-0dad-4977-9e23-48868626f7c4"],
    ["Scarlett Voss", "scarlett-voss", "bb233e35-bb0e-4495-b3b1-93c9b13da997"],
    ["Sage Holloway", "sage-holloway", "c30a080f-7298-4194-981d-a39b17ba75db"],
    ["Hazel Ward", "hazel-ward", "e6066ce1-e014-4459-b7d5-65a6bf1277d5"],
    ["Roxy Chen", "roxy-chen", "e85ca33c-f095-4e0d-9903-b3bbf608e0aa"],
    ["Naomi Okafor", "naomi-okafor", "ed3534bc-fc54-4aad-8d2f-76fb0b8389ce"],
    ["Echo Sterling", "echo-sterling", "ffdaef24-0eaf-42e7-a852-0154d7a2d129"],
  ];

  const THROW_FRAME_COUNT = 5;
  const BASE_FRAME_DURATION_MS = 200;
  const RESULT_PORTRAIT_OUTCOMES = Object.freeze(["victory", "defeat"]);

  const CANON_BOWLERS = Object.freeze(
    CANON_ROSTER.map(([name, slug, legacyId]) =>
      Object.freeze({
        name,
        slug,
        file: `${slug}.png`,
        legacyId,
      }),
    ),
  );

  function getFrameAtElapsed(elapsedMs, frameDurationMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new RangeError("Elapsed time must be a non-negative number.");
    }

    if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0) {
      throw new RangeError("Frame duration must be greater than zero.");
    }

    return (Math.floor(elapsedMs / frameDurationMs) % THROW_FRAME_COUNT) + 1;
  }

  function getFrameAssetPath(bowler, frame) {
    if (!bowler || typeof bowler.slug !== "string") {
      throw new TypeError("A canon bowler is required.");
    }

    if (!Number.isInteger(frame) || frame < 1 || frame > THROW_FRAME_COUNT) {
      throw new RangeError(`Throw frame must be between 1 and ${THROW_FRAME_COUNT}.`);
    }

    return `assets/characters/processed/canon/${bowler.slug}/throw-${String(frame).padStart(2, "0")}.png`;
  }

  function getPortraitAssetPath(bowler) {
    if (!bowler || typeof bowler.slug !== "string") {
      throw new TypeError("A canon bowler is required.");
    }
    return `assets/characters/portraits/canon/${bowler.slug}.png`;
  }

  function getResultPortraitAssetPath(bowler, outcome) {
    if (!bowler || typeof bowler.slug !== "string") {
      throw new TypeError("A canon bowler is required.");
    }
    if (!RESULT_PORTRAIT_OUTCOMES.includes(outcome)) {
      throw new RangeError(`Result portrait outcome must be one of: ${RESULT_PORTRAIT_OUTCOMES.join(", ")}.`);
    }
    return `assets/characters/portraits/${outcome}/${bowler.slug}.png`;
  }

  function getFrameDuration(speed) {
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new RangeError("Playback speed must be greater than zero.");
    }

    return Math.round(BASE_FRAME_DURATION_MS / speed);
  }

  return {
    CANON_BOWLERS,
    THROW_FRAME_COUNT,
    getFrameAssetPath,
    getFrameAtElapsed,
    getFrameDuration,
    getPortraitAssetPath,
    getResultPortraitAssetPath,
  };
});
