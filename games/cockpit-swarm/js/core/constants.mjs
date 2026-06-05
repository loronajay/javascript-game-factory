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
  GAME_OVER: "GAME_OVER",
  // ── Multiplayer (1v1 Dodgeball) ──
  MP_LOBBY:     "MP_LOBBY",
  MP_COUNTDOWN: "MP_COUNTDOWN",
  MP_FIGHTING:  "MP_FIGHTING",
  MP_RESULT:    "MP_RESULT",
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

// ─── Boss 02 tuning (The Arbiter) ────────────────────────────────────────────
export const ARBITER_TUNING = {
  introMs: 2200,
  transitionMs: 1300,
  defeatMs: 2600,

  bodyZ: 1.7,
  bodyY: -130,

  phase1: {
    hits: 20,
    chargeMs: 900,
    fireMs: 220,
    openMs: 750,
    resetMs: 500,
    safeLanes: 1,          // how many safe lanes left uncovered
    safeHitWindow: 72,     // px from safe lane center to count as dodged
    coreHitWindow: 60      // px from center to score a core hit
  },

  phase2: {
    hits: 22,
    cannonChargeMs: 1100,
    cannonFireMs: 250,
    cannonVulnerableMs: 650,
    cannonResetMs: 900,
    rightOffsetMs: 1400,   // right cannon cycle starts this far after the left
    leftDangerX: -45,      // player.x <= this → in left cannon's kill zone
    rightDangerX: 45       // player.x >= this → in right cannon's kill zone
  },

  phase3: {
    hits: 28,
    chargeMs: 600,
    fireMs: 220,
    openMs: 500,
    resetMs: 380,
    safeLanes: 2,
    safeHitWindow: 72,
    coreHitWindow: 60,
    laserChargeMs: 1400,
    laserLockMs: 480,
    laserFireMs: 620,
    laserVulnerableMs: 950,
    laserCooldownMs: 1300,
    laserBeamWidth: 65
  }
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
  { id: "campaign",  label: "CAMPAIGN",    x: 470, y: 278, w: 340, h: 58 },
  { id: "bossRush",  label: "BOSS RUSH",   x: 470, y: 340, w: 340, h: 58 },
  { id: "vsDuel",    label: "VS DUEL",     x: 470, y: 402, w: 340, h: 58 },
  { id: "howToPlay", label: "HOW TO PLAY", x: 470, y: 464, w: 340, h: 58 },
];

// ── Multiplayer lobby buttons (shared by update hit-test + renderer) ──────────
// Lobby phases: main → searching / room_host / room_join / error
export const MP_LOBBY_BTNS = {
  // main phase
  findMatch:   { id: "findMatch",   label: "FIND MATCH",   x: 470, y: 292, w: 340, h: 56 },
  privateRoom: { id: "privateRoom", label: "PRIVATE ROOM", x: 470, y: 360, w: 340, h: 56 },
  joinByCode:  { id: "joinByCode",  label: "JOIN BY CODE", x: 470, y: 428, w: 340, h: 56 },
  back:        { id: "back",        label: "← BACK",       x: 500, y: 498, w: 280, h: 48 },
  // searching / room_host phases
  cancel:      { id: "cancel",      label: "CANCEL",       x: 500, y: 412, w: 280, h: 54 },
  // room_join phase (code field is drawn above; JOIN sits below it)
  joinSubmit:  { id: "joinSubmit",  label: "JOIN",         x: 578, y: 418, w: 200, h: 52 },
  joinBack:    { id: "joinBack",    label: "← BACK",       x: 370, y: 418, w: 180, h: 52 },
};

export const MP_RESULT_BTNS = [
  { id: "rematch", label: "REMATCH",   x: 390, y: 452, w: 240, h: 60 },
  { id: "menu",    label: "MAIN MENU", x: 650, y: 452, w: 240, h: 60 },
];

// ── Multiplayer tuning (1v1 Dodgeball) ────────────────────────────────────────
export const MP_TUNING = {
  hp:                     100,
  laserDmg:               6,
  lobDmg:                 22,
  laserHeat:              18,
  lobHeat:                8,
  heatDecayPerMs:         0.035,
  burnoutThreshold:       100,
  burnoutResetThreshold:  35,
  fireCooldownMs:         130,
  lobCooldownMs:          380,
  roundTimerMs:           45000,
  roundsToWin:            2,       // Bo3
  countdownMs:            4000,    // ms from match_ready to fight start
  laserSpeedZ:            0.028,
  lobSpeedZ:              0.009,
  hitWindowX:             42,
};

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
