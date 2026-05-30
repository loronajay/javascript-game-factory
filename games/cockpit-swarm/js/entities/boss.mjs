import { BOSS_TUNING } from "../core/constants.mjs";

// ─── Boss 01 entity ───────────────────────────────────────────────────────────
// One large creature: invulnerable body, two lunging arms (phase 1/3), and a
// charging mouth-laser (phase 2/3). Damage is gated to each phase's mechanic.

export function makeBoss(number = 1) {
  return {
    number,
    phase: 1,
    sub: "intro",        // intro | fighting | transition | defeat
    timer: BOSS_TUNING.introMs,

    // Per-phase hit pools (Boss 01: 6 / 5 / 8).
    hp: [
      BOSS_TUNING.phase1.hits,
      BOSS_TUNING.phase2.hits,
      BOSS_TUNING.phase3.hits
    ],

    eyeHeat: 0,          // 0..1 visual escalation cue
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
    side,                // -1 left, +1 right
    state: "idle",       // idle | telegraph | lunge | retract
    timer: 0,
    laneX: side * 90,    // world-x lane the hand is aimed at
    z: BOSS_TUNING.armIdleZ,
    exposed: false,      // weak spot hittable this frame
    flash: 0,            // weak-spot hit flash
    resolved: false      // contact already resolved this lunge
  };
}

function makeMouth() {
  return {
    state: "closed",     // closed | charging | locked | firing | vulnerable
    timer: 0,
    targetX: 0,          // tracked lane during charge
    lockedX: 0,          // frozen aim at lock
    exposed: false,      // mouth hittable this frame
    flash: 0,            // mouth hit flash
    resolved: false      // beam contact resolved this fire
  };
}

// Remaining/total hits for the boss health bar.
export function bossPhaseMax(phase) {
  if (phase === 1) return BOSS_TUNING.phase1.hits;
  if (phase === 2) return BOSS_TUNING.phase2.hits;
  return BOSS_TUNING.phase3.hits;
}

// Is the active phase one where arms attack? (1 and 3)
export function phaseUsesArms(phase) {
  return phase === 1 || phase === 3;
}

// Is the active phase one where the mouth laser runs? (2 and 3)
export function phaseUsesLaser(phase) {
  return phase === 2 || phase === 3;
}
