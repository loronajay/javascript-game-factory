function tickSimulationStep({
  PROJ_SHIELD_KNOCKBACK,
  applyPhysics,
  camera,
  checkHitboxVsProjectile,
  checkProjectileClash,
  checkProjectileVsPlayer,
  createGridlockState,
  createProjectile,
  gameState,
  getAttackHitbox,
  getDashHitbox,
  isAttackActive,
  isDashAttackActive,
  isOnline,
  onlineClient,
  onlinePartnerEnd,
  onlinePartnerGraceTicks,
  p1In,
  p2In,
  playSound,
  resolveHits,
  resimulating,
  setOnlinePartnerEnd,
  setOnlinePartnerGraceTicks,
  spawnChing,
  stepAnimation,
  tickGridlock,
  tickProjectile,
  tickVisualEffects,
  triggerRoundEnd,
  updateCamera,
  updatePlatforms,
}) {
  if (gameState.gridlock) {
    tickVisualEffects(gameState);
    const result = tickGridlock(gameState.gridlock, gameState.p1, gameState.p2, p1In, p2In);
    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);
    if (result?.resolved) {
      playSound('gridlock_end');
      gameState.gridlock = null;
      gameState.p1.inGridlock = false;
      gameState.p2.inGridlock = false;
      gameState.p1.inputsLocked = false;
      gameState.p2.inputsLocked = false;
    }
    return;
  }

  tickVisualEffects(gameState);
  updatePlatforms(gameState.platforms);

  const p1WasCharging = gameState.p1.dashCharge > 0;
  const p2WasCharging = gameState.p2.dashCharge > 0;
  const p1WasBlocking = gameState.p1.blocking;
  const p2WasBlocking = gameState.p2.blocking;
  const p1WasAttacking = gameState.p1.attackTimer > 0;
  const p2WasAttacking = gameState.p2.attackTimer > 0;
  const p1WasDashAtk = isDashAttackActive(gameState.p1);
  const p2WasDashAtk = isDashAttackActive(gameState.p2);

  const p1Result = applyPhysics(gameState.p1, p1In, gameState.platforms);
  const p2Result = applyPhysics(gameState.p2, p2In, gameState.platforms);

  if (!p1WasCharging && gameState.p1.dashCharge > 0) playSound('dash');
  if (!p2WasCharging && gameState.p2.dashCharge > 0) playSound('dash');
  if (!p1WasBlocking && gameState.p1.blocking) playSound('shield');
  if (!p2WasBlocking && gameState.p2.blocking) playSound('shield');
  if (!p1WasAttacking && gameState.p1.attackTimer > 0 && gameState.p1.throwing) playSound('throw');
  if (!p2WasAttacking && gameState.p2.attackTimer > 0 && gameState.p2.throwing) playSound('throw');
  if (!p1WasDashAtk && isDashAttackActive(gameState.p1)) playSound('swing');
  if (!p2WasDashAtk && isDashAttackActive(gameState.p2)) playSound('swing');

  if (gameState.p1.wantsProjectile && !gameState.p1Projectile) {
    gameState.p1Projectile = createProjectile('p1', gameState.p1.x + gameState.p1.facing * 24, gameState.p1.y, gameState.p1.facing);
  }
  if (gameState.p2.wantsProjectile && !gameState.p2Projectile) {
    gameState.p2Projectile = createProjectile('p2', gameState.p2.x + gameState.p2.facing * 24, gameState.p2.y, gameState.p2.facing);
  }

  if (gameState.p1Projectile?.active) tickProjectile(gameState.p1Projectile);
  if (gameState.p2Projectile?.active) tickProjectile(gameState.p2Projectile);

  if (checkProjectileClash(gameState.p1Projectile, gameState.p2Projectile)) {
    spawnChing(
      (gameState.p1Projectile.x + gameState.p2Projectile.x) / 2,
      (gameState.p1Projectile.y + gameState.p2Projectile.y) / 2,
    );
    gameState.p1Projectile.active = false;
    gameState.p2Projectile.active = false;
  }

  const p1Box = isAttackActive(gameState.p1) ? getAttackHitbox(gameState.p1)
    : isDashAttackActive(gameState.p1) ? getDashHitbox(gameState.p1)
      : null;
  const p2Box = isAttackActive(gameState.p2) ? getAttackHitbox(gameState.p2)
    : isDashAttackActive(gameState.p2) ? getDashHitbox(gameState.p2)
      : null;
  if (p1Box && checkHitboxVsProjectile(p1Box, gameState.p2Projectile)) {
    spawnChing(gameState.p2Projectile.x, gameState.p2Projectile.y);
    gameState.p2Projectile.active = false;
  }
  if (p2Box && checkHitboxVsProjectile(p2Box, gameState.p1Projectile)) {
    spawnChing(gameState.p1Projectile.x, gameState.p1Projectile.y);
    gameState.p1Projectile.active = false;
  }

  let projKillP1 = false;
  if (gameState.p2Projectile?.active) {
    const facing = gameState.p2Projectile.facing;
    const result = checkProjectileVsPlayer(gameState.p2Projectile, gameState.p1);
    if (result) {
      gameState.p2Projectile.active = false;
      if (result === 'block') {
        gameState.p1.speedX = facing * PROJ_SHIELD_KNOCKBACK;
        gameState.p1.stamina = Math.max(0, gameState.p1.stamina - 3);
        spawnChing(gameState.p1.x, gameState.p1.y);
      } else {
        projKillP1 = true;
        playSound('proj_hit');
      }
    }
  }

  let projKillP2 = false;
  if (gameState.p1Projectile?.active) {
    const facing = gameState.p1Projectile.facing;
    const result = checkProjectileVsPlayer(gameState.p1Projectile, gameState.p2);
    if (result) {
      gameState.p1Projectile.active = false;
      if (result === 'block') {
        gameState.p2.speedX = facing * PROJ_SHIELD_KNOCKBACK;
        gameState.p2.stamina = Math.max(0, gameState.p2.stamina - 3);
        spawnChing(gameState.p2.x, gameState.p2.y);
      } else {
        projKillP2 = true;
        playSound('proj_hit');
      }
    }
  }

  const combatResult = resolveHits(gameState.p1, gameState.p2);

  if (combatResult && !combatResult.gridlock) {
    if (combatResult.p1HitP2) {
      playSound(gameState.p1.dashBursting ? 'dash2' : 'hit');
      if (combatResult.p2Killed) {
        playSound('hurt');
      } else {
        spawnChing(gameState.p2.x, gameState.p2.y);
      }
    }
    if (combatResult.p2HitP1) {
      playSound(gameState.p2.dashBursting ? 'dash2' : 'hit');
      if (combatResult.p1Killed) {
        playSound('hurt');
      } else {
        spawnChing(gameState.p1.x, gameState.p1.y);
      }
    }
  }

  const p1WasSwingActive = isAttackActive(gameState.p1);
  const p2WasSwingActive = isAttackActive(gameState.p2);

  stepAnimation(gameState.p1);
  stepAnimation(gameState.p2);

  if (!p1WasSwingActive && isAttackActive(gameState.p1)) playSound('swing');
  if (!p2WasSwingActive && isAttackActive(gameState.p2)) playSound('swing');

  updateCamera(camera, gameState.p1, gameState.p2);

  if (gameState.p1Projectile && !gameState.p1Projectile.active) gameState.p1Projectile = null;
  if (gameState.p2Projectile && !gameState.p2Projectile.active) gameState.p2Projectile = null;

  if (combatResult?.gridlock) {
    spawnChing(
      (gameState.p1.x + gameState.p2.x) / 2,
      (gameState.p1.y + gameState.p2.y) / 2,
    );
    gameState.gridlock = createGridlockState();
    for (const player of [gameState.p1, gameState.p2]) {
      player.inGridlock = true;
      player.inputsLocked = true;
      player.dashBursting = false;
      player.dashBurstTimer = 0;
      player.dashRecovering = false;
      player.dashRecoveryTimer = 0;
      player.speedX = 0;
    }
    return;
  }

  const p1Dead = p1Result === 'dead' || combatResult?.p1Killed || projKillP1;
  const p2Dead = p2Result === 'dead' || combatResult?.p2Killed || projKillP2;

  if (p1Dead || p2Dead) {
    if (p1Dead) {
      gameState.p1.dead = p1Result === 'dead';
      gameState.p1.inputsLocked = true;
    }
    if (p2Dead) {
      gameState.p2.dead = p2Result === 'dead';
      gameState.p2.inputsLocked = true;
    }
    const winner = (p2Dead && !p1Dead) ? 'p1'
      : (p1Dead && !p2Dead) ? 'p2'
        : 'draw';
    const isBlastKill = (p1Dead && p1Result === 'dead') || (p2Dead && p2Result === 'dead');
    setOnlinePartnerEnd(null);
    setOnlinePartnerGraceTicks(0);
    if (!resimulating && isOnline) onlineClient.sendRoundEnd(winner);
    triggerRoundEnd(winner, isBlastKill);
  } else if (onlinePartnerEnd) {
    const nextGraceTicks = onlinePartnerGraceTicks + 1;
    setOnlinePartnerGraceTicks(nextGraceTicks);
    if (nextGraceTicks >= 8) {
      setOnlinePartnerGraceTicks(0);
      if (!resimulating && isOnline) onlineClient.sendRoundEnd(onlinePartnerEnd.winner);
      triggerRoundEnd(onlinePartnerEnd.winner, false);
      setOnlinePartnerEnd(null);
    }
  }
}

export { tickSimulationStep };
