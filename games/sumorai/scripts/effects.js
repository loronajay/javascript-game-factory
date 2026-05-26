function spawnChingEffect(gameState, x, y) {
  gameState.clashFlash = 1;
  gameState.effects.push({ type: 'ching', x, y, frame: 0, timer: 0, maxFrames: 5, ticksPerFrame: 1 });
}

function spawnBloodEffect(gameState, x, y, flip) {
  gameState.effects.push({ type: 'blood', x, y, frame: 0, timer: 0, maxFrames: 8, flip });
}

function tickEffects(gameState) {
  gameState.clashFlash = Math.max(0, gameState.clashFlash - 0.14);
  gameState.deathFlash = Math.max(0, gameState.deathFlash - 0.06);
  for (const fx of gameState.effects) {
    fx.timer++;
    if (fx.timer % (fx.ticksPerFrame ?? 3) === 0) fx.frame++;
  }
  gameState.effects = gameState.effects.filter(fx => fx.frame < fx.maxFrames);
}

export { spawnBloodEffect, spawnChingEffect, tickEffects };
