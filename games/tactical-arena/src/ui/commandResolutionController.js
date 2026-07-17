// The shared command-resolution loop: validate/prepare a command, apply it through
// the reducer, then present the accepted result (dispatch for synchronous commands,
// the rolled/instant resolvers for animated ones). Extracted from main.js so the
// match, the CPU driver, the online bridge, AND the dev sandbox all drive the exact
// same loop. Everything optional (tutorial validation, campaign hooks, broadcast,
// CPU kick, turn announcements) defaults to a no-op so a minimal host — the
// sandbox — can construct it with just state + presentation.
//
// Runtime contract: `state` get/set, `resolving` get/set, `tempoAnimating` get/set,
// `tempoBusy` set, `matchEpoch` get, plus optional `tutorial` and `matchConfig` gets.

import { finishActivation } from "../core/commands.js";
import { applyCommand } from "../core/reducer.js";
import { findUnit } from "../core/state.js";
import { getArt } from "../core/unitCatalog.js";
import { isTempoBattle } from "../core/tempoBattle.js";
import { positionKey } from "../rules/movement.js";
import { readableError } from "../match/matchBuilder.js";
import { recordOnlineValorEvents } from "../progression/valorRewards.js";
import { prepareTutorialCommand, validateTutorialCommand } from "../tutorials/basics.js";
import { createBoardMetrics } from "./isometric.js";
import { createResolutionGuard } from "./resolutionGuard.js";
import { prepareRolledCombatPresentation, presentRolledCombat } from "./rolledCombatPresenter.js";
import { presentInstantArt } from "./instantArtPresenter.js";
import { unitCenter } from "./battleEventPresenter.js";
import { hasTutorialPresentation } from "./tutorialPresentationController.js";
import { shouldUseRangedAttackAnimation, wallOreGainFloat } from "./combatPresentation.js";

export function createCommandResolutionController({
  runtime,
  interaction,
  effects,
  audio,
  eventPresenter,
  setMessage,
  render,
  selectedUnit,
  announceTurnChange = () => {},
  maybeStartCpuTurn = () => {},
  broadcastIfLocal = () => {},
  transformCommand = (command) => command,
  recordCampaignRejection = () => {},
  recordCampaignProgressHooks = () => {},
  recordTutorialProgress = () => {},
  queueTutorialPresentation = () => {},
  flushTutorialPresentation = () => {},
  consumeTutorialPrompt = (fallback) => fallback,
} = {}) {
  const { playArtCallout, playAttackImpactSound, playEventSounds, playRolloverFx } = eventPresenter;

  // Set by every successful dispatch() so a caller that needs the resolved events
  // (e.g. a trampling MOVE_UNIT's harmed/damageByTarget/path) can read them without
  // dispatch() itself growing animation concerns.
  let lastDispatchEvents = [];

  function clearActionMode() {
    interaction.mode = null;
    interaction.footworkPath = [];
    interaction.volleyShotOrigin = null;
  }

  function clearSelection() {
    interaction.selectedId = null;
    clearActionMode();
  }

  function resolveCommand(command) {
    const tutorial = runtime.tutorial ?? null;
    const validation = tutorial ? validateTutorialCommand(tutorial, command, runtime.state) : { accepted: true };
    if (!validation.accepted) {
      if (tutorial && hasTutorialPresentation(validation)) {
        queueTutorialPresentation(validation);
      }
      return {
        prepared: command,
        result: {
          accepted: false,
          errorCode: "TUTORIAL_BLOCKED",
          message: validation.message,
        },
      };
    }
    const prepared = transformCommand(tutorial ? prepareTutorialCommand(tutorial, command) : command);
    return { prepared, result: applyCommand(runtime.state, prepared) };
  }

  function commandErrorMessage(result, command, commandState = runtime.state) {
    return result.message ?? readableError(result.errorCode, commandState, command?.player ?? commandState?.currentPlayer);
  }

  function dispatch(command, { deferRolloverFx = false } = {}) {
    const prevPlayer = runtime.state.currentPlayer;
    const beforeState = runtime.state;
    const { prepared, result } = resolveCommand(command);
    if (!result.accepted) {
      recordCampaignRejection(prepared, result);
      setMessage(commandErrorMessage(result, prepared, beforeState), true);
      return false;
    }
    lastDispatchEvents = result.events ?? [];
    recordOnlineValorEvents(runtime.matchConfig, lastDispatchEvents);
    runtime.state = result.nextState;
    recordTutorialProgress(prepared, result, prevPlayer);
    recordCampaignProgressHooks(prepared, result, beforeState);
    broadcastIfLocal(prepared);
    playEventSounds(result.events ?? []);
    if (!deferRolloverFx) void playRolloverFx(result.events ?? []);
    if (runtime.state.activation) interaction.selectedId = runtime.state.activation.unitId;
    else clearSelection();
    announceTurnChange(prevPlayer);
    maybeStartCpuTurn();
    return true;
  }

  async function revealRoll(outcome, label = null, originUnit = null) {
    if (isTempoBattle(runtime.state)) {
      const unit = originUnit ?? selectedUnit();
      if (unit) {
        const text = label ?? (outcome.missed ? "MISS" : outcome.critical ? "CRIT" : "HIT");
        const color = outcome.missed ? "#cbb78b" : outcome.critical ? "#ffd26a" : "#f3dc86";
        await effects.floatText(unitCenter(createBoardMetrics(runtime.state.size), unit), text, color);
        return;
      }
    }
    await effects.rollReveal(outcome, label);
  }

  // Rolled actions (attack / wall) commit their resolved state and then animate. In CLASSIC
  // play the commit lands at the END (endResolve) and input stays locked across the animation
  // via `resolving`. In TEMPO it lands HERE, up front — so the player can command another ready
  // unit mid-animation without the end-of-animation commit clobbering it; `tempoAnimating` only
  // tells the real-time loop not to rebuild the board under the animation. Either way the
  // pre-commit board is drawn first so a dying target is still present to animate. NOTE: capture
  // every pre-command snapshot the animation needs BEFORE calling this — `state` becomes the
  // post-command board the instant it returns in tempo.
  function beginResolve(result, artCalloutEvent = null) {
    clearActionMode();
    if (artCalloutEvent) playArtCallout(artCalloutEvent);
    if (isTempoBattle(runtime.state)) {
      render();                        // pre-command board (targeting cleared, nothing committed yet)
      runtime.state = result.nextState; // commit up front, before animating
      runtime.tempoAnimating += 1;
    } else {
      runtime.resolving = true;
      render();
    }
  }

  // Retire a rolled action once its animation finishes. Classic commits here; tempo already
  // committed in beginResolve and only reconciles the board + selection.
  function endResolve(prepared, result, prevPlayer) {
    const events = result.events ?? [];
    const tempo = isTempoBattle(runtime.state);
    const beforeState = tempo ? null : runtime.state;
    if (tempo) runtime.tempoAnimating = Math.max(0, runtime.tempoAnimating - 1);
    else runtime.state = result.nextState;
    recordTutorialProgress(prepared, result, prevPlayer);
    recordCampaignProgressHooks(prepared, result, beforeState);
    broadcastIfLocal(prepared);
    playEventSounds(events);
    playRolloverFx(events);
    if (tempo) {
      // Only drop the selection if the piece we were commanding is spent/gone — never clobber a
      // unit the player switched to mid-animation.
      const sel = selectedUnit();
      if (!sel || sel.spent || sel.hp <= 0) clearSelection();
      if (runtime.tempoAnimating === 0) render();
    } else {
      if (!runtime.state.activation) clearSelection();
      render();
      runtime.resolving = false;
    }
    announceTurnChange(prevPlayer);
    maybeStartCpuTurn();
    flushTutorialPresentation();
    return true;
  }

  // Async resolution for rolled actions (basic ATTACK and targeted ARTS). Reveals
  // the roll, commits the resolved state, then plays impact FX. Non-rolled actions use
  // synchronous dispatch; instant ARTs use resolveInstantArt (commit-at-end).
  async function resolveCombat(command) {
    const guard = createResolutionGuard(runtime.matchEpoch, () => runtime.matchEpoch, { effects, revealRoll, playAttackImpactSound });
    const prevPlayer = runtime.state.currentPlayer;
    const { prepared, result } = resolveCommand(command);
    if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
    const events = result.events ?? [];
    const before = runtime.state;
    const presentation = prepareRolledCombatPresentation(before, events);

    beginResolve(result, events.find((event) => event.type === "ART_RESOLVED" && event.artId));
    await presentRolledCombat({
      before,
      result,
      events,
      ...presentation,
      effects: guard.effects,
      revealRoll: guard.revealRoll,
      playAttackImpactSound: guard.playAttackImpactSound,
      artDefinition,
    });

    if (!guard.current()) return false;
    return endResolve(prepared, result, prevPlayer);
  }

  // A wall is attacked like a unit (it can't dodge, so there's no roll), but it gets
  // the SAME attacker lunge/projectile animation as a normal strike instead of just
  // popping. Impact lands on the wall; a destroyed wall bursts into stone shards.
  async function resolveWallAttack(command) {
    const guard = createResolutionGuard(runtime.matchEpoch, () => runtime.matchEpoch, { effects, audio });
    const prevPlayer = runtime.state.currentPlayer;
    const { prepared, result } = resolveCommand(command);
    if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
    const event = (result.events ?? []).find((e) => e.type === "WALL_ATTACKED");

    const metrics = createBoardMetrics(runtime.state.size);
    const attackerBefore = findUnit(runtime.state, command.actorId); // captured before beginResolve commits
    beginResolve(result);
    if (event && attackerBefore) {
      const ranged = shouldUseRangedAttackAnimation(attackerBefore, { id: `wall:${positionKey(event.position)}`, position: event.position });
      const center = unitCenter(metrics, { position: event.position });
      await guard.effects.animateAttack(attackerBefore, { id: `wall:${positionKey(event.position)}`, position: event.position }, ranged);
      if (!guard.current()) return false;
      guard.audio.play(ranged ? "arrowHit" : "attackHit");
      guard.effects.impact(center, false);
      guard.effects.shake(5);
      if (event.destroyed) {
        guard.audio.play("wallBreak");
        guard.effects.deathBurst(center, "#9a9384");
        const oreFloat = wallOreGainFloat(event);
        if (oreFloat) await guard.effects.floatText(unitCenter(metrics, attackerBefore), oreFloat.text, oreFloat.color);
        if (!guard.current()) return false;
        setMessage("Wall destroyed.");
      } else {
        setMessage(`Wall struck — ${event.hpAfter} HP left.`);
      }
    }

    if (!guard.current()) return false;
    return endResolve(prepared, result, prevPlayer);
  }

  async function resolveInstantArt(command) {
    const guard = createResolutionGuard(runtime.matchEpoch, () => runtime.matchEpoch, { effects, audio, render, revealRoll });
    const prevPlayer = runtime.state.currentPlayer;
    const { prepared, result } = resolveCommand(command);
    if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
    const events = result.events ?? [];
    const resolved = events.find((e) => e.type === "ART_RESOLVED");
    const actorBefore = resolved ? findUnit(runtime.state, resolved.actorId) : null;
    const targetIds = resolved?.targetIds ?? resolved?.harmed ?? (resolved?.targetId ? [resolved.targetId] : []);
    const targetsBefore = targetIds.map((id) => findUnit(runtime.state, id)).filter(Boolean);

    runtime.resolving = true;
    // Instant ARTs commit at the END of their animation, so in tempo we briefly hold input to
    // keep a concurrent command from clobbering the pending commit. Cleared in the tail below.
    if (isTempoBattle(runtime.state)) runtime.tempoBusy = true;
    clearActionMode();
    playArtCallout(resolved);
    render();

    await presentInstantArt({
      state: runtime.state,
      result,
      resolved,
      actorBefore,
      targetsBefore,
      effects: guard.effects,
      audio: guard.audio,
      revealRoll: guard.revealRoll,
      artDefinition,
      render: guard.render,
    });

    if (!guard.current()) return false;

    const beforeState = runtime.state;
    runtime.state = result.nextState;
    recordTutorialProgress(prepared, result, prevPlayer);
    recordCampaignProgressHooks(prepared, result, beforeState);
    broadcastIfLocal(prepared);
    playEventSounds(events);
    playRolloverFx(events);
    if (runtime.state.activation) interaction.selectedId = runtime.state.activation.unitId;
    else clearSelection();
    render();
    announceTurnChange(prevPlayer);
    runtime.resolving = false;
    runtime.tempoBusy = false;
    maybeStartCpuTurn();
    flushTutorialPresentation();
    return true;
  }

  function maybeAutoFinish() {
    const activation = runtime.state.activation;
    if (activation && activation.moved && activation.primaryUsed) {
      dispatch(finishActivation(runtime.state.currentPlayer, activation.unitId));
      setMessage(consumeTutorialPrompt("Activation complete. The next commander takes the field."));
    }
  }

  function finishNow() {
    const activation = runtime.state.activation;
    if (activation && activation.primaryUsed) {
      dispatch(finishActivation(runtime.state.currentPlayer, activation.unitId));
      setMessage(consumeTutorialPrompt("Activation complete. The next commander takes the field."));
    }
  }

  function artDefinition(unit, artId) {
    return getArt(unit.type, artId);
  }

  return {
    get lastDispatchEvents() { return lastDispatchEvents; },
    commandErrorMessage,
    dispatch,
    finishNow,
    maybeAutoFinish,
    resolveCombat,
    resolveInstantArt,
    resolveWallAttack,
  };
}
