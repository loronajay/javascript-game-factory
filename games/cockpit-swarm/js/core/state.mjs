import { STATE } from "./constants.mjs";

export function createGameState() {
  return {
    state: STATE.MENU,
    mode: "campaign",     // "campaign" | "bossRush"
    messageTimer: 0,
    hitFreeze: 0,
    shake: 0,
    score: 0,
    combo: 0,
    shotsFired: 0,
    shotsHit: 0,

    menu: {
      selectedButton: 0
    },

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

    powerups: {
      activePickups: [],
      effects: {
        holdToShootMs: 0,
        speedBoostMs: 0,
        splashShotCharges: 0
      },
      lastPickupId: null
    },

    enemies: [],
    enemyBullets: [],
    explosions: [],
    stars: [],

    boss: null
  };
}
