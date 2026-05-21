import {
  FIRST_WAVE,
  HOTSEAT_ROUND_WAVES,
  NPC_DEFINITIONS,
  POOP_HITBOX,
  REFRESH_WAVE,
  createNpcState,
  createNpcWaveState,
  getNpcFrameIndex,
  processNpcHits,
  startNextWave,
  updateNpcState,
  getNpcFrameFile,
} from "../scripts/npcs.js";
import { createPoopState } from "../scripts/poop.js";

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
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

test("npc definitions include canon score values", () => {
  assertEqual(NPC_DEFINITIONS.alan.score, 1);
  assertEqual(NPC_DEFINITIONS.john.score, 1);
  assertEqual(NPC_DEFINITIONS.bryan.score, 2);
  assertEqual(NPC_DEFINITIONS.anna.score, 2);
  assertEqual(NPC_DEFINITIONS.sanjeet.score, 3);
  assertEqual(NPC_DEFINITIONS.sanjeetFast.score, 5);
});

test("posing durations match the TurboWarp wait timings", () => {
  assertEqual(NPC_DEFINITIONS.sanjeet.poseDurationTicks, 42);
  assertEqual(NPC_DEFINITIONS.sanjeetFast.poseDurationTicks, 42);
  assertEqual(NPC_DEFINITIONS.anna.poseDurationTicks, 72);
});

test("first and refresh wave queues match the single-player scripts", () => {
  assertEqual(FIRST_WAVE.length, 6);
  assertEqual(FIRST_WAVE.join(","), "alan,anna,john,sanjeet,sanjeetFast,john");
  assertEqual(REFRESH_WAVE.length, 14);
  assertEqual(REFRESH_WAVE[6], "wait");
  assertEqual(REFRESH_WAVE[13], "john");
});

test("hotseat rounds have distinct spawn patterns", () => {
  assertEqual(HOTSEAT_ROUND_WAVES[1].first.join(","), "alan,anna,john,sanjeet");
  assertEqual(HOTSEAT_ROUND_WAVES[2].first.join(","), "alan,anna,john,sanjeet,bryan,sanjeetFast");
  assertEqual(HOTSEAT_ROUND_WAVES[3].first.join(","), "alan,anna,john,sanjeet,wait,alan,anna,john,sanjeetFast");
  assertEqual(HOTSEAT_ROUND_WAVES[1].refresh.join(","), "alan,anna,john,sanjeet,sanjeetFast,john");
  assertEqual(HOTSEAT_ROUND_WAVES[2].refresh.join(","), "alan,anna,john,sanjeet,bryan,sanjeetFast,bryan,anna");
  assertEqual(HOTSEAT_ROUND_WAVES[3].refresh[6], "wait");
  assertEqual(HOTSEAT_ROUND_WAVES[3].refresh.length, 11);
});

test("npc state can start with the configured hotseat round wave", () => {
  let state = startNextWave(createNpcState({ round: 2 }));
  assertEqual(state.wave.queue.join(","), HOTSEAT_ROUND_WAVES[2].first.join(","));

  state = {
    ...createNpcState({ round: 3 }),
    waveIndex: 1,
    wave: createNpcWaveState([]),
    entities: [],
  };

  const next = updateNpcState(state);
  assertEqual(next.wave.queue.join(","), HOTSEAT_ROUND_WAVES[3].refresh.join(","));
});

test("starting waves allows duplicate npc types", () => {
  let state = startNextWave(createNpcState());
  for (let i = 0; i < 40; i++) state = updateNpcState(state);

  const johnCount = state.entities.filter((entity) => entity.type === "john").length;
  assertEqual(johnCount, 2);
});

test("clearing a finished first wave immediately starts the refresh wave", () => {
  const state = {
    ...createNpcState(),
    waveIndex: 1,
    wave: createNpcWaveState([]),
    entities: [],
  };

  const next = updateNpcState(state);
  assertEqual(next.waveIndex, 2);
  assertEqual(next.wave.queue.length, REFRESH_WAVE.length);
});

test("npcs turn before the end of the canvas and enter posing when configured", () => {
  const state = {
    ...createNpcState(),
    entities: [
      {
        id: 1,
        type: "sanjeet",
        x: NPC_DEFINITIONS.sanjeet.bounds.maxX - 1,
        y: NPC_DEFINITIONS.sanjeet.y,
        direction: 1,
        animationTick: 0,
        poseTicks: 0,
      },
    ],
  };

  const next = updateNpcState(state);
  const npc = next.entities[0];

  assertEqual(npc.direction, -1);
  assertEqual(npc.poseTicks > 0, true);
  assertEqual(npc.x <= NPC_DEFINITIONS.sanjeet.bounds.maxX, true);
});

test("only airborne poop scores and removes contacted npcs", () => {
  const entity = {
    id: 1,
    type: "alan",
    x: 300,
    y: NPC_DEFINITIONS.alan.y,
    direction: 1,
    animationTick: 0,
    poseTicks: 0,
  };

  const inactive = processNpcHits([entity], createPoopState());
  const splat = processNpcHits([entity], { phase: "splat", x: 300, y: entity.y, splatTicks: 0 });
  const airborne = processNpcHits([entity], { phase: "airborne", x: 300, y: entity.y - 60, splatTicks: 0 });

  assertEqual(inactive.entities.length, 1);
  assertEqual(splat.entities.length, 1);
  assertEqual(airborne.entities.length, 0);
  assertEqual(airborne.scoreDelta, 1);
  assertEqual(airborne.hitTypes[0], "alan");
});

test("poop hitbox is a forgiving area rather than a single point", () => {
  const entity = {
    id: 1,
    type: "john",
    x: 300,
    y: NPC_DEFINITIONS.john.y,
    direction: 1,
    animationTick: 0,
    poseTicks: 0,
  };

  const result = processNpcHits([entity], {
    phase: "airborne",
    x: 300 + POOP_HITBOX.width / 2 - 1,
    y: entity.y - 60,
    splatTicks: 0,
  });

  assertEqual(result.entities.length, 0);
  assertEqual(result.scoreDelta, 1);
});

test("one airborne poop can hit multiple overlapping npcs", () => {
  const entities = [
    {
      id: 1,
      type: "alan",
      x: 300,
      y: NPC_DEFINITIONS.alan.y,
      direction: 1,
      animationTick: 0,
      poseTicks: 0,
    },
    {
      id: 2,
      type: "john",
      x: 315,
      y: NPC_DEFINITIONS.john.y,
      direction: -1,
      animationTick: 0,
      poseTicks: 0,
    },
  ];

  const result = processNpcHits(entities, { phase: "airborne", x: 306, y: entities[0].y - 60, splatTicks: 0 });

  assertEqual(result.entities.length, 0);
  assertEqual(result.scoreDelta, 2);
  assertEqual(result.hitTypes.join(","), "alan,john");
});

test("npc animation frames advance at a fixed cadence", () => {
  assertEqual(getNpcFrameIndex("alan", 0, 0), 0);
  assertEqual(getNpcFrameIndex("alan", 7, 0), 0);
  assertEqual(getNpcFrameIndex("alan", 8, 0), 1);
  assertEqual(getNpcFrameFile("sanjeet", 0, 12), "assets/scratch/pngs/sanjeet-pose-1.png");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
