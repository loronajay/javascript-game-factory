function saveGameState(gameState) {
  const { p1, p2 } = gameState;
  return {
    phase: gameState.phase,
    roundNum: gameState.roundNum,
    roundStartTick: gameState.roundStartTick,
    clashFlash: gameState.clashFlash,
    deathFlash: gameState.deathFlash,
    platforms: gameState.platforms.map(platform => ({ ...platform })),
    p1Proj: gameState.p1Projectile ? { ...gameState.p1Projectile } : null,
    p2Proj: gameState.p2Projectile ? { ...gameState.p2Projectile } : null,
    gridlock: gameState.gridlock ? { ...gameState.gridlock } : null,
    effects: gameState.effects.map(effect => ({ ...effect })),
    roundEnd: gameState.roundEnd ? { ...gameState.roundEnd } : null,
    p1: { ...p1, platformRef: null, _platIdx: p1.platformRef ? gameState.platforms.indexOf(p1.platformRef) : -1 },
    p2: { ...p2, platformRef: null, _platIdx: p2.platformRef ? gameState.platforms.indexOf(p2.platformRef) : -1 },
  };
}

function loadGameState(gameState, snap) {
  if (!snap) return;
  gameState.phase = snap.phase;
  gameState.roundNum = snap.roundNum;
  gameState.roundStartTick = snap.roundStartTick;
  gameState.clashFlash = snap.clashFlash;
  gameState.deathFlash = snap.deathFlash;
  gameState.platforms = snap.platforms.map(platform => ({ ...platform }));
  gameState.p1Projectile = snap.p1Proj ? { ...snap.p1Proj } : null;
  gameState.p2Projectile = snap.p2Proj ? { ...snap.p2Proj } : null;
  gameState.gridlock = snap.gridlock ? { ...snap.gridlock } : null;
  gameState.effects = snap.effects.map(effect => ({ ...effect }));
  gameState.roundEnd = snap.roundEnd ? { ...snap.roundEnd } : null;
  Object.assign(gameState.p1, snap.p1);
  gameState.p1.platformRef = snap.p1._platIdx >= 0 ? gameState.platforms[snap.p1._platIdx] : null;
  Object.assign(gameState.p2, snap.p2);
  gameState.p2.platformRef = snap.p2._platIdx >= 0 ? gameState.platforms[snap.p2._platIdx] : null;
}

export { loadGameState, saveGameState };
