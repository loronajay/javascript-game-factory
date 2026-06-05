import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PACK_ID,
  getStageById,
  getStageSequence,
  listPacks,
  listStages,
} from "../js/stages/stage-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pack01Dir = join(__dirname, "..", "js", "stages", "packs", "pack-01");

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

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `expected ${actualJson} to equal ${expectedJson}`);
  }
}

test("Pack 01 registry exposes a complete 10-stage canon run sequence", () => {
  const sequence = getStageSequence(DEFAULT_PACK_ID);

  assertEqual(sequence.length, 10);
  assertEqual(sequence[0], "pack_01_stage_01");
  assertEqual(sequence[9], "pack_01_stage_10");
  assertDeepEqual(
    sequence,
    Array.from({ length: 10 }, (_, index) => `pack_01_stage_${String(index + 1).padStart(2, "0")}`),
  );
});

test("pack metadata reports declared and registered stage counts together", () => {
  const [pack] = listPacks();

  assertEqual(pack.id, DEFAULT_PACK_ID);
  assertEqual(pack.stageCount, 10);
  assertEqual(pack.registeredStages, 10);
});

test("Pack 01 keeps each authored stage in its own stage module", () => {
  for (let stageNumber = 1; stageNumber <= 10; stageNumber += 1) {
    const fileName = `pack-01-stage-${String(stageNumber).padStart(2, "0")}.js`;
    assertEqual(existsSync(join(pack01Dir, fileName)), true, `${fileName} should exist`);
  }

  assertEqual(existsSync(join(pack01Dir, "pack-01-stage-stubs.js")), false);
});

test("stage select metadata comes from the registered pack stages", () => {
  const stages = listStages(DEFAULT_PACK_ID);

  assertEqual(stages.length, 10);
  assertEqual(stages[4].id, "pack_01_stage_05");
  assertEqual(stages[4].stageNumber, 5);
  assertEqual(stages[4].packId, DEFAULT_PACK_ID);
  assertEqual(typeof stages[4].name, "string");
  assertEqual(stages[4].timerMs > 0, true);
  assertEqual(typeof stages[4].ruleLabel, "string");
});

test("authored stages are full runtime stage records and are cloned on read", () => {
  const stage = getStageById("pack_01_stage_07");
  stage.solids.push({ id: "test_mutation", x: 0, y: 0, w: 1, h: 1 });
  const freshStage = getStageById("pack_01_stage_07");

  assertEqual(freshStage.stageNumber, 7);
  assertEqual(freshStage.start.x > 0, true);
  assertEqual(freshStage.goal.w > 0, true);
  assertEqual(Array.isArray(freshStage.solids), true);
  assertEqual(Array.isArray(freshStage.hazards), true);
  assertEqual(freshStage.builderRules.totalActiveToolCap > 0, true);
  assertEqual(freshStage.solids.some((solid) => solid.id === "test_mutation"), false);
});

test("Pack 01 stages 02-10 expose distinct authored baseline archetypes", () => {
  const stages = getStageSequence(DEFAULT_PACK_ID).slice(1).map(getStageById);
  const archetypes = new Set(stages.map((stage) => stage.archetype));
  const ruleLabels = new Set(stages.map((stage) => stage.builderRules.ruleLabel));

  assertEqual(stages.every((stage) => typeof stage.archetype === "string" && stage.archetype.length > 0), true);
  assertEqual(archetypes.size >= 6, true);
  assertEqual(ruleLabels.size >= 4, true);
  assertEqual(stages.every((stage) => stage.solids.length >= 7), true);
  assertEqual(stages.every((stage) => stage.hazards.length >= 3), true);
  assertEqual(stages.every((stage) => stage.blockedPlacementZones.length >= 1), true);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
