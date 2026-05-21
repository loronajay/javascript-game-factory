import { loadAssets, getSound }      from './scripts/assets.js';
import { createBotState, tickBot }  from './scripts/bot.js';
import { loadFactoryProfile }       from '../../js/platform/identity/factory-profile.mjs';
import { createInput }              from './scripts/input.js';
import {
  ACTIONS, ACTION_LABELS, DEFAULT_P1, DEFAULT_P2,
  formatKeyCode, loadBindings, saveBindings,
} from './scripts/controls.js';
import { createPlayer, resetPlayer, stepAnimation } from './scripts/player.js';
import { applyPhysics }            from './scripts/physics.js';
import { resolveHits, getAttackHitbox, getDashHitbox, isAttackActive, isDashAttackActive } from './scripts/combat.js';
import { createGridlockState, tickGridlock } from './scripts/gridlock.js';
import { createProjectile, tickProjectile, checkProjectileVsPlayer, checkProjectileClash, checkHitboxVsProjectile, PROJ_SHIELD_KNOCKBACK } from './scripts/projectile.js';
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
    clashFlash:      0,   // 0–1 white flash intensity, decays each tick
    deathFlash:      0,   // 0–1 red flash intensity on kill, decays each tick
    roundStartTick:  0,   // ticks into the round-start banner sequence
    roundEnd:    null,
    platforms:   createPlatforms('single'),
  };

  const factoryProfile = loadFactoryProfile();
  const factoryName    = factoryProfile.profileName || 'Player 1';

  // Display name on menu
  const nameEl = document.getElementById('menu-player-name');
  if (nameEl) nameEl.textContent = factoryName;

  // Match display labels — set when match mode is chosen
  let p1Label = factoryName;
  let p2Label = 'Player 2';

  let bindings = loadBindings();
  let selectedRounds = 3;
  let selectedLayout = 'single';

  // CPU config — set before startMatch, read during tick
  let botConfig = { enabled: false, side: 'p2', difficulty: 'hard' };
  let botState  = createBotState();

  // ── Screen helpers ─────────────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
    document.getElementById(id).classList.add('screen--active');
  }

  // ── Menu wiring ────────────────────────────────────────────────────────────
  document.getElementById('btn-local').addEventListener('click', () => {
    botConfig.enabled = false;
    p1Label = factoryName;
    p2Label = 'Player 2';
    showScreen('screen-setup');
  });

  document.getElementById('btn-cpu').addEventListener('click', () => showScreen('screen-cpu-setup'));

  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('side-btn--active'));
      btn.classList.add('side-btn--active');
      botConfig.side = btn.dataset.side === 'p1' ? 'p2' : 'p1'; // bot is opposite of human
    });
  });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
      botConfig.difficulty = btn.dataset.difficulty;
    });
  });

  document.querySelectorAll('.cpu-round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cpu-round-btn').forEach(b => b.classList.remove('cpu-round-btn--active'));
      btn.classList.add('cpu-round-btn--active');
      selectedRounds = Number(btn.dataset.rounds);
    });
  });

  document.querySelectorAll('.cpu-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cpu-layout-btn').forEach(b => b.classList.remove('cpu-layout-btn--active'));
      btn.classList.add('cpu-layout-btn--active');
      selectedLayout = btn.dataset.layout;
    });
  });

  document.getElementById('btn-start-cpu').addEventListener('click', () => {
    botConfig.enabled = true;
    // Human side gets the factory name; bot gets 'CPU'
    if (botConfig.side === 'p1') {
      p1Label = 'CPU';
      p2Label = factoryName;
    } else {
      p1Label = factoryName;
      p2Label = 'CPU';
    }
    gameState.roundTarget = selectedRounds === 3 ? 2 : 3;
    startMatch();
  });

  document.getElementById('btn-cpu-back').addEventListener('click', () => showScreen('screen-menu'));

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
    stopAmbient();
    showScreen('screen-menu');
  });

  // ── Controls screen ────────────────────────────────────────────────────────

  let workingBindings = null;   // editable copy while controls screen is open
  let listeningState  = null;   // { side, action, btn, prevKey }

  function _keyBtnEl(side, action) {
    return document.querySelector(`#controls-table-${side} [data-action="${action}"]`);
  }

  function _buildControlsTable(side) {
    const table = document.getElementById(`controls-table-${side}`);
    table.innerHTML = '';
    for (const action of ACTIONS) {
      const tr      = document.createElement('tr');
      const labelTd = document.createElement('td');
      labelTd.className   = 'controls-label';
      labelTd.textContent = ACTION_LABELS[action];

      const keyTd  = document.createElement('td');
      const keyBtn = document.createElement('button');
      keyBtn.className       = 'key-btn';
      keyBtn.textContent     = formatKeyCode(workingBindings[side][action]);
      keyBtn.dataset.side    = side;
      keyBtn.dataset.action  = action;
      keyBtn.addEventListener('click', () => _startListening(side, action, keyBtn));

      keyTd.appendChild(keyBtn);
      tr.appendChild(labelTd);
      tr.appendChild(keyTd);
      table.appendChild(tr);
    }
  }

  function _startListening(side, action, btn) {
    if (listeningState) _cancelListening();
    listeningState = { side, action, btn, prevKey: workingBindings[side][action] };
    btn.textContent = '…';
    btn.classList.add('key-btn--listening');
  }

  function _cancelListening() {
    if (!listeningState) return;
    const { btn, prevKey } = listeningState;
    btn.textContent = formatKeyCode(prevKey);
    btn.classList.remove('key-btn--listening');
    btn.classList.remove('key-btn--conflict');
    listeningState = null;
  }

  function _commitListening(code) {
    if (!listeningState) return;
    const { side, action, btn } = listeningState;

    // Auto-swap: if this key is already bound to another action on the same side, swap them
    for (const other of ACTIONS) {
      if (other === action) continue;
      if (workingBindings[side][other] === code) {
        const displaced = _keyBtnEl(side, other);
        workingBindings[side][other] = workingBindings[side][action];
        if (displaced) displaced.textContent = formatKeyCode(workingBindings[side][other]);
        break;
      }
    }

    workingBindings[side][action] = code;
    btn.textContent = formatKeyCode(code);
    btn.classList.remove('key-btn--listening');
    btn.classList.remove('key-btn--conflict');
    listeningState = null;
  }

  // Global keydown handler for capture mode — always registered, no-ops when not listening
  window.addEventListener('keydown', (e) => {
    if (!listeningState) return;
    e.preventDefault();
    if (e.code === 'Escape') { _cancelListening(); return; }
    _commitListening(e.code);
  });

  document.getElementById('btn-controls').addEventListener('click', () => {
    workingBindings = { p1: { ...bindings.p1 }, p2: { ...bindings.p2 } };
    _buildControlsTable('p1');
    _buildControlsTable('p2');
    showScreen('screen-controls');
  });

  document.getElementById('controls-reset-p1').addEventListener('click', () => {
    if (listeningState?.side === 'p1') _cancelListening();
    workingBindings.p1 = { ...DEFAULT_P1 };
    _buildControlsTable('p1');
  });

  document.getElementById('controls-reset-p2').addEventListener('click', () => {
    if (listeningState?.side === 'p2') _cancelListening();
    workingBindings.p2 = { ...DEFAULT_P2 };
    _buildControlsTable('p2');
  });

  document.getElementById('controls-done').addEventListener('click', () => {
    if (listeningState) _cancelListening();
    saveBindings(workingBindings.p1, workingBindings.p2);
    bindings = { ...workingBindings };
    workingBindings = null;
    showScreen('screen-menu');
  });

  // ── Clash effects ──────────────────────────────────────────────────────────

  function spawnChing(x, y) {
    gameState.clashFlash = 1;
    gameState.effects.push({ type: 'ching', x, y, frame: 0, timer: 0, maxFrames: 5, ticksPerFrame: 1 });
    playSound('ching');
  }

  function spawnBlood(x, y, flip) {
    gameState.effects.push({ type: 'blood', x, y, frame: 0, timer: 0, maxFrames: 8, flip });
  }

  // ── Sound helpers ──────────────────────────────────────────────────────────
  function playSound(name) {
    const audio = getSound(name);
    if (!audio) return;
    const clone = audio.cloneNode();
    clone.play().catch(() => {});
  }

  let ambientAudio = null;
  function startAmbient() {
    if (ambientAudio) return;
    const audio = getSound('bg_music');
    if (!audio) return;
    audio.loop        = true;
    audio.volume      = 0.25;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    ambientAudio = audio;
  }
  function stopAmbient() {
    if (!ambientAudio) return;
    ambientAudio.pause();
    ambientAudio.currentTime = 0;
    ambientAudio = null;
  }

  function tickEffects() {
    gameState.clashFlash = Math.max(0, gameState.clashFlash - 0.14);
    gameState.deathFlash = Math.max(0, gameState.deathFlash - 0.06);
    for (const fx of gameState.effects) {
      fx.timer++;
      if (fx.timer % (fx.ticksPerFrame ?? 3) === 0) fx.frame++;
    }
    gameState.effects = gameState.effects.filter(fx => fx.frame < fx.maxFrames);
  }

  // ── Match flow ─────────────────────────────────────────────────────────────
  function startMatch() {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    gameState.roundNum = 0;
    gameState.roundEnd = null;
    botState = createBotState();
    startAmbient();
    startRound();
  }

  function startRound() {
    gameState.roundNum++;
    gameState.phase          = 'round_start';
    gameState.roundStartTick = 0;
    gameState.platforms      = createPlatforms(selectedLayout);
    gameState.p1Projectile   = null;
    gameState.p2Projectile   = null;
    gameState.gridlock       = null;
    gameState.effects        = [];
    gameState.clashFlash     = 0;
    gameState.deathFlash     = 0;
    resetPlayer(gameState.p1);
    resetPlayer(gameState.p2);
    gameState.p1.inputsLocked = true;
    gameState.p2.inputsLocked = true;
    resetCamera(camera);
    showScreen('screen-game');
  }

  // ── Round end sequence ─────────────────────────────────────────────────────

  function triggerRoundEnd(winner, isBlastKill = false) {
    gameState.phase      = 'round_end';
    gameState.deathFlash = 1;
    if (isBlastKill) playSound('explosion');
    else             playSound('death');

    if (winner === 'draw') {
      for (const p of [gameState.p1, gameState.p2]) {
        p.inputsLocked      = true;
        p.attackTimer       = 0;
        p.throwing          = false;
        p.dashBursting      = false;
        p.dashBurstTimer    = 0;
        p.dashRecovering    = false;
        p.dashRecoveryTimer = 0;
        p.speedX            = 0;
        if (!p.dead) {
          p.dying = true;
          if (!isBlastKill) spawnBlood(p.x - p.facing * 10, p.y - 14, p.facing === -1);
        }
      }
      gameState.roundEnd = { winner: 'draw', loser: null, tick: 0, triggered: false, fadingIn: false, isBlastKill };
      return;
    }

    const loserSide    = winner === 'p1' ? 'p2' : 'p1';
    const loser        = gameState[loserSide];
    const winnerPlayer = gameState[winner];

    loser.inputsLocked = true;
    if (!loser.dead) {
      loser.dying = true;
      if (!isBlastKill) spawnBlood(
        loser.x - loser.facing * 10,
        loser.y - 14,
        loser.facing === -1,
      );
    }

    // Lock winner so held attack/movement doesn't loop during the death sequence
    winnerPlayer.inputsLocked      = true;
    winnerPlayer.attackTimer       = 0;
    winnerPlayer.throwing          = false;
    winnerPlayer.dashBursting      = false;
    winnerPlayer.dashBurstTimer    = 0;
    winnerPlayer.dashRecovering    = false;
    winnerPlayer.dashRecoveryTimer = 0;
    winnerPlayer.speedX            = 0;

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
    tickEffects();

    // Keep gravity + floor collision running — inputs locked so no movement, just fall
    const noInputs = {
      left: false, right: false, up: false, down: false,
      attack: false, dash: false, projectile: false, attackJustPressed: false,
    };
    applyPhysics(gameState.p1, noInputs, gameState.platforms);
    applyPhysics(gameState.p2, noInputs, gameState.platforms);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);
    re.tick++;

    if (re.tick === 180 && !re.triggered) {
      re.triggered = true;
      if      (re.winner === 'p1') gameState.p1.wins++;
      else if (re.winner === 'p2') gameState.p2.wins++;
      // 'draw': no wins awarded

      if (gameState.p1.wins >= gameState.roundTarget || gameState.p2.wins >= gameState.roundTarget) {
        gameState.phase = 'match_end';
        document.getElementById('result-winner').textContent =
          re.winner === 'p1' ? `${p1Label} Wins!` : `${p2Label} Wins!`;
        setTimeout(() => showScreen('screen-result'), 2000);
      } else {
        gameState.roundNum++;
        gameState.platforms    = createPlatforms(selectedLayout);
        gameState.p1Projectile = null;
        gameState.p2Projectile = null;
        gameState.gridlock     = null;
        resetPlayer(gameState.p1);
        resetPlayer(gameState.p2);
        gameState.p1.inputsLocked = true;
        gameState.p2.inputsLocked = true;
        resetCamera(camera);
        re.fadingIn = true;
      }
    }

    if (re.fadingIn && re.tick >= 240) {
      gameState.phase          = 'round_start';
      gameState.roundStartTick = 0;
      gameState.roundEnd       = null;
    }
  }

  // ── Round-start banner sequence ───────────────────────────────────────────

  function tickRoundStart() {
    gameState.roundStartTick++;
    updatePlatforms(gameState.platforms);
    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);

    if (gameState.roundStartTick === 1)  playSound('are_you_ready');
    if (gameState.roundStartTick === 90) playSound('fight');

    if (gameState.roundStartTick >= 150) {
      gameState.phase = 'active';
      gameState.p1.inputsLocked = false;
      gameState.p2.inputsLocked = false;
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────────────
  let lastTime = null;
  let accum    = 0;

  function tick() {
    if      (gameState.phase === 'active')      tickActive();
    else if (gameState.phase === 'round_end')   tickRoundEnd();
    else if (gameState.phase === 'round_start') tickRoundStart();
  }

  // ── Gridlock mash phase (sub-state of 'active') ───────────────────────────

  function tickGridlockPhase() {
    tickEffects();

    const p1In = (botConfig.enabled && botConfig.side === 'p1')
      ? tickBot(botState, gameState, 'p1', botConfig.difficulty)
      : input.getSnapshot(bindings.p1);
    const p2In = (botConfig.enabled && botConfig.side === 'p2')
      ? tickBot(botState, gameState, 'p2', botConfig.difficulty)
      : input.getSnapshot(bindings.p2);
    input.flush();

    const result = tickGridlock(gameState.gridlock, gameState.p1, gameState.p2, p1In, p2In);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);

    if (result?.resolved) {
      playSound('gridlock_end');
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

    tickEffects();

    const p1In = (botConfig.enabled && botConfig.side === 'p1')
      ? tickBot(botState, gameState, 'p1', botConfig.difficulty)
      : input.getSnapshot(bindings.p1);
    const p2In = (botConfig.enabled && botConfig.side === 'p2')
      ? tickBot(botState, gameState, 'p2', botConfig.difficulty)
      : input.getSnapshot(bindings.p2);
    input.flush();

    updatePlatforms(gameState.platforms);

    // Snapshot pre-physics states for transition-based sound detection
    const p1WasCharging  = gameState.p1.dashCharge > 0;
    const p2WasCharging  = gameState.p2.dashCharge > 0;
    const p1WasBlocking  = gameState.p1.blocking;
    const p2WasBlocking  = gameState.p2.blocking;
    const p1WasAttacking = gameState.p1.attackTimer > 0;
    const p2WasAttacking = gameState.p2.attackTimer > 0;
    const p1WasDashAtk   = isDashAttackActive(gameState.p1);
    const p2WasDashAtk   = isDashAttackActive(gameState.p2);

    const p1Result = applyPhysics(gameState.p1, p1In, gameState.platforms);
    const p2Result = applyPhysics(gameState.p2, p2In, gameState.platforms);

    // Post-physics transition sounds
    if (!p1WasCharging  && gameState.p1.dashCharge > 0) playSound('dash');
    if (!p2WasCharging  && gameState.p2.dashCharge > 0) playSound('dash');
    if (!p1WasBlocking  && gameState.p1.blocking)       playSound('shield');
    if (!p2WasBlocking  && gameState.p2.blocking)       playSound('shield');
    // Throw sound fires on attack start; swing is deferred to hitbox-active frame below
    if (!p1WasAttacking && gameState.p1.attackTimer > 0 && gameState.p1.throwing) playSound('throw');
    if (!p2WasAttacking && gameState.p2.attackTimer > 0 && gameState.p2.throwing) playSound('throw');
    // Dash attack swing fires when the dash hitbox first goes live
    if (!p1WasDashAtk && isDashAttackActive(gameState.p1)) playSound('swing');
    if (!p2WasDashAtk && isDashAttackActive(gameState.p2)) playSound('swing');

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
      spawnChing(
        (gameState.p1Projectile.x + gameState.p2Projectile.x) / 2,
        (gameState.p1Projectile.y + gameState.p2Projectile.y) / 2,
      );
      gameState.p1Projectile.active = false;
      gameState.p2Projectile.active = false;
    }

    // ── Sword deflection: melee/dash hitbox destroys opponent's projectile ───
    const p1Box = isAttackActive(gameState.p1)     ? getAttackHitbox(gameState.p1)
                : isDashAttackActive(gameState.p1)  ? getDashHitbox(gameState.p1)
                : null;
    const p2Box = isAttackActive(gameState.p2)     ? getAttackHitbox(gameState.p2)
                : isDashAttackActive(gameState.p2)  ? getDashHitbox(gameState.p2)
                : null;
    if (p1Box && checkHitboxVsProjectile(p1Box, gameState.p2Projectile)) {
      spawnChing(gameState.p2Projectile.x, gameState.p2Projectile.y);
      gameState.p2Projectile.active = false;
    }
    if (p2Box && checkHitboxVsProjectile(p2Box, gameState.p1Projectile)) {
      spawnChing(gameState.p1Projectile.x, gameState.p1Projectile.y);
      gameState.p1Projectile.active = false;
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
          playSound('ching');
        } else {
          projKillP1 = true;
          playSound('proj_hit');
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
          playSound('ching');
        } else {
          projKillP2 = true;
          playSound('proj_hit');
        }
      }
    }

    // ── Melee hit resolution ─────────────────────────────────────────────────
    const combatResult = resolveHits(gameState.p1, gameState.p2);

    if (combatResult && !combatResult.gridlock) {
      if (combatResult.p1HitP2) {
        playSound(gameState.p1.dashBursting ? 'dash2' : 'hit');
        playSound(combatResult.p2Killed ? 'hurt' : 'ching');
      }
      if (combatResult.p2HitP1) {
        playSound(gameState.p2.dashBursting ? 'dash2' : 'hit');
        playSound(combatResult.p1Killed ? 'hurt' : 'ching');
      }
    }

    const p1WasSwingActive = isAttackActive(gameState.p1);
    const p2WasSwingActive = isAttackActive(gameState.p2);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);

    if (!p1WasSwingActive && isAttackActive(gameState.p1)) playSound('swing');
    if (!p2WasSwingActive && isAttackActive(gameState.p2)) playSound('swing');

    updateCamera(camera, gameState.p1, gameState.p2);

    // ── Clean up inactive projectiles ────────────────────────────────────────
    if (gameState.p1Projectile && !gameState.p1Projectile.active) gameState.p1Projectile = null;
    if (gameState.p2Projectile && !gameState.p2Projectile.active) gameState.p2Projectile = null;

    // ── Gridlock entry ───────────────────────────────────────────────────────
    if (combatResult?.gridlock) {
      spawnChing(
        (gameState.p1.x + gameState.p2.x) / 2,
        (gameState.p1.y + gameState.p2.y) / 2,
      );
      gameState.gridlock = createGridlockState();
      for (const p of [gameState.p1, gameState.p2]) {
        p.inGridlock        = true;
        p.inputsLocked      = true;
        p.dashBursting      = false;
        p.dashBurstTimer    = 0;
        p.dashRecovering    = false;
        p.dashRecoveryTimer = 0;
        p.speedX            = 0;
      }
      return;
    }

    // ── Death resolution ─────────────────────────────────────────────────────
    let p1Dead = p1Result === 'dead' || combatResult?.p1Killed || projKillP1;
    let p2Dead = p2Result === 'dead' || combatResult?.p2Killed || projKillP2;

    if (p1Dead || p2Dead) {
      if (p1Dead) { gameState.p1.dead = (p1Result === 'dead'); gameState.p1.inputsLocked = true; }
      if (p2Dead) { gameState.p2.dead = (p2Result === 'dead'); gameState.p2.inputsLocked = true; }
      const winner = (p2Dead && !p1Dead) ? 'p1'
                   : (p1Dead && !p2Dead) ? 'p2'
                   : 'draw';
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

    if (gameState.phase === 'active'      ||
        gameState.phase === 'round_end'   ||
        gameState.phase === 'round_start' ||
        gameState.phase === 'match_end') {
      render(ctx, canvas, gameState, camera);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

export { initGame };
