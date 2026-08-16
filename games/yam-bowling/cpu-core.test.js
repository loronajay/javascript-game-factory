const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const Physics = require("./physics-core.js");
const { LEVELS, createCpuPlan } = require("./cpu-core.js");

const BALLS = [
  { hookScale: 1, speedScale: 1, massScale: 1 },
  { hookScale: 0.88, speedScale: 1.04, massScale: 0.98 },
  { hookScale: 1.28, speedScale: 0.97, massScale: 0.98 },
  { hookScale: 1.12, speedScale: 1.01, massScale: 1 },
  { hookScale: 0.92, speedScale: 1.08, massScale: 0.96 },
  { hookScale: 0.82, speedScale: 0.98, massScale: 1.08 },
  { hookScale: 1.05, speedScale: 1, massScale: 1.02 },
  { hookScale: 0.75, speedScale: 1.06, massScale: 1.1 },
];

function simulate(pins, plan) {
  const ball = BALLS[plan.ballIndex];
  const simulation = Physics.createSimulation(pins, { ...plan, ...ball });
  while (!simulation.complete) Physics.stepSimulation(simulation, 1 / 180);
  return Physics.knockedCount(simulation);
}

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function benchmarkFrames(levelId, seed, samples = 100) {
  const random = seededRandom(seed);
  let framePins = 0;
  let spareChances = 0;
  let spares = 0;
  for (let index = 0; index < samples; index += 1) {
    const rack = Physics.createRack();
    const firstPlan = createCpuPlan({ levelId, pins: rack, balls: BALLS, random });
    const firstBall = BALLS[firstPlan.ballIndex];
    const first = Physics.createSimulation(rack, { ...firstPlan, ...firstBall });
    while (!first.complete) Physics.stepSimulation(first, 1 / 180);
    const firstPins = Physics.knockedCount(first);
    if (firstPins === 10) { framePins += 10; continue; }
    spareChances += 1;
    const leave = Physics.clearFallen(first.pins);
    const secondPlan = createCpuPlan({ levelId, pins: leave, balls: BALLS, random });
    const second = Physics.createSimulation(leave, { ...secondPlan, ...BALLS[secondPlan.ballIndex] });
    while (!second.complete) Physics.stepSimulation(second, 1 / 180);
    const secondPins = Physics.knockedCount(second);
    framePins += firstPins + secondPins;
    if (secondPins === 10 - firstPins) spares += 1;
  }
  return { averagePins: framePins / samples, spareRate: spares / spareChances };
}

describe("physics-aware CPU planning", () => {
  test("offers five increasingly precise difficulty tiers", () => {
    const ids = ["rookie", "casual", "competitive", "pro", "champion"];

    assert.deepEqual(Object.keys(LEVELS), ids);
    for (let index = 1; index < ids.length; index += 1) {
      const easier = LEVELS[ids[index - 1]];
      const harder = LEVELS[ids[index]];
      assert.ok(harder.poolSize <= easier.poolSize, `${ids[index]} should choose from no more candidate shots`);
      for (const field of ["positionError", "aimError", "hookError", "powerError", "releaseError"]) {
        assert.ok(harder[field] < easier[field], `${ids[index]} should have less ${field}`);
      }
    }
  });

  test("searches legal shot and ball combinations against the live rack", () => {
    const pins = Physics.createRack();
    const plan = createCpuPlan({ levelId: "pro", pins, balls: BALLS, random: () => 0.5 });

    assert.ok(plan.ballIndex >= 0 && plan.ballIndex < BALLS.length);
    assert.ok(plan.position >= -0.46 && plan.position <= 0.46);
    assert.ok(plan.aim >= -0.45 && plan.aim <= 0.45);
    assert.ok(plan.hook >= -1 && plan.hook <= 1);
    assert.ok(plan.power >= Physics.MIN_THROW_POWER && plan.power <= 1);
    assert.ok(simulate(pins, plan) >= 8, "a zero-error Pro line should find the pocket");
  });

  test("aims at the actual leave instead of only counting standing pins", () => {
    const rack = Physics.createRack();
    const leftLeave = rack.filter((pin) => pin.id === 7);
    const rightLeave = rack.filter((pin) => pin.id === 10);
    const leftPlan = createCpuPlan({ levelId: "pro", pins: leftLeave, balls: BALLS, random: () => 0.5 });
    const rightPlan = createCpuPlan({ levelId: "pro", pins: rightLeave, balls: BALLS, random: () => 0.5 });
    const leftBall = BALLS[leftPlan.ballIndex];
    const rightBall = BALLS[rightPlan.ballIndex];

    assert.ok(Physics.trajectoryX(Physics.RACK_FRONT_Z, { ...leftPlan, ...leftBall }) < 0);
    assert.ok(Physics.trajectoryX(Physics.RACK_FRONT_Z, { ...rightPlan, ...rightBall }) > 0);
    assert.equal(simulate(leftLeave, leftPlan), 1);
    assert.equal(simulate(rightLeave, rightPlan), 1);
  });

  test("produces deterministic plans when supplied the same random source", () => {
    const pins = Physics.createRack();
    const first = createCpuPlan({ levelId: "casual", pins, balls: BALLS, random: () => 0.25 });
    const second = createCpuPlan({ levelId: "casual", pins, balls: BALLS, random: () => 0.25 });
    assert.deepEqual(first, second);
  });

  test("keeps Casual beatable while Pro converts meaningfully more difficult leaves", () => {
    const casual = benchmarkFrames("casual", 9101);
    const pro = benchmarkFrames("pro", 9102);

    assert.ok(casual.averagePins < 9.25, `Casual averaged ${casual.averagePins.toFixed(2)} pins per frame`);
    assert.ok(pro.averagePins > casual.averagePins + 0.35, `${casual.averagePins.toFixed(2)} vs ${pro.averagePins.toFixed(2)}`);
    assert.ok(pro.spareRate > casual.spareRate + 0.2, `${casual.spareRate.toFixed(2)} vs ${pro.spareRate.toFixed(2)}`);
  });

  test("campaign endpoints create a meaningful skill curve", () => {
    const rookie = benchmarkFrames("rookie", 9201, 60);
    const champion = benchmarkFrames("champion", 9202, 60);

    assert.ok(rookie.averagePins < 9, `Rookie averaged ${rookie.averagePins.toFixed(2)} pins per frame`);
    assert.ok(champion.averagePins > rookie.averagePins + 0.75, `${rookie.averagePins.toFixed(2)} vs ${champion.averagePins.toFixed(2)}`);
    assert.ok(champion.spareRate > rookie.spareRate + 0.35, `${rookie.spareRate.toFixed(2)} vs ${champion.spareRate.toFixed(2)}`);
  });
});
