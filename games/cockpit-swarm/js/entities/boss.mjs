import { BOSS_TUNING, ARBITER_TUNING } from "../core/constants.mjs";

// ─── Boss factory ─────────────────────────────────────────────────────────────

export function makeBoss(number = 1) {
  return number === 2 ? makeArbiter() : makeDreadmaw();
}

// ─── Boss 01: Dreadmaw ────────────────────────────────────────────────────────

function makeDreadmaw() {
  return {
    number: 1,
    phase: 1,
    sub: "intro",
    timer: BOSS_TUNING.introMs,
    hp: [BOSS_TUNING.phase1.hits, BOSS_TUNING.phase2.hits, BOSS_TUNING.phase3.hits],
    eyeHeat: 0,
    bob: 0,
    hitFlashBody: 0,
    armTimer: BOSS_TUNING.phase1.cadenceMs,
    arms: [makeArm(-1), makeArm(1)],
    laserTimer: 900,
    mouth: makeMouth()
  };
}

function makeArm(side) {
  return {
    side,
    state: "idle",
    timer: 0,
    laneX: side * 90,
    z: BOSS_TUNING.armIdleZ,
    exposed: false,
    flash: 0,
    resolved: false
  };
}

function makeMouth() {
  return {
    state: "closed",
    timer: 0,
    targetX: 0,
    lockedX: 0,
    exposed: false,
    flash: 0,
    resolved: false
  };
}

// ─── Boss 02: The Arbiter ─────────────────────────────────────────────────────

function makeArbiter() {
  return {
    number: 2,
    phase: 1,
    sub: "intro",
    timer: ARBITER_TUNING.introMs,
    hp: [ARBITER_TUNING.phase1.hits, ARBITER_TUNING.phase2.hits, ARBITER_TUNING.phase3.hits],
    eyeHeat: 0,
    bob: 0,
    hitFlashBody: 0,
    volley: makeVolley(),
    cannons: [makeCannon(-1), makeCannon(1)],
    arbiterLaser: makeArbiterLaser()
  };
}

function makeVolley() {
  return {
    state: "reset",
    timer: 600,      // initial delay before first charge
    safeIndices: [],
    lastSafeIndex: -1,
    hitResolved: false
  };
}

function makeCannon(side) {
  // Right cannon starts offset so they fire out of sync.
  const initDelay = side < 0 ? 400 : ARBITER_TUNING.phase2.rightOffsetMs + 400;
  return {
    side,
    state: "idle",
    timer: initDelay,
    exposed: false,
    flash: 0
  };
}

function makeArbiterLaser() {
  return {
    state: "closed",
    timer: 0,
    targetX: 0,
    lockedX: 0,
    exposed: false,
    flash: 0,
    resolved: false
  };
}

// ─── Phase helpers ────────────────────────────────────────────────────────────

// Boss 01 helpers — called with boss.phase (a number).
export function phaseUsesArms(phase) {
  return phase === 1 || phase === 3;
}

export function phaseUsesLaser(phase) {
  return phase === 2 || phase === 3;
}

// Boss 02 helpers — called with the full boss object.
export function phaseUsesVolley(boss) {
  return boss.number === 2 && (boss.phase === 1 || boss.phase === 3);
}

export function phaseUsesCannons(boss) {
  return boss.number === 2 && boss.phase === 2;
}

export function phaseUsesArbiterLaser(boss) {
  return boss.number === 2 && boss.phase === 3;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

export function bossPhaseMax(boss, phase) {
  if (boss.number === 2) {
    if (phase === 1) return ARBITER_TUNING.phase1.hits;
    if (phase === 2) return ARBITER_TUNING.phase2.hits;
    return ARBITER_TUNING.phase3.hits;
  }
  if (phase === 1) return BOSS_TUNING.phase1.hits;
  if (phase === 2) return BOSS_TUNING.phase2.hits;
  return BOSS_TUNING.phase3.hits;
}
