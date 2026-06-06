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
      hurtFlash: 0,
      curseTimer: 0,
      tetherTimer: 0,
      tetherTargetX: 0
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
        splashShotCharges: 0,
        overchargeMs: 0
      },
      lastPickupId: null
    },

    enemies: [],
    enemyBullets: [],
    explosions: [],
    stars: [],

    boss: null,

    runner: {
      spawnCooldownMs: 30000,
      active: null,
      killMessageTimer: 0,
      killMessage: ""
    },

    // ── Multiplayer state ──
    mp: {
      // Lobby
      lobbyPhase:          "main",
      connected:           false,
      side:                null,
      opponentName:        null,
      queueCounts:         null,
      clockOffsetMs:       0,
      round:               0,
      p1Rounds:            0,
      p2Rounds:            0,
      startAt:             null,
      matchWinner:         null,
      rematchReady:        false,
      rematchOpponentReady:false,
      disconnected:        false,
      errorMsg:            null,
      roomCode:            null,
      roomCodeInput:       "",
      // Phase 2 combat (host-authoritative)
      opponentX:           0,
      opponentSpeed:       0,
      p1hp:                100,
      p2hp:                100,
      p1heat:              0,
      p2heat:              0,
      p1burn:              false,
      p2burn:              false,
      mpBullets:           [],
      mpTick:              0,
      mpTimerMs:           45000,
      suddenDeath:         false,
      remoteInput:         null,
      p1LobCd:             0,
      p2FireCd:            0,
      p2LobCd:             0,
      roundEndTimer:       0,
      roundEnded:          false,
      roundEndWinner:      null,
      opponentHitFlash:    0,
    }
  };
}
