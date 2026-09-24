export const GAME_CONFIG = Object.freeze({
  simulation: Object.freeze({
    tickRate: 60,
    maxFrameMs: 100,
  }),
  arena: Object.freeze({
    radius: 268,
  }),
  paddle: Object.freeze({
    arcRadians: 0.4,
    maxAngularSpeed: 2.7,
    acceleration: 14,
    braking: 18,
  }),
  ball: Object.freeze({
    radius: 10,
    startSpeed: 315,
    hitSpeedIncrease: 32,
    maxSpeed: 675,
    paddleVelocityInfluence: 32,
    contactOffsetInfluence: 105,
  }),
  serve: Object.freeze({
    previewDurationMs: 850,
    reachabilityFactor: 0.72,
    minimumTravelRadians: 0.32,
  }),
  match: Object.freeze({
    scoreToWin: 7,
    winByTwo: false,
    pointPauseMs: 900,
    resetPauseMs: 300,
  }),
  network: Object.freeze({
    interpolationDelayMs: 100,
    snapshotRate: 20,
  }),
});

export const TICK_SECONDS = 1 / GAME_CONFIG.simulation.tickRate;
