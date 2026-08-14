(function exposeCpuPlanner(root, factory) {
  const physics = typeof module === "object" && module.exports ? require("./physics-core.js") : root.YamPhysics;
  const api = factory(physics);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YamCpuPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCpuPlanner(Physics) {
  "use strict";

  const LEVELS = Object.freeze({
    casual: Object.freeze({ poolSize: 8, positionError: 0.03, aimError: 0.06, hookError: 0.22, powerError: 0.12, releaseError: 0.018 }),
    pro: Object.freeze({ poolSize: 1, positionError: 0.006, aimError: 0.01, hookError: 0.035, powerError: 0.02, releaseError: 0.003 }),
  });
  const SEARCH_BALL_INDICES = Object.freeze([0, 2, 5, 7]);
  const SEARCH_POSITIONS = Object.freeze([-0.24, 0.24]);
  const SEARCH_POWERS = Object.freeze([0.68, 0.9]);
  const SEARCH_HOOKS = Object.freeze([-0.55, 0, 0.55]);
  const planCache = new Map();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  function standingPins(pins) {
    return pins.filter((pin) => pin.standing !== false);
  }

  function uniqueTargets(values) {
    const targets = [];
    for (const value of values) {
      if (Number.isFinite(value) && !targets.some((target) => Math.abs(target - value) < 0.015)) targets.push(value);
    }
    return targets;
  }

  function targetLines(pins) {
    const standing = standingPins(pins);
    if (standing.length >= 10) return [-0.075, 0.075];
    const byDepth = [...standing].sort((a, b) => a.y - b.y || Math.abs(a.x) - Math.abs(b.x));
    const byX = [...standing].sort((a, b) => a.x - b.x);
    const left = byX[0];
    const right = byX[byX.length - 1];
    return uniqueTargets([
      byDepth[0]?.x,
      left?.x,
      right?.x,
      left && right ? (left.x + right.x) / 2 : null,
    ]).slice(0, 4);
  }

  function simulate(pins, shot, ball) {
    const simulation = Physics.createSimulation(pins, { ...shot, ...ball });
    while (!simulation.complete) Physics.stepSimulation(simulation, 1 / 180);
    return Physics.knockedCount(simulation);
  }

  function candidateScore(knocked, totalStanding, shot) {
    const cleared = knocked === totalStanding;
    return (cleared ? 100000 : 0)
      + knocked * 1000
      - Math.abs(shot.power - 0.8) * 4
      - Math.abs(shot.hook) * 2
      - Math.abs(shot.position) * 0.2;
  }

  function evaluateCandidate(pins, balls, shot, targetX) {
    const ball = balls[shot.ballIndex];
    const knocked = simulate(pins, shot, ball);
    return {
      plan: shot,
      targetX,
      knocked,
      score: candidateScore(knocked, standingPins(pins).length, shot),
    };
  }

  function aimAtTarget(targetX, shot, ball) {
    const curveWithoutAim = Physics.trajectoryX(Physics.RACK_FRONT_Z, { ...shot, ...ball, aim: 0 });
    return (targetX - curveWithoutAim) / Physics.RACK_FRONT_Z;
  }

  function coarseCandidates(pins, balls) {
    const ballIndices = SEARCH_BALL_INDICES.filter((index) => balls[index]);
    if (!ballIndices.length) ballIndices.push(...balls.map((_, index) => index).slice(0, 4));
    const candidates = [];
    for (const targetX of targetLines(pins)) {
      for (const ballIndex of ballIndices) {
        const ball = balls[ballIndex];
        for (const position of SEARCH_POSITIONS) {
          for (const power of SEARCH_POWERS) {
            for (const hook of SEARCH_HOOKS) {
              const base = { position, aim: 0, hook, power, release: 0, ballIndex };
              const aim = aimAtTarget(targetX, base, ball);
              if (aim < -0.45 || aim > 0.45) continue;
              candidates.push(evaluateCandidate(pins, balls, { ...base, aim }, targetX));
            }
          }
        }
      }
    }
    return candidates;
  }

  function refinedCandidates(pins, balls, coarse) {
    const candidates = [];
    const seeds = [...coarse].sort((a, b) => b.score - a.score).slice(0, 5);
    for (const seed of seeds) {
      const variants = [
        { ...seed.plan, aim: seed.plan.aim - 0.018 },
        { ...seed.plan, aim: seed.plan.aim + 0.018 },
        { ...seed.plan, hook: clamp(seed.plan.hook - 0.1, -1, 1) },
        { ...seed.plan, hook: clamp(seed.plan.hook + 0.1, -1, 1) },
        { ...seed.plan, power: clamp(seed.plan.power - 0.07, Physics.MIN_THROW_POWER, 1) },
        { ...seed.plan, power: clamp(seed.plan.power + 0.07, Physics.MIN_THROW_POWER, 1) },
      ];
      for (const variant of variants) {
        if (variant.aim < -0.45 || variant.aim > 0.45) continue;
        candidates.push(evaluateCandidate(pins, balls, variant, seed.targetX));
      }
    }
    return candidates;
  }

  function addExecutionError(plan, level, random) {
    const error = (amount) => (random() * 2 - 1) * amount;
    return {
      position: round(clamp(plan.position + error(level.positionError), -0.46, 0.46)),
      aim: round(clamp(plan.aim + error(level.aimError), -0.45, 0.45)),
      hook: round(clamp(plan.hook + error(level.hookError), -1, 1)),
      power: round(clamp(plan.power + error(level.powerError), Physics.MIN_THROW_POWER, 1)),
      release: round(clamp((plan.release || 0) + error(level.releaseError), -0.035, 0.035)),
      ballIndex: plan.ballIndex,
    };
  }

  function rackSignature(pins, balls) {
    const pinKey = standingPins(pins)
      .map((pin) => `${pin.id}:${pin.x.toFixed(2)}:${pin.y.toFixed(2)}`)
      .sort()
      .join("|");
    const ballKey = balls.map((ball) => `${ball.hookScale}:${ball.speedScale}:${ball.massScale}`).join("|");
    return `${pinKey}::${ballKey}`;
  }

  function rankedPlans(pins, balls) {
    const signature = rackSignature(pins, balls);
    if (!planCache.has(signature)) {
      const coarse = coarseCandidates(pins, balls);
      const ranked = [...coarse, ...refinedCandidates(pins, balls, coarse)].sort((a, b) => b.score - a.score);
      if (!ranked.length) throw new Error("CPU planner could not find a legal shot.");
      planCache.set(signature, ranked);
    }
    return planCache.get(signature);
  }

  function warmCpuPlanner({ pins, balls } = {}) {
    if (!Array.isArray(pins) || !standingPins(pins).length) return;
    if (!Array.isArray(balls) || !balls.length) return;
    rankedPlans(pins, balls);
  }

  function createCpuPlan({ levelId = "casual", pins, balls, random = Math.random } = {}) {
    const level = LEVELS[levelId];
    if (!level) throw new RangeError(`Unknown CPU level: ${levelId}`);
    if (!Array.isArray(pins) || !standingPins(pins).length) throw new TypeError("CPU planning requires standing pin bodies.");
    if (!Array.isArray(balls) || !balls.length) throw new TypeError("CPU planning requires ball profiles.");
    if (typeof random !== "function") throw new TypeError("CPU planning requires a random source function.");

    const ranked = rankedPlans(pins, balls);
    const poolSize = Math.min(level.poolSize, ranked.length);
    const choice = level.poolSize === 1 ? 0 : Math.floor(Math.pow(random(), 1.7) * poolSize);
    return addExecutionError(ranked[choice].plan, level, random);
  }

  return {
    LEVELS,
    createCpuPlan,
    warmCpuPlanner,
  };
});
