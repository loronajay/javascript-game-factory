export const W = 1280;
export const H = 720;
export const CX = W * 0.5;
export const HORIZON_Y = H * 0.37;
export const RETICLE_Y = H * 0.49;

export const STATE = {
  MENU: "MENU",
  HOW_TO_PLAY: "HOW_TO_PLAY",
  BOSS_PRACTICE_SELECT: "BOSS_PRACTICE_SELECT",
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
// Total number of authored bosses — update when adding a new boss.
export const TOTAL_BOSSES = 3;

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
  hitFreezeMs: 50,

  // ── Curse (phantom backfire) ──────────────────────────────────────────────
  curseDurationMs: 4000,
  curseSpeedMultiplier: 0.55,
  curseFireMultiplier: 2.0,

  // ── Phantom phase cycle ───────────────────────────────────────────────────
  phantomMaterialMs: 4200,
  phantomPhasingOutMs: 340,
  phantomInvisMs: 1800,
  phantomPhasingInMs: 260,

  // ── Tracer homing ─────────────────────────────────────────────────────────
  homingStrength: 0.038,

  // ── Caster bloom ─────────────────────────────────────────────────────────
  bloomDetonateZ: 1.05,
  bloomSpeedMult: 0.60,
  bloomFragmentSpeedMult: 1.25,

  // ── Overseer sub-boss laser ───────────────────────────────────────────────
  overseerChargeMs: 1400,
  overseerLockMs: 500,
  overseerFireMs: 600,
  overseerVulnerableMs: 900,
  overseerCooldownMs: 2000,
  overseerBeamWidth: 70,

  // ── Regenerator ───────────────────────────────────────────────────────────
  regenIntervalMs: 3500
};

// ─── Boss 02 tuning (The Arbiter) ────────────────────────────────────────────
export const ARBITER_TUNING = {
  introMs: 2200,
  transitionMs: 1300,
  defeatMs: 2600,

  bodyZ: 1.7,
  bodyY: -130,

  volleyDiamondZ: 0.72,    // Z depth for telegraph diamonds — far enough back to keep all 5 on-screen

  phase1: {
    hits: 20,
    chargeMs: 900,
    fireMs: 220,
    openMs: 750,
    resetMs: 500,
    safeLanes: 1,          // how many safe lanes left uncovered
    safeHitWindow: 72,     // px from safe lane center to count as dodged
    coreHitWindow: 60,     // px from center lane to score a core hit
    wingHitWindow: 60      // px from lane ±90 to score a wing-core hit (phase 1 only)
  },

  phase2: {
    hits: 22,
    chargeMs: 1050,        // how long the column fills build up before firing
    fireMs: 300,           // duration of the actual cannon blast
    openMs: 860,           // punish window — generous so far-lane dodge + center dash is always fair
    resetMs: 520,          // cooldown before next barrage
    safeLanes: 1,
    safeHitWindow: 72,
    coreHitWindow: 60
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

// ─── Boss 03 tuning (ECLIPSIS) ────────────────────────────────────────────────
export const ECLIPSIS_TUNING = {
  introMs:      2400,
  transitionMs: 1400,
  defeatMs:     2800,

  bodyZ: 1.75,
  bodyY: -115,

  eyeHitWindow:   68,   // px from world x=0 for eye hit (phases 2+)
  panelHitWindow: 180,  // generous — panels span the whole body (phase 1)

  phase1: { hits: 15 },
  phase2: { hits: 18 },
  phase3: { hits: 20 },
  phase4: { hits: 24 },
  phase5: { hits: 30 },

  // ── Mechanic A — Sweeping Beam ────────────────────────────────────────────
  beamChargeMs:       900,   // eye charges + direction cue
  beamSweepMsPerLane: 240,   // time spent per lane during sweep
  beamVulnMs:         1100,  // vulnerable window immediately after sweep
  beamHalfWidth:      58,    // world-x proximity to current lane = hit
  // idle cooldown before next beam, indexed by phase-1:
  beamCadenceMs: [3000, 2600, 2200, 1800, 1400],

  // ── Mechanic B — Reflective Phase ─────────────────────────────────────────
  reflectImmuneMs: 2000,
  reflectVulnMs:   1100,
  reflectCadenceMs: [99999, 4000, 3500, 3000, 2200],

  // ── Mechanic C — Gravity Tether ───────────────────────────────────────────
  tetherTelegraphMs: 700,
  tetherSpeedZ:      0.0055,  // z-units per ms
  tetherDetonateZ:   0.18,
  tetherHitWindow:   58,      // lane window to shoot projectile down
  tetherDragForce:   0.38,    // speed-units/frame bias toward target lane
  tetherDurationMs:  3000,
  tetherCadenceMs: [99999, 99999, 5000, 4000, 3000],

  // ── Mechanic D — Zone Denial Shot ─────────────────────────────────────────
  zoneChargeTelegraphMs: 1100,
  zoneSpeedZ:            0.0045,
  zoneDetonateZ:         0.19,
  zoneLaneHalfWidth:     45,  // per-lane hit window on detonation
  zoneAftermathMs:       900,
  zoneCadenceMs: [99999, 99999, 99999, 5500, 3500],

  // ── Direct shots ──────────────────────────────────────────────────────────
  shotCadenceMs: [2500, 2200, 1800, 1400, 1000],

  // ── Shared windows ────────────────────────────────────────────────────────
  eyeVulnMs:   1100,  // how long eye stays exposed (phases 2+)
  panelVulnMs: 1000   // how long panels stay exposed (phase 1)
};

// Button layout — shared by render and game hit-testing so coords stay in sync.
// All positions are in logical canvas space (1280×720).

export const MENU_BTNS = [
  { id: "campaign",      label: "CAMPAIGN",       x: 470, y: 258, w: 340, h: 50 },
  { id: "bossRush",      label: "BOSS RUSH",      x: 470, y: 312, w: 340, h: 50 },
  { id: "bossPractice",  label: "BOSS PRACTICE",  x: 470, y: 366, w: 340, h: 50 },
  { id: "vsDuel",        label: "VS DUEL",        x: 470, y: 420, w: 340, h: 50 },
  { id: "howToPlay",     label: "HOW TO PLAY",    x: 470, y: 474, w: 340, h: 50 },
];

export const BOSS_PRACTICE_BTNS = [
  { id: "boss1", label: "BOSS 01  ·  DREADMAW",     x: 440, y: 260, w: 400, h: 58 },
  { id: "boss2", label: "BOSS 02  ·  THE ARBITER",  x: 440, y: 328, w: 400, h: 58 },
  { id: "boss3", label: "BOSS 03  ·  ECLIPSIS",     x: 440, y: 396, w: 400, h: 58 },
  { id: "back",  label: "← BACK",                   x: 500, y: 476, w: 280, h: 48 },
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
