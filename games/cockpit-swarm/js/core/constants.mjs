export const W = 1280;
export const H = 720;
export const CX = W * 0.5;
export const HORIZON_Y = H * 0.37;
export const RETICLE_Y = H * 0.49;

export const STATE = {
  MENU: "MENU",
  HOW_TO_PLAY: "HOW_TO_PLAY",
  PLAYING: "PLAYING",
  STAGE_CLEAR: "STAGE_CLEAR",
  BOSS: "BOSS",
  CLEAR: "CLEAR",
  GAME_OVER: "GAME_OVER"
};

// A boss encounter fires after every Nth stage clear (Boss 01 after stage 5).
export const BOSS_EVERY = 5;

export const LANES = [-180, -90, 0, 90, 180];

export const TUNING = {
  playerAccel: 0.72,
  playerFriction: 0.86,
  playerMaxSpeed: 8.2,
  playerMaxX: 190,
  playerHitWindow: 62,

  fireCooldownMs: 130,
  reticleHitWindowX: 54,

  enemyBaseSize: 48,
  enemyDriftAmount: 12,
  enemyDriftSpeed: 0.0017,
  enemyFireMinMs: 950,
  enemyFireMaxMs: 2100,

  enemyBulletBaseSize: 15,
  enemyBulletSpeedZ: 0.0105,
  enemyBulletHitDepth: 0.165,
  enemyBulletLaneHitWindow: 42,
  enemyBulletNearY: 138,
  enemyBulletVisualConverge: 0.78,
  maxEnemyBullets: 6,

  waveThinkMinMs: 560,
  waveThinkMaxMs: 980,
  stageClearDelayMs: 1100,

  starCount: 120,
  cockpitShakeDecay: 0.84,
  hitFreezeMs: 50
};

// ─── Boss 01 tuning ───────────────────────────────────────────────────────────
// Hits-to-clear per phase are pre-powerup; splash/rapid naturally shorten them.
export const BOSS_TUNING = {
  introMs: 2200,
  transitionMs: 1300,
  defeatMs: 2600,

  // Body anchor in world space (projected for the far-away look + parallax).
  bodyZ: 1.7,
  bodyY: -130,

  // Arm lunge depth band — hands travel from far (near the body) to the player plane.
  // Lunge z is interpolated LINEARLY so the expose→impact gap stays a fair dodge window.
  armIdleZ: 1.5,
  armImpactZ: 0.34,
  armExposeStartZ: 1.1,  // weak spot becomes hittable once the hand is this close…
  armExposeEndZ: 0.66,   // …and re-armors with ~200ms left to dodge before impact

  phase1: {
    hits: 20,
    telegraphMs: 850,
    lungeMs: 950,
    retractMs: 620,
    cadenceMs: 1600,
    handHitWindow: 52,       // contact-damage lane window at impact
    weakSpotHitWindow: 64,   // player-shot lane window onto the weak spot (forgiving aim)
    bothArmsChanceStart: 0.0,
    bothArmsChanceEnd: 0.5
  },

  phase2: {
    hits: 20,
    chargeMs: 1500,
    lockMs: 520,
    fireMs: 620,
    cooldownMs: 700,
    mouthVulnerableMs: 1150,
    beamLaneWidth: 70,       // beam contact lane band
    mouthHitWindow: 56       // player-shot lane window onto the open mouth (centered)
  },

  phase3: {
    hits: 30,
    armCadenceMs: 2100,
    laserCooldownMs: 1500
  }
};

// Button layout — shared by render and game hit-testing so coords stay in sync.
// All positions are in logical canvas space (1280×720).

export const MENU_BTNS = [
  { id: "campaign",  label: "CAMPAIGN",    x: 470, y: 286, w: 340, h: 58 },
  { id: "bossRush",  label: "BOSS RUSH",   x: 470, y: 356, w: 340, h: 58 },
  { id: "howToPlay", label: "HOW TO PLAY", x: 470, y: 426, w: 340, h: 58 },
];

export const HTP_BTNS = [
  { id: "back", label: "← BACK", x: 500, y: 518, w: 280, h: 56 },
];

// end-screen buttons are side-by-side; navigate with left/right or up/down
export const END_BTNS_GAMEOVER = [
  { id: "retry", label: "RETRY MISSION", x: 390, y: 452, w: 240, h: 60 },
  { id: "menu",  label: "MAIN MENU",     x: 650, y: 452, w: 240, h: 60 },
];

export const END_BTNS_CLEAR = [
  { id: "again", label: "PLAY AGAIN", x: 390, y: 452, w: 240, h: 60 },
  { id: "menu",  label: "MAIN MENU",  x: 650, y: 452, w: 240, h: 60 },
];
