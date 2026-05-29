export const W = 1280;
export const H = 720;
export const CX = W * 0.5;
export const HORIZON_Y = H * 0.37;
export const RETICLE_Y = H * 0.49;

export const STATE = {
  PLAYING: "PLAYING",
  STAGE_CLEAR: "STAGE_CLEAR",
  CLEAR: "CLEAR",
  GAME_OVER: "GAME_OVER"
};

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

export const VERSION_LABEL = "COCKPIT SWARM STAGE ENGINE V1";
