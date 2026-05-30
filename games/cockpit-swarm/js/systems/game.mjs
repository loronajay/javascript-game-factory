import { H, STATE, TUNING, BOSS_EVERY, MENU_BTNS, HTP_BTNS, END_BTNS_GAMEOVER, END_BTNS_CLEAR } from "../core/constants.mjs";
import { initMpLobby, updateMpLobby, updateMpCountdown, updateMpFighting, updateMpResult } from "./mp-controller.mjs";
import {
  sfxClick, sfxExplosion, sfxPlayerHurt, sfxShutdown,
  sfxShoot, sfxEnemyDeath,
  startMenuMusic, startGameMusic
} from "./audio.mjs";
import { clamp } from "../core/math.mjs";
import {
  advanceActiveRow,
  getActiveEnemies,
  hasLivingEnemies,
  makeFormation,
  shouldAdvanceActiveRow
} from "../entities/enemy.mjs";
import { makeStars } from "../entities/stars.mjs";
import { project, projectEnemyBullet, getPlayerShotWorldX } from "./projection.mjs";
import { spawnExplosion, spawnMissSpark } from "../entities/particles.mjs";
import { getStage, hasNextStage } from "./stages.mjs";
import { updateWaveBehavior } from "./wave-behaviors.mjs";
import { startBossEncounter, updateBoss, tryDamageBossInShotLane } from "./boss.mjs";
import {
  applySplashShotDamage,
  canHoldToShoot,
  getSpeedMultiplier,
  maybeSpawnPowerupFromEnemyKill,
  resetPowerups,
  tryActivatePowerupInShotLane,
  updatePowerups
} from "./powerup-system.mjs";

// ─── Menu state init (called on first load) ──────────────────────────────────

export function initMenuState(game) {
  game.state = STATE.MENU;
  game.menu.selectedButton = 0;
  game.stars = makeStars();
  game.player.x = 0;
}

// ─── Full game reset (called when starting a run) ────────────────────────────

export function resetGame(game, fromMenu = false, mode = game.mode || "campaign") {
  startGameMusic(fromMenu);
  game.mode = mode;
  game.state = STATE.PLAYING;
  game.score = 0;
  game.combo = 0;
  game.shotsFired = 0;
  game.shotsHit = 0;
  game.enemyBullets = [];
  game.explosions = [];
  game.boss = null;
  game.messageTimer = 0;
  game.hitFreeze = 0;
  game.shake = 0;
  game.menu.selectedButton = 0;

  game.wave.stageIndex = 0;
  game.wave.behaviorCooldown = 450;
  game.wave.pendingShots = [];
  game.wave.lastBehaviorId = null;
  game.wave.stageClearTimer = 0;

  resetPowerups(game);

  game.player.x = 0;
  game.player.speed = 0;
  game.player.health = game.player.maxHealth;
  game.player.fireCooldown = 0;
  game.player.muzzleFlash = 0;
  game.player.hurtFlash = 0;

  game.stars = makeStars();

  if (mode === "bossRush") {
    // Boss Rush: skip the stage campaign and drop straight into the boss gauntlet.
    // With one boss authored, clearing it clears the rush.
    startBossEncounter(game, 1);
  } else {
    loadStage(game, 0);
  }
}

function loadStage(game, stageIndex) {
  const stage = getStage(stageIndex);

  game.state = STATE.PLAYING;
  game.messageTimer = 0;
  game.enemyBullets = [];
  game.explosions = [];
  game.wave.stageIndex = stageIndex;
  game.wave.behaviorCooldown = 650;
  game.wave.pendingShots = [];
  game.wave.lastBehaviorId = null;
  game.wave.stageClearTimer = 0;

  game.powerups.activePickups = [];

  game.enemies = makeFormation(stage);
}

// ─── Main update router ───────────────────────────────────────────────────────

export function updateGame(game, input, dt, t) {
  if (game.state === STATE.MENU) {
    updateMenu(game, input);
    return;
  }

  if (game.state === STATE.HOW_TO_PLAY) {
    updateHowToPlay(game, input);
    return;
  }

  if (game.state === STATE.MP_LOBBY) {
    updateMpLobby(game, input);
    return;
  }

  if (game.state === STATE.MP_COUNTDOWN) {
    updateMpCountdown(game, input);
    return;
  }

  if (game.state === STATE.MP_FIGHTING) {
    updateMpFighting(game, input, dt);
    updateParticles(game, dt);
    return;
  }

  if (game.state === STATE.MP_RESULT) {
    updateMpResult(game, input);
    updateParticles(game, dt);
    return;
  }

  if (game.state === STATE.GAME_OVER || game.state === STATE.CLEAR) {
    updateEndScreen(game, input, dt);
    updateParticles(game, dt);
    return;
  }

  // ─── In-game update ───────────────────────────────────────────────────────

  if (game.hitFreeze > 0) {
    game.hitFreeze -= dt;
    return;
  }

  updatePlayer(game, input, dt);
  updatePowerups(game, dt);

  if (game.state === STATE.BOSS) {
    updateBoss(game, input, dt, t, damagePlayer);
    updatePlayerFire(game, input);
    updateParticles(game, dt);
    return;
  }

  if (game.state === STATE.STAGE_CLEAR) {
    updateStageClear(game, dt);
    updateParticles(game, dt);
    return;
  }

  if (game.state !== STATE.PLAYING) {
    game.messageTimer += dt;
    updateParticles(game, dt);
    return;
  }

  updateEnemies(game, dt, t);
  updateWaveBehavior(game, dt);
  updateEnemyBullets(game, input, dt);
  updatePlayerFire(game, input);
  updateParticles(game, dt);
  checkRowAndEndState(game);
}

// ─── Shared menu transition helper ───────────────────────────────────────────

function goToMenu(game, input) {
  game.state = STATE.MENU;
  game.menu.selectedButton = 0;
  game.player.hurtFlash = 0;
  game.player.muzzleFlash = 0;
  game.shake = 0;
  input.clearMenuPresses();
  startMenuMusic();
}

// ─── Menu screen ─────────────────────────────────────────────────────────────

function updateMenu(game, input) {
  const btns = MENU_BTNS;

  if (input.consumeUp())   game.menu.selectedButton = Math.max(0, game.menu.selectedButton - 1);
  if (input.consumeDown()) game.menu.selectedButton = Math.min(btns.length - 1, game.menu.selectedButton + 1);

  const mp = input.getMousePos();
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
      game.menu.selectedButton = i;
    }
  }

  let activated = -1;
  const click = input.consumeClick();
  if (click) {
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (click.x >= b.x && click.x < b.x + b.w && click.y >= b.y && click.y < b.y + b.h) {
        activated = i;
      }
    }
  }
  if (input.consumeConfirm() || input.consumeFirePress()) activated = game.menu.selectedButton;

  if (activated === 0) {
    sfxClick();
    resetGame(game, true, "campaign");
    input.clearMenuPresses();
  } else if (activated === 1) {
    sfxClick();
    resetGame(game, true, "bossRush");
    input.clearMenuPresses();
  } else if (activated === 2) {
    sfxClick();
    initMpLobby(game, input);
  } else if (activated === 3) {
    sfxClick();
    game.state = STATE.HOW_TO_PLAY;
    game.menu.selectedButton = 0;
    input.clearMenuPresses();
  }
}

// ─── How to play screen ───────────────────────────────────────────────────────

function updateHowToPlay(game, input) {
  const btn = HTP_BTNS[0];

  const mp = input.getMousePos();
  if (mp.x >= btn.x && mp.x < btn.x + btn.w && mp.y >= btn.y && mp.y < btn.y + btn.h) {
    game.menu.selectedButton = 0;
  }

  let activated = false;
  const click = input.consumeClick();
  if (click && click.x >= btn.x && click.x < btn.x + btn.w && click.y >= btn.y && click.y < btn.y + btn.h) {
    activated = true;
  }
  if (input.consumeConfirm() || input.consumeFirePress() || input.consumeBack()) activated = true;

  if (activated) {
    sfxClick();
    goToMenu(game, input);
  }
}

// ─── End screen (game over / sector clear) ────────────────────────────────────

function updateEndScreen(game, input, dt) {
  // Decay shake and flashes so the overlay is readable
  game.shake *= Math.pow(TUNING.cockpitShakeDecay, dt / 16.666);
  game.player.hurtFlash  = Math.max(0, game.player.hurtFlash  - dt);
  game.player.muzzleFlash = Math.max(0, game.player.muzzleFlash - dt);

  const btns = game.state === STATE.GAME_OVER ? END_BTNS_GAMEOVER : END_BTNS_CLEAR;

  if (input.consumeUp() || input.consumeDown()) {
    game.menu.selectedButton = (game.menu.selectedButton + 1) % btns.length;
  }

  const mp = input.getMousePos();
  for (let i = 0; i < btns.length; i++) {
    const b = btns[i];
    if (mp.x >= b.x && mp.x < b.x + b.w && mp.y >= b.y && mp.y < b.y + b.h) {
      game.menu.selectedButton = i;
    }
  }

  let activated = -1;
  const click = input.consumeClick();
  if (click) {
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (click.x >= b.x && click.x < b.x + b.w && click.y >= b.y && click.y < b.y + b.h) {
        activated = i;
      }
    }
  }
  if (input.consumeConfirm()) activated = game.menu.selectedButton;
  if (input.consumeBack()) { sfxClick(); goToMenu(game, input); return; }

  if (activated === 0) {
    sfxClick();
    resetGame(game);
    input.clearMenuPresses();
  } else if (activated === 1) {
    sfxClick();
    goToMenu(game, input);
  }
}

// ─── Stage clear transition ───────────────────────────────────────────────────

function updateStageClear(game, dt) {
  game.wave.stageClearTimer -= dt;

  if (game.wave.stageClearTimer > 0) return;

  // Boss gate: a boss fires after every Nth stage of the block.
  const clearedStageNumber = game.wave.stageIndex + 1;
  if (clearedStageNumber % BOSS_EVERY === 0) {
    startBossEncounter(game, clearedStageNumber / BOSS_EVERY);
    return;
  }

  if (hasNextStage(game.wave.stageIndex)) {
    loadStage(game, game.wave.stageIndex + 1);
    return;
  }

  game.state = STATE.CLEAR;
  game.menu.selectedButton = 0;
  game.messageTimer = 0;
  game.shake = 0;
  game.player.hurtFlash = 0;
  game.player.muzzleFlash = 0;
}

// ─── Player ───────────────────────────────────────────────────────────────────

function updatePlayer(game, input, dt) {
  const player = game.player;
  const left = input.isLeft();
  const right = input.isRight();
  const speedMultiplier = getSpeedMultiplier(game);

  if (left && !right) player.speed -= TUNING.playerAccel * speedMultiplier * (dt / 16.666);
  if (right && !left) player.speed += TUNING.playerAccel * speedMultiplier * (dt / 16.666);

  if (!left && !right) player.speed *= Math.pow(TUNING.playerFriction, dt / 16.666);
  else player.speed *= Math.pow(0.965, dt / 16.666);

  player.speed = clamp(
    player.speed,
    -TUNING.playerMaxSpeed * speedMultiplier,
    TUNING.playerMaxSpeed * speedMultiplier
  );

  player.x += player.speed * (dt / 16.666);
  player.x = clamp(player.x, -TUNING.playerMaxX, TUNING.playerMaxX);

  if ((player.x <= -TUNING.playerMaxX && player.speed < 0) || (player.x >= TUNING.playerMaxX && player.speed > 0)) {
    player.speed *= -0.16;
  }

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.muzzleFlash  = Math.max(0, player.muzzleFlash  - dt);
  player.hurtFlash    = Math.max(0, player.hurtFlash    - dt);
  game.shake *= Math.pow(TUNING.cockpitShakeDecay, dt / 16.666);
}

// ─── Enemies ──────────────────────────────────────────────────────────────────

function updateEnemies(game, dt, t) {
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;

    enemy.y += (enemy.targetY - enemy.y) * Math.min(1, 0.085 * (dt / 16.666));
    enemy.z += (enemy.targetZ - enemy.z) * Math.min(1, 0.085 * (dt / 16.666));

    const driftAmount = enemy.active ? TUNING.enemyDriftAmount : TUNING.enemyDriftAmount * 0.28;
    const drift = Math.sin(t * TUNING.enemyDriftSpeed + enemy.driftPhase) * driftAmount;

    enemy.x = enemy.originX + drift;
    enemy.rot = Math.sin(t * 0.002 + enemy.driftPhase) * 0.08;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.telegraphFlash = Math.max(0, enemy.telegraphFlash - dt);
  }
}

// ─── Enemy bullets ────────────────────────────────────────────────────────────

function updateEnemyBullets(game, input, dt) {
  const step = dt / 16.666;

  for (const b of game.enemyBullets) {
    if (!b.alive) continue;

    b.age += dt;
    b.z -= b.speedZ * step;

    const p = projectEnemyBullet(b, game.player);

    if (b.z <= TUNING.enemyBulletHitDepth && !b.resolved) {
      b.resolved = true;

      if (p.laneDistance <= TUNING.enemyBulletLaneHitWindow) {
        damagePlayer(game, input);
      } else {
        spawnMissSpark(game, p.x, p.y);
      }

      b.alive = false;
    }
  }

  game.enemyBullets = game.enemyBullets.filter(b => b.alive);
}

function damagePlayer(game, input) {
  const player = game.player;

  player.health -= 1;
  player.hurtFlash = 260;
  game.shake = 10;
  game.hitFreeze = TUNING.hitFreezeMs;
  game.combo = 0;

  sfxPlayerHurt();
  spawnExplosion(game, 640 + (Math.random() * 60 - 30), H * 0.72 + (Math.random() * 36 - 18), 1.2, "hit");

  if (player.health <= 0) {
    sfxExplosion();
    sfxShutdown();
    game.state = STATE.GAME_OVER;
    game.menu.selectedButton = 0;
    game.messageTimer = 0;
    input.clearMenuPresses();
  }
}

// ─── Player fire ──────────────────────────────────────────────────────────────

function updatePlayerFire(game, input) {
  const player = game.player;

  const wantsTapShot  = input.consumeFirePress();
  const wantsHeldShot = canHoldToShoot(game) && input.isFireHeld();
  const wantsShot     = wantsTapShot || wantsHeldShot;

  if (!wantsShot) return;
  if (player.fireCooldown > 0) return;

  player.fireCooldown = TUNING.fireCooldownMs;
  player.muzzleFlash  = 70;
  game.shotsFired++;

  sfxShoot();

  // Boss fight: shots can only damage exposed weak spots / open mouth.
  if (game.state === STATE.BOSS) {
    if (tryDamageBossInShotLane(game)) return;
    game.combo = Math.max(0, game.combo - 1);
    return;
  }

  const shotX = getPlayerShotWorldX(player);
  let best = null;
  let bestLaneDistance = Infinity;

  for (const enemy of getActiveEnemies(game.enemies)) {
    const dx = Math.abs(enemy.x - shotX);
    const hitX = TUNING.enemyBulletLaneHitWindow;

    if (dx <= hitX && dx < bestLaneDistance) {
      best = enemy;
      bestLaneDistance = dx;
    }
  }

  if (best) {
    const killed = damageEnemy(game, best);
    applySplashShotDamage(game, best, (enemy, options) => damageEnemy(game, enemy, options));

    if (killed) {
      const stage = getStage(game.wave.stageIndex);
      maybeSpawnPowerupFromEnemyKill(game, best, stage);
    }

    return;
  }

  if (tryActivatePowerupInShotLane(game)) {
    game.shotsHit++;
    return;
  }

  game.combo = Math.max(0, game.combo - 1);
}

function damageEnemy(game, enemy, options = {}) {
  if (!enemy.alive) return false;

  enemy.hp -= 1;
  enemy.hitFlash = 120;
  game.shotsHit++;
  game.combo++;

  const scoreMultiplier = options.scoreMultiplier ?? 1;
  game.score += Math.round((100 + game.combo * 15) * scoreMultiplier);

  const p = project(enemy.x, enemy.y, enemy.z, game.player.x);
  spawnExplosion(game, p.x, p.y, options.isSplash ? 0.42 : 0.65, options.isSplash ? "powerup" : "enemyHit");

  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.active = false;
    game.score += Math.round((enemy.scoreValue + game.combo * 25) * scoreMultiplier);
    sfxEnemyDeath();
    spawnExplosion(game, p.x, p.y, options.isSplash ? 0.72 : 1.05, "enemyKill");
    return true;
  }

  return false;
}

// ─── Particles ────────────────────────────────────────────────────────────────

function updateParticles(game, dt) {
  for (const p of game.explosions) {
    p.life -= dt;
    p.x += p.vx * (dt / 16.666);
    p.y += p.vy * (dt / 16.666);
    p.vx *= Math.pow(0.96, dt / 16.666);
    p.vy *= Math.pow(0.96, dt / 16.666);
  }

  game.explosions = game.explosions.filter(p => p.life > 0);
}

// ─── Row / end-state check ────────────────────────────────────────────────────

function checkRowAndEndState(game) {
  if (!hasLivingEnemies(game.enemies)) {
    game.state = STATE.STAGE_CLEAR;
    game.messageTimer = 0;
    game.enemyBullets = [];
    game.wave.pendingShots = [];
    game.powerups.activePickups = [];
    game.wave.stageClearTimer = TUNING.stageClearDelayMs;
    return;
  }

  if (shouldAdvanceActiveRow(game.enemies)) {
    game.enemyBullets = [];
    game.wave.pendingShots = [];
    game.powerups.activePickups = [];
    advanceActiveRow(game.enemies);
  }
}
