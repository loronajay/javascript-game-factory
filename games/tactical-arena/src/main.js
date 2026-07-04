import { attack, attackTile, beginActivation, cancelMove, concede, defend, finishActivation, moveUnit, useArt } from "./core/commands.js";
import { UNIT_TYPES, getArt, getAvailableArts, getEffectiveStats, getUnitType } from "./core/unitCatalog.js";
import { areAllies, areEnemies, createBattleState, findUnit, isWallAt, unitAt } from "./core/state.js";
import { canUseArt, getFirePlacementTiles, getFootworkStepOptions, getFootworkSteps, getLegalFleeTiles, getLineTargets, getRevivePlacementTiles, getReviveTargets, getSelfBlastRadius, getSummonPlacementTiles, getVolleyShotAimOptions, getVolleyShotCells, getWallPlacementTiles } from "./rules/arts.js";
import { isWallBetween } from "./rules/combat.js";
import { chebyshevDistance, positionKey } from "./rules/movement.js";
import { isStunned } from "./rules/statuses.js";
import { applyCommand } from "./core/reducer.js";
import { chooseActivation, cpuRng } from "./ai/cpuController.js";
import { createBoardMetrics, gridToScreen } from "./ui/isometric.js";
import { createEffects } from "./ui/effects.js";
import { orderedHitTargets } from "./ui/combatPresentation.js";
import { TurnAnnouncer } from "./ui/turnFlash.js";
import { createMenuFlow } from "./ui/menuFlow.js";
import { DEFAULT_SQUAD } from "./ui/squadPicker.js";
import { AudioManager } from "./audio/sounds.js";
import { renderBoard } from "./ui/boardRenderer.js";
import { mountSceneBackdrop } from "./ui/sceneBackdrop.js";
import { renderForecast } from "./ui/forecastRenderer.js";
import { resolveAnimatedMove } from "./ui/animatedCommands.js";
import { renderHeader, renderUnitCard, renderActions, renderSquads } from "./ui/hud.js";
import { RulesModal } from "./ui/rulesModal.js";
import { applyMobileViewport, requestMobileFullscreen } from "./ui/mobileViewport.js";
import { applyTheme, loadSavedThemeId } from "./ui/themes.js";
import { turnAnnouncementSub } from "./ui/turnAnnouncement.js";
import { openChoiceModal } from "./ui/choiceModal.js";
import { buildSummary, createMatchState, hpRemaining, readableError, teamColor } from "./match/matchBuilder.js";

// --- DOM refs ---
const board = document.querySelector("#boardSvg");
const boardLayer = document.querySelector("#boardLayer");
const unitsLayer = document.querySelector("#unitsLayer");
const forecastLayer = document.querySelector("#forecastLayer");
const effectsLayer = document.querySelector("#effectsLayer");
const diceOverlay = document.querySelector("#diceOverlay");
const dieFace = document.querySelector("#dieFace");
const unitCard = document.querySelector("#unitCard");
const actions = document.querySelector("#actions");
const turnTitle = document.querySelector("#turnTitle");
const turnSub = document.querySelector("#turnSub");
const turnBanner = document.querySelector("#turnBanner");
const actionHelp = document.querySelector("#actionHelp");
const squadOverlays = document.querySelector("#squadOverlays");
const message = document.querySelector("#message");
const refModal = document.querySelector("#refModal");

// --- View state ---
let state = createBattleState();
let selectedId = null;
let mode = null;
let footworkPath = [];
let volleyShotOrigin = null;
// The fallen ally chosen for Father Time's Rewind, awaiting a placement-tile click.
let rewindTargetId = null;
let resolving = false;

// --- CPU (single-player) ---
// `cpu` is null in hot-seat; in single-player it names the difficulty and which seats
// the computer drives (Player 2 in v1). `cpuThinking` guards against re-entering the
// CPU loop, and `matchEpoch` lets a running CPU loop bail the moment a new match starts.
let cpu = null;
let cpuThinking = false;
let matchEpoch = 0;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const CPU_TURN_LEAD_MS = 480;        // pause before the CPU's first move
const CPU_ACTIVATION_GAP_MS = 320;   // between one unit finishing and the next
const CPU_STEP_MS = 260;             // beat when a CPU unit takes the field
const CPU_MAX_ACTIVATIONS = 64;      // guard against a runaway planning loop

function isCpu(player) {
  return Boolean(cpu && cpu.players.has(player));
}

function currentPlayerIsLocal() {
  if (isCpu(state.currentPlayer)) return false;
  if (net != null && state.currentPlayer !== mySeat) return false;
  return true;
}

function lockedActionMessage() {
  if (state.phase === "complete") return "The duel is complete.";
  if (isCpu(state.currentPlayer)) return `Player ${state.currentPlayer} (CPU) is taking its turn.`;
  if (net != null && state.currentPlayer !== mySeat) return `Player ${state.currentPlayer}'s turn - please wait.`;
  return "Wait for your turn.";
}

// --- Online (multiplayer) ---
// `net` is null in local play; in online it is the deterministic-lockstep session
// bridge (src/online/onlineSession.js). `mySeat` is the local player's seat number;
// only my own seat's input is accepted — the opponent's moves arrive as remote
// commands. `applyingRemote` suppresses the broadcast hook while we replay an
// opponent's command, so a replayed command is never echoed back. Online and `cpu`
// are mutually exclusive (no CPU in an online match).
let net = null;
let mySeat = null;
let applyingRemote = false;

// Input is locked during an animation (`resolving`) AND, online, whenever it is not
// the local seat's turn. This is the single gate every input entry point checks —
// without the seat check a player could open the OPPONENT's activation on their turn
// (both beginUnit and the reducer only check currentPlayer), breaking lockstep.
function inputLocked() {
  return resolving || !currentPlayerIsLocal();
}

// Broadcast a locally-originated accepted command to the opponent. Skipped while
// replaying a remote command (applyingRemote) and a no-op in local play (net null).
// The command carries NO rolls — both clients draw identical dice from the shared
// seeded rngState — so the raw command is all the peer needs to stay in lockstep.
function broadcastIfLocal(command) {
  if (net && !applyingRemote) net.onLocalCommandApplied(command);
}

// --- Match metadata ---
let matchConfig = null;
let matchStartedAt = 0;
let initialHpByPlayer = { 1: 0, 2: 0 };
let resultsTimer = 0;

// --- Presentation-only subsystems ---
const audio = new AudioManager({ enabled: true, masterVolume: 1, volume: 0.85, musicVolume: 0.32 });
let muted = false;
let audioUnlocked = false;

const rulesModal = new RulesModal(refModal, document.querySelector("#refCloseBtn"));
const effects = createEffects({ board, unitsLayer, effectsLayer, diceOverlay, dieFace, metrics: createBoardMetrics(state.size), audio });
const turnFlash = new TurnAnnouncer(document.querySelector("#turnFlash"));
const menu = createMenuFlow({ audio, onStartMatch: startMatch, openCodex, onLeaveMatch });

// Atmospheric battle-view backdrop (parallax sky, fortress, fog, embers). Built
// once — it's independent of board size and presentation only.
mountSceneBackdrop(document.querySelector("#sceneBackdrop"));

// Saved palette (Settings → Theme) — presentation only, applied before first paint
// settles so the board never flashes the default colors.
applyTheme(loadSavedThemeId());

// --- Render ---

function selectedUnit() {
  return selectedId ? findUnit(state, selectedId) : null;
}

function render() {
  const unit = selectedUnit();
  const controlsEnabled = currentPlayerIsLocal();
  renderHeader(state, { turnTitle, turnSub, turnBanner });
  renderUnitCard(unit, state, unitCard);
  renderActions(unit, state, mode, { actions, actionHelp }, {
    resolving,
    controlsEnabled,
    lockedMessage: lockedActionMessage(),
    onActionClick: (action) => handleActionClick(action, unit)
  });
  renderSquads(state, squadOverlays, (u) => { beginUnit(u); render(); }, { controlsEnabled });
  renderBoard({ board, boardLayer, unitsLayer, state, mode, selectedId, footworkPath, onTileClick: handleTile });
  renderForecast({ forecastLayer, state, mode, actor: unit, resolving });
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

// --- Match lifecycle ---

function startMatch(config) {
  window.clearTimeout(resultsTimer);
  matchEpoch += 1;
  const online = config.mode === "online";
  // Online builds from the relay's shared seed so every client draws identical dice;
  // local play omits it for a fresh random seed each match.
  state = createMatchState({
    size: config.size,
    squads: config.squads,
    seed: online ? config.seed : undefined,
    playerCount: config.playerCount,
    format: config.format,
    teamColors: config.teamColors,
    teamNames: config.teamNames,
  });
  effects.setMetrics(createBoardMetrics(config.size));
  matchConfig = config;
  matchStartedAt = Date.now();
  initialHpByPlayer = {};
  for (const player of state.turnOrder ?? [1, 2]) initialHpByPlayer[player] = hpRemaining(state, player);
  // Single-player drives Player 2 with the CPU; hot-seat and online leave cpu null.
  cpu = config.mode === "single" ? { difficulty: config.difficulty ?? "normal", players: new Set([2]) } : null;
  cpuThinking = false;
  // Online wiring: bind the lockstep session, remember our seat. Mutually exclusive
  // with cpu. A networked match can't be unilaterally restarted, so hide Restart.
  net = online ? config.net : null;
  mySeat = online ? config.mySeat : null;
  applyingRemote = false;
  document.querySelector("#restartBtn").hidden = online;
  selectedId = null;
  mode = null;
  footworkPath = [];
  volleyShotOrigin = null;
  rewindTargetId = null;
  resolving = false;
  turnFlash.clear();
  setMessage(online
    ? (state.currentPlayer === mySeat ? "You open the battle." : `Player ${state.currentPlayer}'s turn — please wait.`)
    : `${isCpu(state.currentPlayer) ? `Player ${state.currentPlayer} (CPU)` : `Player ${state.currentPlayer}`} opens the battle.`);
  menu.show("match");
  if (audioUnlocked && !muted) audio.startMusic("battle");
  // Bind AFTER the match screen + state exist so any remote commands buffered during
  // the lobby→match handoff flush onto a live board.
  if (online) net.bind(onlineController);
  render();
  announceTurn(state.currentPlayer);
  maybeStartCpuTurn();
}

function resetBattle() {
  if (net) return; // a networked match can't be unilaterally restarted
  startMatch(matchConfig ?? { size: 13, squads: { 1: [...DEFAULT_SQUAD], 2: [...DEFAULT_SQUAD] } });
}

// Called by the menu when the match screen is left. Abandon a still-live online
// match (the remaining peer wins by walkover); a cleanly finished one already ran
// net.endMatch(), so we only null our handles here.
function onLeaveMatch() {
  if (net && state.phase === "playing") net.dispose();
  net = null;
  mySeat = null;
}

function announceTurn(player, { hold = false } = {}) {
  if (state.phase === "complete") {
    const summary = buildSummary(state, { matchStartedAt, initialHpByPlayer });
    turnFlash.announce({ title: `${summary.winnerLabel ?? `Player ${state.winner}`} wins`, sub: "Victory", color: summary.winnerColor ?? teamColor(state.winner, state), hold: true });
    return;
  }
  turnFlash.announce({
    title: `Player ${player} squad turn`,
    sub: turnAnnouncementSub({ matchMode: matchConfig?.mode, player, mySeat, isCpu: isCpu(player) }),
    color: teamColor(player, state),
    hold
  });
}

function announceTurnChange(prevPlayer) {
  if (state.phase === "complete") {
    net?.endMatch(); // clean finish: let the session keep the socket alive briefly for the peer
    announceTurn(state.winner);
    const summary = buildSummary(state, { matchStartedAt, initialHpByPlayer });
    window.clearTimeout(resultsTimer);
    resultsTimer = window.setTimeout(() => menu.showResults(summary), 1600);
  } else if (state.currentPlayer !== prevPlayer) {
    announceTurn(state.currentPlayer);
    if (net && state.currentPlayer !== mySeat) setMessage(`Player ${state.currentPlayer}'s turn — please wait.`);
  }
}

// --- Command dispatch ---

function dispatch(command) {
  const result = applyCommand(state, command);
  if (!result.accepted) {
    setMessage(readableError(result.errorCode), true);
    return false;
  }
  const prevPlayer = state.currentPlayer;
  state = result.nextState;
  broadcastIfLocal(command);
  playEventSounds(result.events ?? []);
  playRolloverFx(result.events ?? []);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  announceTurnChange(prevPlayer);
  maybeStartCpuTurn();
  return true;
}

// Async resolution for rolled actions (basic ATTACK and targeted ARTS). Reveals
// the roll, commits the resolved state, then plays impact FX. Input stays locked
// across the animation via `resolving`. Non-rolled actions use synchronous dispatch.
async function resolveCombat(command) {
  const result = applyCommand(state, command);
  if (!result.accepted) { setMessage(readableError(result.errorCode), true); return false; }
  const events = result.events ?? [];
  const rolled = events.find((e) => (e.type === "ATTACK_RESOLVED" || e.type === "ART_RESOLVED") && "hit" in e);

  const prevPlayer = state.currentPlayer;
  resolving = true;
  mode = null; footworkPath = []; volleyShotOrigin = null;
  render();

  const metrics = createBoardMetrics(state.size);
  const attackerBefore = rolled ? findUnit(state, rolled.actorId) : null;
  const rolledTargetsBefore = rolled ? orderedHitTargets(rolled, (id) => findUnit(state, id)) : [];
  const targetBefore = rolledTargetsBefore[0] ?? (rolled ? findUnit(state, rolled.targetId) : null);

  if (rolled && attackerBefore && targetBefore) {
    const ranged = getUnitType(attackerBefore.type).stats.attackRange > 1;
    const center = unitCenter(metrics, targetBefore);

    await effects.animateAttack(attackerBefore, targetBefore, ranged, rolled.artId ?? null);
    await effects.rollReveal({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) });
    playAttackImpactSound(rolled, ranged);

    if (rolled.missed) {
      await effects.floatText(center, "MISS", "#cbb78b");
    } else {
      const dmg = typeof rolled.damage === "number" ? rolled.damage : (rolled.damage?.damage ?? 0);
      const impactKind = rolled.artId && artDefinition(attackerBefore, rolled.artId)?.damageType === "magic" ? "magic" : "physical";
      if (rolled.critical) { effects.critFlash(); effects.shake(11); }
      else effects.shake(Math.min(8, 2.5 + dmg * 1.4));
      effects.impact(center, Boolean(rolled.critical), impactKind);
      await effects.hitRecoil(targetBefore.id, targetBefore.position, Boolean(rolled.critical));
      await effects.floatText(center, rolled.critical ? `✦ ${dmg}` : `-${dmg}`, rolled.critical ? "#ffd26a" : "#ff7684");
      for (const hitTarget of rolledTargetsBefore) {
        if (hitTarget.id === targetBefore.id) continue;
        const hitCenter = unitCenter(metrics, hitTarget);
        const hitDamage = rolled.damageByTarget?.[hitTarget.id] ?? dmg;
        effects.impact(hitCenter, Boolean(rolled.critical), impactKind);
        await effects.hitRecoil(hitTarget.id, hitTarget.position, Boolean(rolled.critical));
        await effects.floatText(hitCenter, rolled.critical ? `âœ¦ ${hitDamage}` : `-${hitDamage}`, rolled.critical ? "#ffd26a" : "#ff7684");
      }
      if (rolled.artId) {
        const art = artDefinition(attackerBefore, rolled.artId);
        if (art?.effect?.type === "status" && rolled.effect?.attempted) {
          const statusName = (art.effect.status ?? "status").toUpperCase();
          await effects.rollReveal(
            { missed: !rolled.effect.applied, critical: false },
            rolled.effect.applied ? statusName : "RESISTED"
          );
          if (rolled.effect.applied) {
            await effects.playAbilityVfx(rolled.artId, {
              actor: attackerBefore,
              target: targetBefore,
              effect: { ...rolled.effect, status: art.effect.status }
            });
          }
        }
        if (art?.effect?.type === "heal" && rolled.effect?.attempted) {
          await effects.rollReveal(
            { missed: !rolled.effect.applied, critical: false },
            rolled.effect.applied ? "HEALED" : "NO HEAL"
          );
          if (rolled.effect.applied) {
            await effects.playAbilityVfx(rolled.artId, { actor: attackerBefore, target: targetBefore, effect: rolled.effect });
            if (rolled.effect.healing > 0) await effects.floatText(unitCenter(metrics, attackerBefore), `+${rolled.effect.healing}`, "#8cf0a4");
          }
        }
      }
      const slain = findUnit(result.nextState, rolled.targetId);
      if (!slain || slain.hp <= 0) await effects.deathDissolve(targetBefore.id, targetBefore.position, teamColor(targetBefore.player));
      for (const hitTarget of rolledTargetsBefore) {
        if (hitTarget.id === targetBefore.id) continue;
        const slainExtra = findUnit(result.nextState, hitTarget.id);
        if (!slainExtra || slainExtra.hp <= 0) await effects.deathDissolve(hitTarget.id, hitTarget.position, teamColor(hitTarget.player));
      }
    }
  }

  const handOfLifeEvent = events.find((e) => e.type === "HAND_OF_LIFE");
  if (handOfLifeEvent) {
    const paladinBefore = findUnit(state, handOfLifeEvent.actorId);
    const healedUnitsBefore = Object.keys(handOfLifeEvent.healingByTarget)
      .map((id) => findUnit(state, id))
      .filter(Boolean);
    if (paladinBefore && healedUnitsBefore.length) {
      await effects.playAbilityVfx("hand-of-life", { actor: paladinBefore, targets: healedUnitsBefore });
      await Promise.all(healedUnitsBefore.map((unit) => {
        const healed = handOfLifeEvent.healingByTarget[unit.id] ?? 0;
        return healed > 0
          ? effects.floatText(unitCenter(metrics, unit), `+${healed}`, "#f7e27d")
          : Promise.resolve();
      }));
    }
  }

  state = result.nextState;
  broadcastIfLocal(command);
  playEventSounds(events);
  playRolloverFx(events);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
  maybeStartCpuTurn();
  return true;
}

// A wall is attacked like a unit (it can't dodge, so there's no roll), but it gets
// the SAME attacker lunge/projectile animation as a normal strike instead of just
// popping. Impact lands on the wall; a destroyed wall bursts into stone shards.
async function resolveWallAttack(command) {
  const result = applyCommand(state, command);
  if (!result.accepted) { setMessage(readableError(result.errorCode), true); return false; }
  const event = (result.events ?? []).find((e) => e.type === "WALL_ATTACKED");

  const prevPlayer = state.currentPlayer;
  resolving = true;
  mode = null; footworkPath = []; volleyShotOrigin = null;
  render();

  const metrics = createBoardMetrics(state.size);
  const attackerBefore = findUnit(state, command.actorId);
  if (event && attackerBefore) {
    const ranged = getUnitType(attackerBefore.type).stats.attackRange > 1;
    const center = unitCenter(metrics, { position: event.position });
    await effects.animateAttack(attackerBefore, { id: `wall:${positionKey(event.position)}`, position: event.position }, ranged);
    audio.play(ranged ? "arrowHit" : "attackHit");
    effects.impact(center, false);
    effects.shake(5);
    if (event.destroyed) {
      audio.play("wallBreak");
      effects.deathBurst(center, "#9a9384");
      setMessage("Wall destroyed.");
    } else {
      setMessage(`Wall struck — ${event.hpAfter} HP left.`);
    }
  }

  state = result.nextState;
  broadcastIfLocal(command);
  playEventSounds(result.events ?? []);
  playRolloverFx(result.events ?? []);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
  maybeStartCpuTurn();
  return true;
}

async function resolveInstantArt(command) {
  const result = applyCommand(state, command);
  if (!result.accepted) { setMessage(readableError(result.errorCode), true); return false; }
  const events = result.events ?? [];
  const resolved = events.find((e) => e.type === "ART_RESOLVED");
  const actorBefore = resolved ? findUnit(state, resolved.actorId) : null;
  const targetIds = resolved?.targetIds ?? resolved?.harmed ?? (resolved?.targetId ? [resolved.targetId] : []);
  const targetsBefore = targetIds.map((id) => findUnit(state, id)).filter(Boolean);
  const prevPlayer = state.currentPlayer;

  resolving = true;
  mode = null; footworkPath = []; volleyShotOrigin = null;
  render();

  if (resolved?.artId === "footwork" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    // Map each harmed enemy to its tile so we can strike it as the dasher arrives there,
    // instead of dumping every hit after the slide. The dasher glides tile-by-tile and
    // the contact fires the recoil/damage/death the moment it reaches the occupied tile.
    const harmedByTile = new Map(targetsBefore.map((target) => [positionKey(target.position), target]));
    await effects.footworkCharge(actorBefore, resolved.path, async (tile) => {
      const target = harmedByTile.get(positionKey(tile));
      if (!target) return;
      const center = unitCenter(metrics, target);
      audio.play("attackHit");
      effects.impact(center, false, "true");
      await effects.hitRecoil(target.id, target.position, false);
      await effects.floatText(center, "-2", "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    });
  } else if (resolved?.artId === "volley-shot" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const coneCells = getVolleyShotCells(state, actorBefore, resolved.targetPosition) ?? [];
    await effects.playAbilityVfx("volley-shot", {
      actor: actorBefore,
      targets: targetsBefore,
      targetPosition: resolved.targetPosition,
      coneCells
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      await effects.hitRecoil(target.id, target.position, false);
      await effects.floatText(center, "-2", "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "flee" && actorBefore) {
    await effects.playAbilityVfx("flee", {
      actor: actorBefore,
      targets: [],
      path: resolved.path ?? [actorBefore.position]
    });
  } else if (resolved?.artId === "summon-ghoul" && actorBefore) {
    const ghoul = findUnit(result.nextState, resolved.summonedUnitId);
    if (ghoul) await effects.playAbilityVfx("summon-ghoul", { actor: actorBefore, targets: [ghoul] });
  } else if (resolved?.artId === "build-cover" && resolved.position) {
    const point = unitCenter(createBoardMetrics(state.size), { position: resolved.position });
    audio.play("buildCover");
    effects.impact(point, false);
    effects.shake(4);
  } else if (resolved?.artId === "throw-cigar" && resolved.position && actorBefore) {
    // The cigar visibly tumbles from the Sniper to the tile before the fire takes
    // (the lob recipe plays the throwCigar sound and lands its own impact).
    await effects.playAbilityVfx("throw-cigar", { actor: actorBefore, targetPosition: resolved.position });
  } else if (resolved?.artId === "age" && actorBefore) {
    // A time-mote glides to the target; the ±stat change floats where it lands.
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("age", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore) {
      const stat = resolved.stat === "defense" ? "DEF" : "STR";
      const label = `${resolved.delta >= 0 ? "+" : "−"}${Math.abs(resolved.delta)} ${stat}`;
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), label, resolved.delta >= 0 ? "#8cf0a4" : "#ff9d6b");
    }
  } else if (resolved?.artId === "time-stretch" && actorBefore) {
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("time-stretch", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.effect?.applied) {
      const enemy = targetBefore.player !== actorBefore.player;
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), enemy ? "SLOW" : "HASTE", enemy ? "#70b7ff" : "#8cf0a4");
    }
  } else if (resolved?.artId === "rewind") {
    // The revived ally rises from the placement tile (summon-rise motif, warm palette).
    const revived = findUnit(result.nextState, resolved.revivedUnitId);
    if (revived) {
      await effects.playAbilityVfx("rewind", { actor: actorBefore ?? revived, targets: [revived] });
      await effects.floatText(unitCenter(createBoardMetrics(state.size), revived), "REWIND", "#f7e9c0");
    }
  } else if (resolved?.stance !== undefined && actorBefore) {
    // Witch Doctor dances: a global team/board ritual, never a single-target cast.
    // One VFX (`ritual`) plays against every unit the reducer says the ritual
    // actually reached (`beaconTargetIds`), then every numeric/status outcome the
    // reducer recorded gets its own floating text — heals, MP, buffs, cleanses,
    // and the global blind all read exactly like every other ability's feedback.
    const metrics = createBoardMetrics(state.size);
    const beaconTargets = (resolved.beaconTargetIds ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: beaconTargets });

    const floats = [];
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4"));
    }
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#8cc8ff"));
    }
    if (resolved.buffed?.length && resolved.buffLabel) {
      for (const id of resolved.buffed) {
        const unit = findUnit(state, id);
        if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), resolved.buffLabel, "#ffb45e"));
      }
    }
    for (const id of resolved.cleansed ?? []) {
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), "CLEANSED", "#c89cff"));
    }
    if (resolved.selfBuffed && resolved.selfBuffLabel) {
      floats.push(effects.floatText(unitCenter(metrics, actorBefore), resolved.selfBuffLabel, "#ff9a4c"));
    }
    for (const id of resolved.statusTargets ?? []) {
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), "BLIND", "#f0d77a"));
    }
    await Promise.all(floats);
  } else if (resolved?.artId === "tether-grab" && actorBefore) {
    // Fire the tether, then — on a landed grab — haul the unit to the Juggernaut's side and
    // land the magic hit if it was an enemy. `state` is still pre-commit, so the target
    // reads at its old tile; a missed enemy grab hauls no one, so float MISS in place.
    const metrics = createBoardMetrics(state.size);
    const target = findUnit(state, resolved.targetId);
    await effects.playAbilityVfx("tether-grab", { actor: actorBefore, targets: target ? [target] : [] });
    // An enemy grab rolls to-hit like any strike — reveal the die before hauling/damaging.
    // An ally grab (rolled === false) is pure repositioning and always lands, so no reveal.
    if (resolved.rolled) await effects.rollReveal({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) });
    if (resolved.missed) {
      if (target) await effects.floatText(unitCenter(metrics, target), "MISS", "#c9d4e8");
    } else {
      if (target && resolved.from && resolved.to) await effects.animateMovement(target.id, resolved.from, resolved.to);
      if (target && resolved.damage > 0) {
        const center = unitCenter(metrics, { position: resolved.to });
        effects.impact(center, resolved.critical, "magic");
        await effects.floatText(center, `-${resolved.damage}`, "#c89cff");
        const after = findUnit(result.nextState, target.id);
        if (!after || after.hp <= 0) await effects.deathDissolve(target.id, resolved.to, teamColor(target.player));
      }
    }
  } else if (resolved?.artId === "rocket-punch" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const target = findUnit(state, resolved.targetId);
    await effects.playAbilityVfx("rocket-punch", { actor: actorBefore, targets: target ? [target] : [] });
    // Rocket Punch always rolls to-hit — reveal the die before the impact resolves.
    await effects.rollReveal({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) });
    if (target) {
      if (resolved.missed) {
        await effects.floatText(unitCenter(metrics, target), "MISS", "#c9d4e8");
      } else {
        const dmg = resolved.damageByTarget?.[target.id] ?? 0;
        const center = unitCenter(metrics, target);
        if (dmg > 0) {
          effects.impact(center, resolved.critical, "physical");
          effects.shake(resolved.critical ? 10 : 7);
          await effects.hitRecoil(target.id, target.position, resolved.critical);
          await effects.floatText(center, `-${dmg}`, "#ff7684");
        }
        if (resolved.stunned) await effects.floatText(center, "STUN", "#ffe45e");
        const after = findUnit(result.nextState, target.id);
        if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
      }
    }
  } else if (resolved?.artId === "recharge" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("recharge", { actor: actorBefore, targets: [actorBefore] });
    if (resolved.mpRestored > 0) await effects.floatText(unitCenter(metrics, actorBefore), `+${resolved.mpRestored} MP`, "#7fd0ff");
    else if (resolved.hpHealed > 0) await effects.floatText(unitCenter(metrics, actorBefore), `+${resolved.hpHealed}`, "#8cf0a4");
  } else if (resolved?.artId === "self-destruct" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("self-destruct", { actor: actorBefore, targets: targetsBefore });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#ffffff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    // The core overloads — the Juggernaut is consumed.
    await effects.deathDissolve(actorBefore.id, actorBefore.position, teamColor(actorBefore.player));
  } else if (resolved?.damageByTarget && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: targetsBefore
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#c89cff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.healingByTarget && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: targetsBefore
    });
    await Promise.all(targetsBefore.map((target) => {
      const healed = resolved.healingByTarget[target.id] ?? 0;
      return healed > 0
        ? effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4")
        : Promise.resolve();
    }));
  } else if (resolved?.effect && actorBefore) {
    const targetBefore = targetsBefore[0];
    if (targetBefore && resolved.effect.attempted) {
      const statusLabel = resolved.effect.status?.toUpperCase() ?? "STATUS";
      await effects.rollReveal(
        { missed: !resolved.effect.applied, critical: false },
        resolved.effect.applied ? statusLabel : "RESISTED"
      );
      if (resolved.effect.applied) {
        await effects.playAbilityVfx(resolved.artId, {
          actor: actorBefore,
          target: targetBefore,
          effect: resolved.effect
        });
        await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), statusLabel, "#c89cff");
      }
    }
  }

  state = result.nextState;
  broadcastIfLocal(command);
  playEventSounds(events);
  playRolloverFx(events);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
  maybeStartCpuTurn();
  return true;
}

// --- CPU driver ---
//
// The CPU drives its whole squad turn here. It asks the AI for one activation at a
// time and replays each command through the SAME reducer + resolvers a human's clicks
// use — so what the CPU does is animated and validated identically. Input stays locked
// (`resolving`) for the duration; control returns to the human when the turn passes
// back or the match ends. A change in `matchEpoch` (a new match started) abandons the
// loop immediately.

// Fired at the tail of every human commit path. Kicks the CPU turn the moment the turn
// passes to a computer-controlled seat; guarded so it never re-enters or stacks.
function maybeStartCpuTurn() {
  if (cpuThinking || state.phase !== "playing" || !isCpu(state.currentPlayer)) return;
  cpuThinking = true;
  void runCpuTurn().finally(() => { cpuThinking = false; });
}

async function runCpuTurn() {
  const epoch = matchEpoch;
  resolving = true;
  selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null;
  render();
  setMessage(`Player ${state.currentPlayer} (CPU) is planning…`);
  await sleep(CPU_TURN_LEAD_MS);

  // The guard is belt-and-braces against a planning bug; chooseActivation always
  // returns at least a defend, so a living squad cannot truly stall.
  let guard = 0;
  while (epoch === matchEpoch && state.phase === "playing" && isCpu(state.currentPlayer) && guard < CPU_MAX_ACTIVATIONS) {
    guard += 1;
    const commands = chooseActivation(state, {
      difficulty: cpu.difficulty,
      cpuPlayer: state.currentPlayer,
      rng: cpuRng(state)
    });
    if (!commands.length) break;

    for (const command of commands) {
      if (epoch !== matchEpoch) return;
      const applied = await applyCpuCommand(command);
      resolving = true; // the per-command resolvers clear it; keep input locked through the turn
      if (!applied || state.phase !== "playing") break;
    }

    if (epoch !== matchEpoch) return;
    if (state.phase !== "playing") break;
    await sleep(CPU_ACTIVATION_GAP_MS);
  }

  if (epoch !== matchEpoch) return;
  resolving = false;
  if (state.phase === "complete") { render(); return; }
  selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null;
  render();
  setMessage("Your squad turn. Select a ready commander.");
}

// Route one CPU command to the resolver that animates its events — the same resolvers
// the human path uses. BEGIN/DEFEND/FINISH are instant (sync dispatch); a move slides;
// an attack and a strike ART roll (resolveCombat); every other ART is instant.
async function applyCpuCommand(command) {
  switch (command.type) {
    case "BEGIN_ACTIVATION": {
      if (!dispatch(command)) return false;
      selectedId = command.unitId;
      const unit = findUnit(state, command.unitId);
      if (unit) setMessage(`Player ${unit.player} (CPU) activates its ${getUnitType(unit.type).name}.`);
      render();
      await sleep(CPU_STEP_MS);
      return true;
    }
    case "MOVE_UNIT":
      return resolveCpuMove(command, { keepResolving: true });
    case "CANCEL_MOVE": {
      const ok = dispatch(command);
      render();
      return ok;
    }
    case "ATTACK":
      return command.targetPosition ? resolveWallAttack(command) : resolveCombat(command);
    case "DEFEND": {
      const ok = dispatch(command);
      render();
      return ok;
    }
    case "USE_ART": {
      // A strike ART rolls to-hit (resolveCombat handles ART_RESOLVED-with-hit); every
      // other ART is instant. Peek the events to route — applyCommand is pure.
      const peek = applyCommand(state, command);
      const rolled = (peek.events ?? []).some((e) => e.type === "ART_RESOLVED" && "hit" in e);
      return rolled ? resolveCombat(command) : resolveInstantArt(command);
    }
    case "FINISH_ACTIVATION": {
      const ok = dispatch(command);
      render();
      return ok;
    }
    default:
      return false;
  }
}

async function resolveCpuMove(command, options) {
  return resolveAnimatedMove(command, {
    getState: () => state,
    setResolving: (value) => { resolving = value; },
    findUnit,
    dispatch,
    render,
    effects,
  }, options);
}

// --- Online driver ---
//
// The lockstep session (src/online/onlineSession.js) calls into `onlineController`:
// it replays the opponent's accepted commands through applyRemoteCommand (the SAME
// reducer + resolvers a human's clicks use, so a remote move animates and validates
// identically), reads getMatchState for the per-revision hash, and routes
// disconnect/desync endings here. We push our own accepted commands the other way
// via net.onLocalCommandApplied (the broadcastIfLocal hook on every commit path).

// Replay one command the opponent broadcast. `applyingRemote` suppresses the
// broadcast hook so we don't echo it back; the session serializes these so they
// never overlap an in-flight animation. Routing mirrors applyCpuCommand — the same
// animated resolvers — plus a CONCEDE case for a forfeit/disconnect.
async function applyRemoteCommand(command) {
  applyingRemote = true;
  try {
    switch (command.type) {
      case "BEGIN_ACTIVATION": {
        if (!dispatch(command)) return;
        selectedId = command.unitId;
        const unit = findUnit(state, command.unitId);
        if (unit) setMessage(`Opponent activates its ${getUnitType(unit.type).name}.`);
        render();
        await sleep(CPU_STEP_MS);
        return;
      }
      case "MOVE_UNIT": await resolveCpuMove(command); return;
      case "CANCEL_MOVE": dispatch(command); render(); return;
      case "ATTACK":
        if (command.targetPosition) await resolveWallAttack(command);
        else await resolveCombat(command);
        return;
      case "DEFEND": dispatch(command); render(); return;
      case "USE_ART": {
        // A strike ART rolls to-hit (resolveCombat handles the hit path); every other
        // ART is instant. Peek the events to route — applyCommand is pure.
        const peek = applyCommand(state, command);
        const rolled = (peek.events ?? []).some((e) => e.type === "ART_RESOLVED" && "hit" in e);
        if (rolled) await resolveCombat(command); else await resolveInstantArt(command);
        return;
      }
      case "FINISH_ACTIVATION": dispatch(command); render(); return;
      case "CONCEDE": dispatch(command); render(); return;
      default: return;
    }
  } finally {
    applyingRemote = false;
  }
}

// The session bridge's view of us — method names match onlineSession's expectations.
const onlineController = {
  getMatchState: () => state,
  applyRemoteCommand,
  // A peer dropped and we're the owner: inject a concede for its seat into the
  // ordered command stream. Goes through the LOCAL path (dispatch), so it broadcasts
  // and advances exactly like any other command.
  applyOwnerConcede(seat) {
    if (!net) return;
    dispatch(concede(seat));
    render();
  },
  endOnDesync() { endOnlineMatch("Match desynced", "The game states diverged. Match ended."); },
  endOnDisconnect(reason) { endOnlineMatch("Disconnected", reason || "Lost connection to the match."); },
};

// Tear down an online match that ended abnormally (desync / lost connection) and
// drop back to the menu. The clean-win path uses net.endMatch() instead (it keeps
// the socket alive briefly so the peer can finish animating).
function endOnlineMatch(title, sub) {
  if (!net) return;
  net.dispose();
  net = null;
  mySeat = null;
  resolving = true;
  turnFlash.announce({ title, sub, color: "#c4463f", hold: true });
  setMessage(sub, true);
  window.clearTimeout(resultsTimer);
  resultsTimer = window.setTimeout(() => { resolving = false; menu.show("mainMenu"); }, 2200);
}

function maybeAutoFinish() {
  const activation = state.activation;
  if (activation && activation.moved && activation.primaryUsed) {
    dispatch(finishActivation(state.currentPlayer, activation.unitId));
    setMessage("Activation complete. The next commander takes the field.");
  }
}

function finishNow() {
  const activation = state.activation;
  if (activation && activation.primaryUsed) {
    dispatch(finishActivation(state.currentPlayer, activation.unitId));
    setMessage("Activation complete. The next commander takes the field.");
  }
}

// --- Sound routing ---

function playAttackImpactSound(rolled, ranged) {
  if (rolled.missed) { audio.play("miss"); return; }
  if (rolled.defended) { audio.play("defendedHit"); return; }
  if (rolled.artId === "spark")  { audio.play("spark");  return; }
  if (rolled.artId === "banish") { audio.play("banish"); return; }
  if (rolled.effect?.applied && rolled.artId === "life-sap") audio.play("lifeSap");
  audio.play(ranged ? "arrowHit" : "attackHit");
}

function artDefinition(unit, artId) {
  return getUnitType(unit.type).arts.find((art) => art.id === artId);
}

function unitCenter(metrics, unit) {
  const screen = gridToScreen(metrics, unit.position.x, unit.position.y);
  return { x: screen.x, y: screen.y + metrics.tileHeight * 0.45 };
}

function playEventSounds(events) {
  for (const event of events) {
    if ("hit" in event) continue; // rolled strikes are voiced by resolveCombat
    if (event.type === "UNIT_MOVED") audio.play("unitMove");
    else if (event.type === "UNIT_DEFENDED") audio.play("defend");
    else if (event.type === "ART_RESOLVED") {
      const artId = event.artId;
      // VFX-managed arts play their own sound through the animation path
      if (artId === "footwork" || artId === "flee" || artId === "nuke" ||
          artId === "spark" || artId === "pray" || artId === "wish" ||
          artId === "lightseeker" || artId === "darkseeker" ||
          artId === "dark-bomb" || artId === "summon-ghoul" ||
          artId === "smoke-bomb" || artId === "build-cover" || artId === "throw-cigar" ||
          artId === "age" || artId === "time-stretch" || artId === "rewind" ||
          artId === "tether-grab" || artId === "rocket-punch" || artId === "recharge" ||
          artId === "self-destruct") continue;
      const ranged = findUnit(state, event.actorId)?.type === "archer";
      if (event.healingByTarget) audio.play("heal");
      else if (artId === "volley-shot") audio.play("arrowHit");
      else if (artId === "silence" || event.effect?.status === "silence") audio.play("silenceApplied");
      else if (ranged) { audio.play("arrowAirborne"); audio.play("arrowHit"); }
      else audio.play("attackHit");
    }
  }
}

// Fire-tile burns happen at the rollover (inside the reducer), so they surface as
// FIRE_DAMAGE events on whatever action ended the turn. Voice + float them here —
// fire-and-forget, since a board hazard shouldn't block input. `state` is already
// the committed post-rollover state when this runs.
function playRolloverFx(events) {
  const burns = events.filter((e) => e.type === "FIRE_DAMAGE");
  const steals = events.filter((e) => e.type === "TIME_STEAL");
  if (!burns.length && !steals.length) return;
  const metrics = createBoardMetrics(state.size);
  let killed = false;

  if (burns.length) audio.play("fireTick");
  for (const burn of burns) {
    const center = unitCenter(metrics, { position: burn.position });
    effects.impact(center, false, "fire");
    effects.floatText(center, `-${burn.damage}`, "#ff9a3c");
    const after = findUnit(state, burn.unitId);
    if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
  }

  // Father Time's Time Steal drains nearby enemies at the rollover (true damage) and
  // refunds him MP — voice + float both, fire-and-forget like the fire burns above.
  if (steals.length) {
    audio.play("timeSteal");
    for (const steal of steals) {
      const center = unitCenter(metrics, { position: steal.position });
      effects.impact(center, false, "true");
      effects.floatText(center, `-${steal.damage}`, "#c9b3ff");
      const after = findUnit(state, steal.unitId);
      if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
    }
    for (const mp of events.filter((e) => e.type === "TIME_STEAL_MP")) {
      const src = findUnit(state, mp.sourceId);
      if (src) effects.floatText(unitCenter(metrics, src), `+${mp.mpGained} MP`, "#7fd0ff");
    }
  }

  if (killed) audio.play("unitDefeated");
}

// --- Input ---

function beginUnit(unit) {
  if (inputLocked()) return;
  if (unit.player !== state.currentPlayer || unit.spent || unit.hp <= 0 || isStunned(unit)) return;
  // Re-selecting the already-active unit (e.g. after deselecting mid-activation)
  // should not re-dispatch beginActivation — that would reset moved/primaryUsed.
  if (state.activation?.unitId === unit.id) {
    selectedId = unit.id;
    mode = null;
    volleyShotOrigin = null;
    audio.play("unitSelect");
    setMessage(`${getUnitType(unit.type).name} ready. Choose an action.`);
    return;
  }
  if (dispatch(beginActivation(unit.player, unit.id))) {
    selectedId = unit.id;
    mode = null;
    volleyShotOrigin = null;
    audio.play("unitSelect");
    setMessage(`${getUnitType(unit.type).name} ready. Choose an action.`);
  }
}

async function handleTile(position) {
  if (inputLocked()) return;
  const unit = selectedUnit();
  if (!unit) {
    const clicked = unitAt(state, position);
    if (clicked) beginUnit(clicked);
    render();
    return;
  }
  if (mode === "move") {
    const from = { ...unit.position };
    if (dispatch(moveUnit(state.currentPlayer, unit.id, position.x, position.y))) {
      const completesActivation = state.activation?.primaryUsed;
      mode = null;
      setMessage(completesActivation ? "Moved. Activation complete." : "Moved. Now attack or defend to finish.");
      resolving = true;
      render();
      await effects.animateMovement(unit.id, from, position);
      resolving = false;
      if (completesActivation) maybeAutoFinish();
      render();
      return;
    }
  } else if (mode === "attack") {
    const target = unitAt(state, position);
    if (target) {
      if (await resolveCombat(attack(state.currentPlayer, unit.id, target.id))) {
        mode = null;
        setMessage("Attack resolved.");
        maybeAutoFinish();
      }
    } else if (isWallAt(state, position)) {
      if (await resolveWallAttack(attackTile(state.currentPlayer, unit.id, position.x, position.y))) {
        mode = null;
        maybeAutoFinish();
      }
    }
  } else if (mode === "footwork") {
    const options = getFootworkStepOptions(state, unit, footworkPath);
    if (!options.has(positionKey(position))) { setMessage("Choose the next highlighted Footwork tile.", true); }
    else {
      footworkPath.push(position);
      const steps = getFootworkSteps(unit);
      if (footworkPath.length === steps) {
        if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "footwork", [...footworkPath])))
          setMessage("Footwork complete. This unit's activation is complete.");
      } else {
        setMessage(`Footwork: choose step ${footworkPath.length + 1} of ${steps}.`);
      }
    }
  } else if (mode === "art:flee") {
    const fleeLegal = getLegalFleeTiles(state, unit);
    if (!fleeLegal.has(positionKey(position))) {
      setMessage("Flee: choose a highlighted empty tile to teleport to.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "flee", { targetPosition: position }))) {
      mode = null;
      setMessage("Flee complete. This unit's activation is complete.");
    }
  } else if (mode === "art:volley-shot") {
    if (!getVolleyShotAimOptions(state, unit).some((c) => positionKey(c) === positionKey(position))) {
      setMessage("Hover a highlighted direction to preview the cone, then click to fire.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "volley-shot", { targetPosition: position }))) {
      setMessage("Volley Shot resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:summon-ghoul") {
    const placement = getSummonPlacementTiles(state, unit, getUnitType(unit.type).arts.find((a) => a.id === "summon-ghoul"));
    if (!placement.has(positionKey(position))) {
      setMessage("Summon Ghoul: choose a highlighted empty tile near the Necromancer.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "summon-ghoul", { targetPosition: position }))) {
      mode = null;
      setMessage("Ghoul raised. This unit's activation is complete.");
    }
  } else if (mode === "art:build-cover") {
    const placement = getWallPlacementTiles(state, unit, getUnitType(unit.type).arts.find((a) => a.id === "build-cover"));
    if (!placement.has(positionKey(position))) {
      setMessage("Build Cover: choose a highlighted empty tile to raise the wall.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "build-cover", { targetPosition: position }))) {
      mode = null;
      setMessage("Cover raised. This unit's activation is complete.");
    }
  } else if (mode === "art:throw-cigar") {
    const placement = getFirePlacementTiles(state, unit, getUnitType(unit.type).arts.find((a) => a.id === "throw-cigar"));
    if (!placement.has(positionKey(position))) {
      setMessage("Throw Cigar: choose a highlighted tile to set alight.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "throw-cigar", { targetPosition: position }))) {
      mode = null;
      setMessage("Fire started. This unit's activation is complete.");
    }
  } else if (mode === "art:age") {
    // Ally-or-enemy targeting, then a STR/DEF stat pick. A wall blocks the cast.
    const target = unitAt(state, position);
    const inReach = target && chebyshevDistance(unit.position, target.position) <= getEffectiveStats(unit, state).attackRange &&
      !isWallBetween(state, unit.position, target.position, unit);
    if (!inReach) {
      setMessage("Age: click a highlighted ally or enemy in range.", true);
    } else {
      const ally = areAllies(target, unit);
      const stat = await openChoiceModal({
        title: `Age — ${ally ? "empower" : "weaken"} ${getUnitType(target.type).name}`,
        subtitle: ally ? "Grant +1 to a stat until Father Time falls." : "Drain 1 from a stat until Father Time falls.",
        accent: teamColor(unit.player),
        choices: [
          { value: "strength", label: "Strength", sub: ally ? "+1 STR" : "−1 STR" },
          { value: "defense", label: "Defense", sub: ally ? "+1 DEF" : "−1 DEF" }
        ]
      });
      if (stat && mode === "art:age" && await resolveInstantArt(useArt(state.currentPlayer, unit.id, "age", { targetId: target.id, stat }))) {
        mode = null;
        setMessage("Age resolved. This unit's activation is complete.");
      }
    }
  } else if (mode === "art:time-stretch") {
    // Ally → +1 MOVE; enemy → Slow. A wall blocks the enemy path (not a friendly haste).
    const target = unitAt(state, position);
    const enemy = target && areEnemies(unit, target);
    const inReach = target && chebyshevDistance(unit.position, target.position) <= getEffectiveStats(unit, state).attackRange &&
      !(enemy && isWallBetween(state, unit.position, target.position, unit));
    if (!inReach) {
      setMessage("Time Stretch: click a highlighted ally or enemy in range.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "time-stretch", { targetId: target.id }))) {
      mode = null;
      setMessage("Time Stretch resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:tether-grab") {
    // Grab the first ally OR enemy on a straight ray within range.
    const target = unitAt(state, position);
    const targets = getLineTargets(state, unit, getArt(unit.type, "tether-grab").targeting.range, { includeAllies: true });
    if (!target || !targets.some((entry) => entry.unit.id === target.id)) {
      setMessage("Tether Grab: click a highlighted ally or enemy on a straight line.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "tether-grab", { targetId: target.id }))) {
      mode = null;
      setMessage("Tether Grab resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:rocket-punch") {
    // Punch the first ENEMY on a straight ray (an ally on the ray blocks the shot).
    const target = unitAt(state, position);
    const targets = getLineTargets(state, unit, getArt(unit.type, "rocket-punch").targeting.range, { includeAllies: false });
    if (!target || !targets.some((entry) => entry.unit.id === target.id)) {
      setMessage("Rocket Punch: click a highlighted enemy on a straight line.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "rocket-punch", { targetId: target.id }))) {
      mode = null;
      setMessage("Rocket Punch resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:rewind") {
    const placement = getRevivePlacementTiles(state, unit, getAvailableArts(unit).find((a) => a.id === "rewind"));
    if (!rewindTargetId) {
      setMessage("Rewind: choose a fallen ally first.", true);
    } else if (!placement.has(positionKey(position))) {
      setMessage("Rewind: click a highlighted empty tile within 3.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "rewind", { targetId: rewindTargetId, targetPosition: position }))) {
      mode = null;
      rewindTargetId = null;
      setMessage("An ally returns to the field. This unit's activation is complete.");
    }
  } else if (mode?.startsWith("art:")) {
    const artId = mode.slice("art:".length);
    const art = getAvailableArts(unit).find((a) => a.id === artId);
    if (art?.targeting?.shape === "nukeAura") {
      // Self-centred blast: any click inside the previewed footprint detonates it.
      const radius = getSelfBlastRadius(state, unit, art);
      if (chebyshevDistance(unit.position, position) > radius) {
        setMessage(`${art.name}: click inside the highlighted blast zone to detonate.`, true);
      } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId))) {
        mode = null;
        setMessage(`${art.name} resolved. This unit's activation is complete.`);
      }
    } else if (art?.effect?.type === "healAllies") {
      const clickedAlly = unitAt(state, position);
      if (!clickedAlly || clickedAlly.player !== unit.player) {
        setMessage("Click a highlighted ally to confirm.", true);
      } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId))) {
        mode = null;
        setMessage(`${art.name} resolved. This unit's activation is complete.`);
      }
    } else {
      const target = unitAt(state, position);
      const resolved = art?.resolution === "statusCast"
        ? target && await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetId: target.id }))
        : target && await resolveCombat(useArt(state.currentPlayer, unit.id, artId, { targetId: target.id }));
      if (resolved) {
        const artName = art?.name ?? artId;
        setMessage(`${artName} resolved. This unit's activation is complete.`);
      }
    }
  } else {
    const clicked = unitAt(state, position);
    if (clicked && clicked.player === state.currentPlayer && !clicked.spent && clicked.hp > 0 && clicked.id !== unit.id) {
      // Switch to another ready friendly unit (only allowed if current activation hasn't acted yet)
      beginUnit(clicked);
    } else {
      // Clicking self, empty tile, or enemy in no-mode → deselect
      selectedId = null;
      mode = null;
      setMessage("");
    }
  }
  render();
}

// Action button handler — called by renderActions with the action string.
async function handleActionClick(action, unit) {
  if (inputLocked()) return;
  if (action === "defend") {
    if (dispatch(defend(state.currentPlayer, unit.id))) {
      setMessage("Defending: incoming physical and magic damage is halved.");
      finishNow();
    }
    mode = null;
  } else if (action === "cancel-move") {
    if (dispatch(cancelMove(state.currentPlayer, unit.id))) {
      selectedId = unit.id;
      mode = null;
      footworkPath = [];
      volleyShotOrigin = null;
      setMessage("Movement cancelled. Choose an action.");
    }
  } else if (action === "finish") {
    if (dispatch(finishActivation(state.currentPlayer, unit.id)))
      setMessage("Activation complete. The next commander takes the field.");
  } else {
    const deselect = mode === action;
    mode = deselect ? null : action;
    footworkPath = [];
    volleyShotOrigin = null;
    rewindTargetId = null;
    if (deselect) {
      setMessage("Choose an action below.");
    } else if (action === "footwork") {
      const footwork = getUnitType(unit.type).arts.find((a) => a.id === "footwork");
      setMessage(`Footwork (${footwork.mpCost} MP): ${footwork.description} Choose step 1 of ${getFootworkSteps(unit)}.`);
    } else if (action.startsWith("art:")) {
      const artId = action.slice(4);
      const art = getAvailableArts(unit).find((a) => a.id === artId);
      if (art?.targeting?.shape === "revive") {
        // Rewind: pick which fallen ally to bring back FIRST (a pop-up), then place them
        // on a highlighted tile. `mode` stays "art:rewind" so the board lights placement
        // tiles behind the pop-up and after it closes.
        const fallen = getReviveTargets(state, unit);
        if (!fallen.length) {
          mode = null;
          setMessage("Rewind: no fallen allies to bring back.", true);
          render();
          return;
        }
        setMessage(`${art.name} (${art.mpCost} MP): choose a fallen ally to bring back.`);
        render();
        const chosen = await openChoiceModal({
          title: "Rewind — bring back",
          subtitle: "Return a fallen ally to the field, fully healed.",
          accent: teamColor(unit.player),
          choices: fallen.map((ally) => ({ value: ally.id, label: getUnitType(ally.type).name, sub: "Fallen · returns at full HP", type: ally.type }))
        });
        if (!chosen || mode !== "art:rewind") {
          mode = null;
          rewindTargetId = null;
          setMessage("Rewind cancelled. Choose an action below.");
          render();
          return;
        }
        rewindTargetId = chosen;
        setMessage(`${art.name}: click a highlighted tile within 3 to place ${getUnitType(findUnit(state, chosen).type).name}.`);
        render();
        return;
      }
      if (art?.selfCast) {
        // Self-centred AoE blasts (Dark Bomb, Nuke) preview their detonation
        // footprint first — staying in art mode lets the board light the blast
        // zone and its victims; a click inside the zone confirms (see handleTile).
        // Every other selfCast resolves immediately.
        if (art.targeting?.shape === "nukeAura") {
          setMessage(`${art.name} (${art.mpCost} MP): ${art.description} Click inside the highlighted blast zone to detonate.`);
          render();
          return;
        }
        if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId))) {
          setMessage(art.bonusActionGroup
            ? `${art.name} resolved. Take the rest of this unit's turn.`
            : `${art.name} resolved. This unit's activation is complete.`);
        }
        render();
        return;
      }
      const lead = action === "art:volley-shot"
        ? "Hover a direction to preview the cone, then click to fire."
        : action === "art:flee"
          ? "Choose a highlighted empty tile to teleport to."
          : action === "art:summon-ghoul"
            ? "Choose a highlighted empty tile to raise the Ghoul."
            : action === "art:build-cover"
              ? "Choose a highlighted empty tile to raise the wall."
              : action === "art:throw-cigar"
                ? "Choose a highlighted tile to set alight."
                : art?.effect?.type === "healAllies"
                  ? "Click any highlighted ally to confirm."
                  : art?.targeting?.shape === "allyOrEnemy"
                    ? "Click a highlighted ally or enemy in range."
                    : art?.targeting?.shape === "lineAny"
                      ? "Click a highlighted ally or enemy on a straight line to grab it."
                      : art?.targeting?.shape === "lineEnemy"
                        ? "Click a highlighted enemy on a straight line to punch it."
                        : art?.resolution === "statusCast"
                          ? "Choose a highlighted enemy target."
                          : "Choose a highlighted enemy target.";
      // Line abilities: the purple wash shows the ability's reach on every ray; if nothing
      // is actually in line there is no legal target, so say so rather than leaving the
      // player clicking an empty ray and wondering why nothing resolves.
      const lineShape = art?.targeting?.shape === "lineAny" || art?.targeting?.shape === "lineEnemy";
      const noLineTarget = lineShape &&
        getLineTargets(state, unit, art.targeting.range, { includeAllies: art.targeting.shape === "lineAny" }).length === 0;
      if (noLineTarget) {
        setMessage(`${art.name} (${art.mpCost} MP): the purple tiles show its reach, but nothing is in a straight line right now. Reposition, or Escape to choose another action.`, true);
        render();
        return;
      }
      setMessage(`${art.name} (${art.mpCost} MP): ${art.description} ${lead}`);
    } else {
      setMessage(`Choose a highlighted ${action} tile.`);
    }
  }
  render();
}

// --- Input wiring ---

document.querySelector("#restartBtn").addEventListener("click", resetBattle);
document.querySelector("#rulesBtn").addEventListener("click", openCodex);

const muteBtn = document.querySelector("#muteBtn");
muteBtn.addEventListener("click", () => {
  muted = !muted;
  audio.setEnabled(!muted);
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.classList.toggle("is-muted", muted);
  muteBtn.textContent = muted ? "Muted" : "Sound";
  if (!muted && audioUnlocked && menu.active === "match") audio.startMusic("battle");
});

document.addEventListener("click", (event) => {
  if (!audioUnlocked) {
    audioUnlocked = true;
  }
  const button = event.target.closest("button");
  if (button && !button.disabled) audio.play("buttonClick");
});

// --- Mobile playability ---
// Track viewport posture (portrait rotate-gate vs. playable landscape) and feed
// it to the stylesheet via root data-attributes + --app-height.
applyMobileViewport();

// Capture every app tap before target handlers stop propagation (unit clicks
// call stopPropagation), so going fullscreen on phone landscape is an app-level
// affordance rather than a match-only one. No-op on desktop / non-landscape.
const requestAppFullscreen = () => { void requestMobileFullscreen(); };
document.addEventListener("click", requestAppFullscreen, { capture: true });

// --- Field Manual ---

// Context-aware: in a live match, open the Codex tab filtered to unit types
// in this battle. From menus, open the Basics tab with the full unit roster.
function openCodex() {
  if (menu.active === "match") {
    const battleTypes = [...new Set(state.units.map((u) => u.type))]
      .map((t) => UNIT_TYPES[t])
      .filter(Boolean);
    rulesModal.open("codex", battleTypes);
  } else {
    rulesModal.open("basics", null);
  }
}

// --- Keyboard ---

const HOTKEY_ACTIONS = { "1": "move", "2": "attack", "3": "defend", a: "footwork", A: "footwork", c: "cancel-move", C: "cancel-move", f: "finish", F: "finish", Enter: "finish" };
document.addEventListener("keydown", (event) => {
  if (rulesModal.isOpen || resolving) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
  if (event.key === "Escape") {
    if (mode) { mode = null; footworkPath = []; volleyShotOrigin = null; setMessage("Action cancelled. Choose an action."); render(); event.preventDefault(); }
    else if (selectedId) { selectedId = null; setMessage(""); render(); event.preventDefault(); }
    return;
  }
  const action = HOTKEY_ACTIONS[event.key];
  if (!action) return;
  const button = actions.querySelector(`button[data-action="${action}"]`);
  if (button && !button.disabled) { button.click(); event.preventDefault(); }
});

// --- Boot ---
menu.show("title");
