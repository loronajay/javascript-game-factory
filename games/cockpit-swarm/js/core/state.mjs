import { STATE } from "./constants.mjs";

export function createGameState() {
  return {
    state: STATE.PLAYING,
    messageTimer: 0,
    hitFreeze: 0,
    shake: 0,
    score: 0,
    combo: 0,
    shotsFired: 0,
    shotsHit: 0,

    player: {
      x: 0,
      speed: 0,
      health: 3,
      maxHealth: 3,
      fireCooldown: 0,
      muzzleFlash: 0,
      hurtFlash: 0
    },

    wave: {
      stageIndex: 0,
      behaviorCooldown: 0,
      pendingShots: [],
      lastBehaviorId: null,
      stageClearTimer: 0
    },

    enemies: [],
    enemyBullets: [],
    explosions: [],
    stars: []
  };
}
