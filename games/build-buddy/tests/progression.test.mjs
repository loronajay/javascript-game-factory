import {
  BUILD_BUDDY_PROGRESS_STORAGE_KEY,
  createMemoryStorage,
  getUnlockedStageIds,
  isStageUnlocked,
  loadProgression,
  recordCanonStageClear,
  saveProgression,
} from "../js/progression.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

test("new progression unlocks Pack 01 Stage 01 by default", () => {
  const progression = loadProgression(createMemoryStorage());

  assertEqual(isStageUnlocked(progression, "pack_01", "pack_01_stage_01"), true);
  assertEqual(isStageUnlocked(progression, "pack_01", "pack_01_stage_02"), false);
});

test("canon clears unlock the cleared stage for practice", () => {
  const progression = recordCanonStageClear(
    loadProgression(createMemoryStorage()),
    { packId: "pack_01", stageId: "pack_01_stage_02", isCanonRun: true },
  );

  assertEqual(isStageUnlocked(progression, "pack_01", "pack_01_stage_02"), true);
  assertEqual(getUnlockedStageIds(progression, "pack_01").includes("pack_01_stage_02"), true);
});

test("practice and debug clears do not unlock stages", () => {
  let progression = loadProgression(createMemoryStorage());
  progression = recordCanonStageClear(progression, {
    packId: "pack_01",
    stageId: "pack_01_stage_02",
    isCanonRun: false,
  });

  assertEqual(isStageUnlocked(progression, "pack_01", "pack_01_stage_02"), false);
});

test("progression saves and loads from storage", () => {
  const storage = createMemoryStorage();
  const progression = recordCanonStageClear(loadProgression(storage), {
    packId: "pack_01",
    stageId: "pack_01_stage_02",
    isCanonRun: true,
  });

  saveProgression(storage, progression);
  const loaded = loadProgression(storage);

  assertEqual(storage.getItem(BUILD_BUDDY_PROGRESS_STORAGE_KEY).includes("pack_01_stage_02"), true);
  assertEqual(isStageUnlocked(loaded, "pack_01", "pack_01_stage_02"), true);
});

test("invalid stored progression falls back to defaults", () => {
  const storage = createMemoryStorage({ [BUILD_BUDDY_PROGRESS_STORAGE_KEY]: "{bad json" });
  const progression = loadProgression(storage);

  assertEqual(isStageUnlocked(progression, "pack_01", "pack_01_stage_01"), true);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
