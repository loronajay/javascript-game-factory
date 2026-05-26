const ROUND_END_AWARD_TICK = 180;
const ROUND_FADE_TICK = 240;
const ROUND_READY_TICK = 1;
const ROUND_FIGHT_TICK = 90;
const ROUND_ACTIVE_TICK = 150;

const ROUND_END_NO_INPUTS = {
  left: false,
  right: false,
  up: false,
  down: false,
  attack: false,
  dash: false,
  projectile: false,
  attackJustPressed: false,
};

function triggerRoundEndState(gameState, winner, {
  isBlastKill = false,
  playSound,
  spawnBlood,
}) {
  gameState.phase = 'round_end';
  gameState.deathFlash = 1;
  gameState.p1Projectile = null;
  gameState.p2Projectile = null;
  playSound(isBlastKill ? 'explosion' : 'death');

  if (winner === 'draw') {
    for (const player of [gameState.p1, gameState.p2]) {
      lockPlayerForRoundEnd(player);
      if (!player.dead) {
        player.dying = true;
        if (!isBlastKill) spawnBlood(player.x - player.facing * 10, player.y - 14, player.facing === -1);
      }
    }
    gameState.roundEnd = createRoundEnd('draw', null, isBlastKill);
    return;
  }

  const loserSide = winner === 'p1' ? 'p2' : 'p1';
  const loser = gameState[loserSide];
  const winnerPlayer = gameState[winner];

  loser.inputsLocked = true;
  if (!loser.dead) {
    loser.dying = true;
    if (!isBlastKill) spawnBlood(loser.x - loser.facing * 10, loser.y - 14, loser.facing === -1);
  }

  lockPlayerForRoundEnd(winnerPlayer);
  gameState.roundEnd = createRoundEnd(winner, loserSide, isBlastKill);
}

function tickRoundEndState({
  applyPhysics,
  camera,
  createPlatforms,
  document,
  gameState,
  isOnline,
  onlineIsRanked,
  onlineMatchSeed,
  onlineRemoteIdentity,
  p1Label,
  p2Label,
  pickOnlineStage,
  publishOnlineMatchResult,
  resetCamera,
  resetPlayer,
  selectedLayout,
  setTimeout,
  showOnlineResultRating,
  showScreen,
  stepAnimation,
  tickVisualEffects,
  updateCamera,
  updatePlatforms,
}) {
  const roundEnd = gameState.roundEnd;
  updatePlatforms(gameState.platforms);
  tickVisualEffects(gameState);
  applyPhysics(gameState.p1, ROUND_END_NO_INPUTS, gameState.platforms);
  applyPhysics(gameState.p2, ROUND_END_NO_INPUTS, gameState.platforms);
  stepAnimation(gameState.p1);
  stepAnimation(gameState.p2);
  updateCamera(camera, gameState.p1, gameState.p2);
  roundEnd.tick++;

  if (roundEnd.tick === ROUND_END_AWARD_TICK && !roundEnd.triggered) {
    roundEnd.triggered = true;
    if (roundEnd.winner === 'p1') gameState.p1.wins++;
    else if (roundEnd.winner === 'p2') gameState.p2.wins++;

    if (gameState.p1.wins >= gameState.roundTarget || gameState.p2.wins >= gameState.roundTarget) {
      gameState.phase = 'match_end';
      if (isOnline) {
        showOnlineResult({
          document,
          onlineIsRanked,
          onlineRemoteIdentity,
          p1Label,
          p2Label,
          publishOnlineMatchResult,
          roundEnd,
          setTimeout,
          showOnlineResultRating,
          showScreen,
        });
      } else {
        showLocalResult({ document, p1Label, p2Label, roundEnd, setTimeout, showScreen });
      }
    } else {
      prepareNextRoundFade({
        camera,
        createPlatforms,
        gameState,
        isOnline,
        onlineMatchSeed,
        pickOnlineStage,
        resetCamera,
        resetPlayer,
        roundEnd,
        selectedLayout,
      });
    }
  }

  if (roundEnd.fadingIn && roundEnd.tick >= ROUND_FADE_TICK) {
    gameState.phase = 'round_start';
    gameState.roundStartTick = 0;
    gameState.roundEnd = null;
  }
}

function tickRoundStartState({
  camera,
  gameState,
  playSound,
  stepAnimation,
  updateCamera,
  updatePlatforms,
}) {
  gameState.roundStartTick++;
  updatePlatforms(gameState.platforms);
  stepAnimation(gameState.p1);
  stepAnimation(gameState.p2);
  updateCamera(camera, gameState.p1, gameState.p2);

  if (gameState.roundStartTick === ROUND_READY_TICK) playSound('are_you_ready');
  if (gameState.roundStartTick === ROUND_FIGHT_TICK) playSound('fight');

  if (gameState.roundStartTick >= ROUND_ACTIVE_TICK) {
    gameState.phase = 'active';
    gameState.p1.inputsLocked = false;
    gameState.p2.inputsLocked = false;
  }
}

function createRoundEnd(winner, loser, isBlastKill) {
  return {
    winner,
    loser,
    tick: 0,
    triggered: false,
    fadingIn: false,
    isBlastKill,
  };
}

function lockPlayerForRoundEnd(player) {
  player.inputsLocked = true;
  player.attackTimer = 0;
  player.throwing = false;
  player.dashBursting = false;
  player.dashBurstTimer = 0;
  player.dashRecovering = false;
  player.dashRecoveryTimer = 0;
  player.speedX = 0;
}

function showOnlineResult({
  document,
  onlineIsRanked,
  onlineRemoteIdentity,
  p1Label,
  p2Label,
  publishOnlineMatchResult,
  roundEnd,
  setTimeout,
  showOnlineResultRating,
  showScreen,
}) {
  document.getElementById('online-result-winner').textContent =
    roundEnd.winner === 'p1' ? `${p1Label} Wins!` : `${p2Label} Wins!`;
  document.getElementById('online-result-opponent').textContent =
    onlineRemoteIdentity?.displayName ? `vs ${onlineRemoteIdentity.displayName}` : '';
  document.getElementById('ranked-result-rating').hidden = true;
  publishOnlineMatchResult(roundEnd.winner);
  setTimeout(() => {
    showScreen('screen-online-result');
    if (onlineIsRanked) showOnlineResultRating();
  }, 2000);
}

function showLocalResult({ document, p1Label, p2Label, roundEnd, setTimeout, showScreen }) {
  document.getElementById('result-winner').textContent =
    roundEnd.winner === 'p1' ? `${p1Label} Wins!` : `${p2Label} Wins!`;
  setTimeout(() => showScreen('screen-result'), 2000);
}

function prepareNextRoundFade({
  camera,
  createPlatforms,
  gameState,
  isOnline,
  onlineMatchSeed,
  pickOnlineStage,
  resetCamera,
  resetPlayer,
  roundEnd,
  selectedLayout,
}) {
  gameState.roundNum++;
  gameState.platforms = isOnline
    ? createPlatforms(pickOnlineStage(onlineMatchSeed, gameState.roundNum))
    : createPlatforms(selectedLayout);
  gameState.p1Projectile = null;
  gameState.p2Projectile = null;
  gameState.gridlock = null;
  resetPlayer(gameState.p1);
  resetPlayer(gameState.p2);
  gameState.p1.inputsLocked = true;
  gameState.p2.inputsLocked = true;
  resetCamera(camera);
  roundEnd.fadingIn = true;
}

export {
  ROUND_END_NO_INPUTS,
  prepareNextRoundFade,
  tickRoundEndState,
  tickRoundStartState,
  triggerRoundEndState,
};
