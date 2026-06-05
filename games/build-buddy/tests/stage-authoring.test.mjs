import {
  BUILDER_RULE_PRESETS,
  compileStageBlueprint,
  createPackStageCatalog,
} from "../js/stages/stage-authoring.js";

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

test("compileStageBlueprint turns compact route beats into a runtime stage", () => {
  const stage = compileStageBlueprint({
    packId: "pack_01",
    stageNumber: 2,
    archetype: "bridge_chain",
    name: "Bridge Chain",
    width: 4200,
    timerMs: 120000,
    rulePreset: "standard",
    theme: "sunset-construction",
    start: { x: 220, y: 1240 },
    goal: { x: 3800, y: 820 },
    route: [
      { id: "start", kind: "solid", x: 80, y: 1300, w: 540, h: 80 },
      { id: "mid", kind: "solid", x: 1120, y: 1300, w: 360, h: 70 },
      { id: "finish", kind: "solid", x: 3520, y: 1040, w: 480, h: 80 },
      { id: "recovery", kind: "oneWay", x: 700, y: 1510, w: 140, h: 18 },
      { id: "climb", kind: "climbable", x: 1700, y: 920, h: 390 },
      { id: "pit", kind: "hazard", x: 650, y: 1710, w: 380, h: 80 },
      { id: "climb_lock", kind: "blocked", x: 1660, y: 900, w: 140, h: 480 },
    ],
  });

  assertEqual(stage.id, "pack_01_stage_02");
  assertEqual(stage.archetype, "bridge_chain");
  assertEqual(stage.builderRules.ruleLabel, BUILDER_RULE_PRESETS.standard.ruleLabel);
  assertEqual(stage.solids.length, 4);
  assertEqual(stage.oneWays.length, 1);
  assertEqual(stage.climbables.length, 1);
  assertEqual(stage.hazards.length, 1);
  assertEqual(stage.blockedPlacementZones.length, 1);
});

test("rule presets make stage restrictions easy to author", () => {
  const stage = compileStageBlueprint({
    packId: "pack_01",
    stageNumber: 4,
    archetype: "spring_tower",
    rulePreset: "springFocus",
    route: [
      { id: "start", kind: "solid", x: 80, y: 1300, w: 540, h: 80 },
      { id: "goal", kind: "solid", x: 2300, y: 700, w: 440, h: 80 },
    ],
  });

  assertEqual(stage.builderRules.ruleId, "spring_focus");
  assertEqual(stage.builderRules.activeCaps.platform, 2);
  assertEqual(stage.builderRules.activeCaps.springBlue, 7);
  assertEqual(stage.builderRules.enabledTools.checkpoint, true);
});

test("createPackStageCatalog compiles and orders multiple blueprints", () => {
  const catalog = createPackStageCatalog({
    packId: "pack_02",
    stages: [
      { stageNumber: 3, archetype: "third", route: [{ id: "deck", kind: "solid", x: 80, y: 1300, w: 540, h: 80 }] },
      { stageNumber: 2, archetype: "second", route: [{ id: "deck", kind: "solid", x: 80, y: 1300, w: 540, h: 80 }] },
    ],
  });

  assertEqual(catalog.length, 2);
  assertEqual(catalog[0].id, "pack_02_stage_02");
  assertEqual(catalog[1].id, "pack_02_stage_03");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
