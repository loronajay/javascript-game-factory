function createInitialGameState({ createPlayer, createPlatforms, defaultLayout = 'single' }) {
  return {
    phase: 'menu',
    roundTarget: 2,
    roundNum: 0,
    p1: createPlayer('p1'),
    p2: createPlayer('p2'),
    p1Projectile: null,
    p2Projectile: null,
    gridlock: null,
    effects: [],
    clashFlash: 0,
    deathFlash: 0,
    roundStartTick: 0,
    roundEnd: null,
    pendingRoundEnd: null,
    platforms: createPlatforms(defaultLayout),
  };
}

function resetMatchProgress(gameState) {
  gameState.p1.wins = 0;
  gameState.p2.wins = 0;
  gameState.roundNum = 0;
  gameState.roundEnd = null;
  gameState.pendingRoundEnd = null;
}

function prepareRoundState(gameState, {
  camera,
  createPlatforms,
  isOnline,
  onlineMatchSeed,
  pickOnlineStage,
  resetCamera,
  resetPlayer,
  selectedLayout,
}) {
  gameState.phase = 'round_start';
  gameState.roundStartTick = 0;
  gameState.platforms = isOnline
    ? createPlatforms(pickOnlineStage(onlineMatchSeed, gameState.roundNum))
    : createPlatforms(selectedLayout);
  gameState.p1Projectile = null;
  gameState.p2Projectile = null;
  gameState.gridlock = null;
  gameState.effects = [];
  gameState.clashFlash = 0;
  gameState.deathFlash = 0;
  gameState.pendingRoundEnd = null;
  resetPlayer(gameState.p1);
  resetPlayer(gameState.p2);
  gameState.p1.inputsLocked = true;
  gameState.p2.inputsLocked = true;
  resetCamera(camera);
}

export { createInitialGameState, prepareRoundState, resetMatchProgress };
