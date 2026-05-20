import { loadAssets }               from './scripts/assets.js';
import { createInput }              from './scripts/input.js';
import { LOCAL_2P_BINDINGS }       from './scripts/controls.js';
import { createPlayer, resetPlayer, stepAnimation } from './scripts/player.js';
import { applyPhysics }            from './scripts/physics.js';
import { resolveHits }             from './scripts/combat.js';
import { createGridlockState, tickGridlock } from './scripts/gridlock.js';
import { createProjectile, tickProjectile, checkProjectileVsPlayer, checkProjectileClash, PROJ_SHIELD_KNOCKBACK } from './scripts/projectile.js';
import { createCamera, updateCamera, resetCamera } from './scripts/camera.js';
import { render, setScaleFactor }  from './scripts/renderer.js';
import { VIEWPORT_W, VIEWPORT_H }  from './scripts/stage.js';
import { createPlatforms, updatePlatforms } from './scripts/platforms.js';

const TICK_MS = 1000 / 60;

function initGame() {
  loadAssets(({ sprites, sounds }) => _boot(sounds));
}

function _boot(sounds) {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d');

  // ── Resize ─────────────────────────────────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const sf = Math.min(canvas.width / VIEWPORT_W, canvas.height / VIEWPORT_H);
    setScaleFactor(sf);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── State ──────────────────────────────────────────────────────────────────
  const input  = createInput();
  const camera = createCamera();

  const gameState = {
    phase:      'menu',
    roundTarget: 2,      // wins needed (BO3 = 2, BO5 = 3)
    roundNum:    0,
    p1: createPlayer('p1'),
    p2: createPlayer('p2'),
    p1Projectile: null,
    p2Projectile: null,
    gridlock:    null,
    effects:     [],
    roundEnd:    null,
    platforms:   createPlatforms('single'),
  };

  let bindings = LOCAL_2P_BINDINGS;
  let selectedRounds = 3;   // BO3 default
  let selectedLayout = 'single';

  // ── Screen helpers ─────────────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
    document.getElementById(id).classList.add('screen--active');
  }

  // ── Menu wiring ────────────────────────────────────────────────────────────
  document.getElementById('btn-local').addEventListener('click', () => showScreen('screen-setup'));

  document.querySelectorAll('.round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('round-btn--active'));
      btn.classList.add('round-btn--active');
      selectedRounds = Number(btn.dataset.rounds);
    });
  });

  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('layout-btn--active'));
      btn.classList.add('layout-btn--active');
      selectedLayout = btn.dataset.layout;
    });
  });

  document.getElementById('btn-start-match').addEventListener('click', () => {
    gameState.roundTarget = selectedRounds === 3 ? 2 : 3;
    startMatch();
  });

  document.getElementById('btn-setup-back').addEventListener('click', () => showScreen('screen-menu'));
  document.getElementById('btn-rematch').addEventListener('click', () => startMatch());
  document.getElementById('btn-result-menu').addEventListener('click', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    showScreen('screen-menu');
  });

  // ── Match flow ─────────────────────────────────────────────────────────────
  function startMatch() {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    gameState.roundNum = 0;
    gameState.roundEnd = null;
    startRound();
  }

  function startRound() {
    gameState.roundNum++;
    gameState.phase        = 'active';
    gameState.platforms    = createPlatforms(selectedLayout);
    gameState.p1Projectile = null;
    gameState.p2Projectile = null;
    gameState.gridlock     = null;
    resetPlayer(gameState.p1);
    resetPlayer(gameState.p2);
    resetCamera(camera);
    showScreen('screen-game');
  }

  // ── Round end sequence ─────────────────────────────────────────────────────

  function triggerRoundEnd(winner, isBlastKill = false) {
    gameState.phase = 'round_end';
    const loserSide = winner === 'p1' ? 'p2' : 'p1';
    const loser = gameState[loserSide];
    loser.inputsLocked = true;
    if (!loser.dead) loser.dying = true;
    gameState.roundEnd = {
      winner,
      loser:      loserSide,
      tick:       0,
      triggered:  false,
      fadingIn:   false,
      isBlastKill,
    };
  }

  function tickRoundEnd() {
    const re = gameState.roundEnd;
    updatePlatforms(gameState.platforms);
    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);
    re.tick++;

    if (re.tick === 180 && !re.triggered) {
      re.triggered = true;
      if (re.winner === 'p1') gameState.p1.wins++;
      else                    gameState.p2.wins++;

      if (gameState.p1.wins >= gameState.roundTarget || gameState.p2.wins >= gameState.roundTarget) {
        gameState.phase = 'match_end';
        document.getElementById('result-winner').textContent =
          re.winner === 'p1' ? 'Player 1 Wins!' : 'Player 2 Wins!';
        setTimeout(() => showScreen('screen-result'), 2000);
      } else {
        gameState.roundNum++;
        gameState.platforms    = createPlatforms(selectedLayout);
        gameState.p1Projectile = null;
        gameState.p2Projectile = null;
        gameState.gridlock     = null;
        resetPlayer(gameState.p1);
        resetPlayer(gameState.p2);
        resetCamera(camera);
        re.fadingIn = true;
      }
    }

    if (re.fadingIn && re.tick >= 240) {
      gameState.phase = 'active';
      gameState.roundEnd = null;
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────────────
  let lastTime = null;
  let accum    = 0;

  function tick() {
    if (gameState.phase === 'active') {
      tickActive();
    } else if (gameState.phase === 'round_end') {
      tickRoundEnd();
    }
  }

  // ── Gridlock mash phase (sub-state of 'active') ───────────────────────────

  function tickGridlockPhase() {
    const p1In = input.getSnapshot(bindings.p1);
    const p2In = input.getSnapshot(bindings.p2);
    input.flush();

    const result = tickGridlock(gameState.gridlock, gameState.p1, gameState.p2, p1In, p2In);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);

    if (result?.resolved) {
      gameState.gridlock = null;
      gameState.p1.inGridlock   = false;
      gameState.p2.inGridlock   = false;
      gameState.p1.inputsLocked = false;
      gameState.p2.inputsLocked = false;
    }
  }

  // ── Normal active tick ─────────────────────────────────────────────────────

  function tickActive() {
    if (gameState.gridlock) { tickGridlockPhase(); return; }

    const p1In = input.getSnapshot(bindings.p1);
    const p2In = input.getSnapshot(bindings.p2);
    input.flush();

    updatePlatforms(gameState.platforms);

    const p1Result = applyPhysics(gameState.p1, p1In, gameState.platforms);
    const p2Result = applyPhysics(gameState.p2, p2In, gameState.platforms);

    // ── Projectile spawning ──────────────────────────────────────────────────
    if (gameState.p1.wantsProjectile && !gameState.p1Projectile) {
      gameState.p1Projectile = createProjectile('p1', gameState.p1.x + gameState.p1.facing * 24, gameState.p1.y, gameState.p1.facing);
    }
    if (gameState.p2.wantsProjectile && !gameState.p2Projectile) {
      gameState.p2Projectile = createProjectile('p2', gameState.p2.x + gameState.p2.facing * 24, gameState.p2.y, gameState.p2.facing);
    }

    // ── Projectile movement ──────────────────────────────────────────────────
    if (gameState.p1Projectile?.active) tickProjectile(gameState.p1Projectile);
    if (gameState.p2Projectile?.active) tickProjectile(gameState.p2Projectile);

    // ── Projectile clash ─────────────────────────────────────────────────────
    if (checkProjectileClash(gameState.p1Projectile, gameState.p2Projectile)) {
      gameState.p1Projectile.active = false;
      gameState.p2Projectile.active = false;
    }

    // ── Projectile vs player ─────────────────────────────────────────────────
    // p2's projectile vs p1
    let projKillP1 = false;
    if (gameState.p2Projectile?.active) {
      const facing = gameState.p2Projectile.facing;
      const r = checkProjectileVsPlayer(gameState.p2Projectile, gameState.p1);
      if (r) {
        gameState.p2Projectile.active = false;
        if (r === 'block') {
          gameState.p1.speedX = facing * PROJ_SHIELD_KNOCKBACK;
          gameState.p1.stamina = Math.max(0, gameState.p1.stamina - 3);
        } else {
          projKillP1 = true;
        }
      }
    }

    // p1's projectile vs p2
    let projKillP2 = false;
    if (gameState.p1Projectile?.active) {
      const facing = gameState.p1Projectile.facing;
      const r = checkProjectileVsPlayer(gameState.p1Projectile, gameState.p2);
      if (r) {
        gameState.p1Projectile.active = false;
        if (r === 'block') {
          gameState.p2.speedX = facing * PROJ_SHIELD_KNOCKBACK;
          gameState.p2.stamina = Math.max(0, gameState.p2.stamina - 3);
        } else {
          projKillP2 = true;
        }
      }
    }

    // ── Melee hit resolution ─────────────────────────────────────────────────
    const combatResult = resolveHits(gameState.p1, gameState.p2);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);

    // ── Clean up inactive projectiles ────────────────────────────────────────
    if (gameState.p1Projectile && !gameState.p1Projectile.active) gameState.p1Projectile = null;
    if (gameState.p2Projectile && !gameState.p2Projectile.active) gameState.p2Projectile = null;

    // ── Gridlock entry ───────────────────────────────────────────────────────
    if (combatResult?.gridlock) {
      gameState.gridlock       = createGridlockState();
      gameState.p1.inGridlock  = true;
      gameState.p2.inGridlock  = true;
      gameState.p1.inputsLocked = true;
      gameState.p2.inputsLocked = true;
      return;
    }

    // ── Death resolution ─────────────────────────────────────────────────────
    let p1Dead = p1Result === 'dead' || combatResult?.p1Killed || projKillP1;
    let p2Dead = p2Result === 'dead' || combatResult?.p2Killed || projKillP2;

    if (p1Dead || p2Dead) {
      if (p1Dead) { gameState.p1.dead = (p1Result === 'dead'); gameState.p1.inputsLocked = true; }
      if (p2Dead) { gameState.p2.dead = (p2Result === 'dead'); gameState.p2.inputsLocked = true; }
      // Determine winner (opposite of who died); simultaneous → p1 wins
      const winner = (p2Dead && !p1Dead) ? 'p1'
                   : (p1Dead && !p2Dead) ? 'p2'
                   : 'p1';
      const isBlastKill = (p1Dead && p1Result === 'dead') || (p2Dead && p2Result === 'dead');
      triggerRoundEnd(winner, isBlastKill);
    }
  }

  function loop(ts) {
    if (lastTime !== null) {
      accum += Math.min(ts - lastTime, 100);
      while (accum >= TICK_MS) {
        tick();
        accum -= TICK_MS;
      }
    }
    lastTime = ts;

    if (gameState.phase === 'active' || gameState.phase === 'round_end') {
      render(ctx, canvas, gameState, camera);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

export { initGame };
