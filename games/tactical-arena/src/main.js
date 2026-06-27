import { attack, attackTile, beginActivation, defend, finishActivation, moveUnit, useArt } from "./core/commands.js";
import { UNIT_TYPES, getAvailableArts, getEffectiveStats, getUnitType } from "./core/unitCatalog.js";
import { createBattleState, findUnit, isWallAt, unitAt } from "./core/state.js";
import { canUseArt, getFirePlacementTiles, getFootworkStepOptions, getFootworkSteps, getLegalFleeTiles, getSummonPlacementTiles, getVolleyShotAimOptions, getVolleyShotCells, getWallPlacementTiles } from "./rules/arts.js";
import { chebyshevDistance, positionKey } from "./rules/movement.js";
import { applyCommand } from "./core/reducer.js";
import { createBoardMetrics, gridToScreen } from "./ui/isometric.js";
import { createEffects } from "./ui/effects.js";
import { TurnAnnouncer } from "./ui/turnFlash.js";
import { createMenuFlow } from "./ui/menuFlow.js";
import { DEFAULT_SQUAD } from "./ui/squadPicker.js";
import { AudioManager } from "./audio/sounds.js";
import { renderBoard } from "./ui/boardRenderer.js";
import { mountSceneBackdrop } from "./ui/sceneBackdrop.js";
import { renderForecast } from "./ui/forecastRenderer.js";
import { renderHeader, renderUnitCard, renderActions, renderSquads } from "./ui/hud.js";
import { RulesModal } from "./ui/rulesModal.js";
import { buildRoster, buildSummary, hpRemaining, readableError, teamColor } from "./match/matchBuilder.js";

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
let resolving = false;

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
const menu = createMenuFlow({ audio, onStartMatch: startMatch, openCodex });

// Atmospheric battle-view backdrop (parallax sky, fortress, fog, embers). Built
// once — it's independent of board size and presentation only.
mountSceneBackdrop(document.querySelector("#sceneBackdrop"));

// --- Render ---

function selectedUnit() {
  return selectedId ? findUnit(state, selectedId) : null;
}

function render() {
  const unit = selectedUnit();
  renderHeader(state, { turnTitle, turnSub, turnBanner });
  renderUnitCard(unit, state, unitCard);
  renderActions(unit, state, mode, { actions, actionHelp }, { resolving, onActionClick: (action) => handleActionClick(action, unit) });
  renderSquads(state, squadOverlays, (u) => { beginUnit(u); render(); });
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
  state = createBattleState({ size: config.size, units: buildRoster(config.squads, config.size) });
  effects.setMetrics(createBoardMetrics(config.size));
  matchConfig = config;
  matchStartedAt = Date.now();
  initialHpByPlayer = { 1: hpRemaining(state, 1), 2: hpRemaining(state, 2) };
  selectedId = null;
  mode = null;
  footworkPath = [];
  volleyShotOrigin = null;
  resolving = false;
  turnFlash.clear();
  setMessage("Player 1 opens the battle.");
  menu.show("match");
  if (audioUnlocked && !muted) audio.startMusic("battle");
  render();
  announceTurn(state.currentPlayer);
}

function resetBattle() {
  startMatch(matchConfig ?? { size: 13, squads: { 1: [...DEFAULT_SQUAD], 2: [...DEFAULT_SQUAD] } });
}

function announceTurn(player, { hold = false } = {}) {
  if (state.phase === "complete") {
    turnFlash.announce({ title: `Player ${state.winner} wins`, sub: "Victory", color: teamColor(state.winner), hold: true });
    return;
  }
  turnFlash.announce({ title: `Player ${player} squad turn`, sub: "Pass the device", color: teamColor(player), hold });
}

function announceTurnChange(prevPlayer) {
  if (state.phase === "complete") {
    announceTurn(state.winner);
    const summary = buildSummary(state, { matchStartedAt, initialHpByPlayer });
    window.clearTimeout(resultsTimer);
    resultsTimer = window.setTimeout(() => menu.showResults(summary), 1600);
  } else if (state.currentPlayer !== prevPlayer) {
    announceTurn(state.currentPlayer);
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
  playEventSounds(result.events ?? []);
  playRolloverFx(result.events ?? []);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  announceTurnChange(prevPlayer);
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
  const targetBefore = rolled ? findUnit(state, rolled.targetId) : null;

  if (rolled && attackerBefore && targetBefore) {
    const ranged = getUnitType(attackerBefore.type).stats.attackRange > 1;
    const center = unitCenter(metrics, targetBefore);

    await effects.animateAttack(attackerBefore, targetBefore, ranged);
    await effects.rollReveal({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) });
    playAttackImpactSound(rolled, ranged);

    if (rolled.missed) {
      await effects.floatText(center, "MISS", "#cbb78b");
    } else {
      const dmg = typeof rolled.damage === "number" ? rolled.damage : (rolled.damage?.damage ?? 0);
      if (rolled.critical) { effects.critFlash(); effects.shake(11); }
      else effects.shake(Math.min(8, 2.5 + dmg * 1.4));
      effects.impact(center, Boolean(rolled.critical));
      await effects.hitRecoil(targetBefore.id, targetBefore.position, Boolean(rolled.critical));
      await effects.floatText(center, rolled.critical ? `✦ ${dmg}` : `-${dmg}`, rolled.critical ? "#ffd26a" : "#ff7684");
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
  playEventSounds(events);
  playRolloverFx(events);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
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
  playEventSounds(result.events ?? []);
  playRolloverFx(result.events ?? []);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
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
    await effects.playAbilityVfx("footwork", {
      actor: actorBefore,
      targets: targetsBefore,
      path: resolved.path
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      await effects.hitRecoil(target.id, target.position, false);
      await effects.floatText(center, "-2", "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
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
  } else if (resolved?.artId === "throw-cigar" && resolved.position) {
    const point = unitCenter(createBoardMetrics(state.size), { position: resolved.position });
    audio.play("throwCigar");
    effects.impact(point, false);
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
  playEventSounds(events);
  playRolloverFx(events);
  if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
  return true;
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
          artId === "smoke-bomb" || artId === "build-cover" || artId === "throw-cigar") continue;
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
  if (!burns.length) return;
  audio.play("fireTick");
  const metrics = createBoardMetrics(state.size);
  let killed = false;
  for (const burn of burns) {
    const center = unitCenter(metrics, { position: burn.position });
    effects.floatText(center, `-${burn.damage}`, "#ff9a3c");
    const after = findUnit(state, burn.unitId);
    if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
  }
  if (killed) audio.play("unitDefeated");
}

// --- Input ---

function beginUnit(unit) {
  if (resolving) return;
  if (unit.player !== state.currentPlayer || unit.spent || unit.hp <= 0) return;
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
  if (resolving) return;
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
  } else if (mode?.startsWith("art:")) {
    const artId = mode.slice("art:".length);
    const art = getAvailableArts(unit).find((a) => a.id === artId);
    if (art?.targeting?.shape === "nukeAura") {
      // Self-centred blast: any click inside the previewed footprint detonates it.
      const radius = art.targeting.radius ?? 2;
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
  if (action === "defend") {
    if (dispatch(defend(state.currentPlayer, unit.id))) {
      setMessage("Defending: incoming physical and magic damage is halved.");
      finishNow();
    }
    mode = null;
  } else if (action === "finish") {
    if (dispatch(finishActivation(state.currentPlayer, unit.id)))
      setMessage("Activation complete. The next commander takes the field.");
  } else {
    const deselect = mode === action;
    mode = deselect ? null : action;
    footworkPath = [];
    volleyShotOrigin = null;
    if (deselect) {
      setMessage("Choose an action below.");
    } else if (action === "footwork") {
      const footwork = getUnitType(unit.type).arts.find((a) => a.id === "footwork");
      setMessage(`Footwork (${footwork.mpCost} MP): ${footwork.description} Choose step 1 of ${getFootworkSteps(unit)}.`);
    } else if (action.startsWith("art:")) {
      const artId = action.slice(4);
      const art = getAvailableArts(unit).find((a) => a.id === artId);
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
                  : art?.resolution === "statusCast"
                    ? "Choose a highlighted enemy target."
                    : "Choose a highlighted enemy target.";
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

const HOTKEY_ACTIONS = { "1": "move", "2": "attack", "3": "defend", a: "footwork", A: "footwork", f: "finish", F: "finish", Enter: "finish" };
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
