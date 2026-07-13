import { applyCommand } from "../core/reducer.js";
import { findUnit } from "../core/state.js";
import { getUnitType } from "../core/unitCatalog.js";
import { isTempoBattle, isTempoUnitReady } from "../core/tempoBattle.js";
import { resolveAnimatedMove } from "../ui/animatedCommands.js";
import { chooseTutorialCpuActivation } from "../tutorials/basics.js";
import { chooseActivation, cpuRng } from "./cpuController.js";

const CPU_TURN_LEAD_MS = 480;
const CPU_ACTIVATION_GAP_MS = 320;
export const CPU_STEP_MS = 260;
const CPU_MAX_ACTIVATIONS = 64;

export function findReadyTempoCpuPlayer(state, cpu, isReady = isTempoUnitReady) {
  return [...(cpu?.players ?? [])].find((player) => (
    state.units.some((unit) => unit.player === player && isReady(state, unit))
  )) ?? null;
}

export function createCpuTurnController({
  runtime,
  interaction,
  eventPresenter,
  dialogue,
  tutorialPresentation,
  isCpu,
  maybeShowCampaignDialogue = () => {},
  campaignCpuExcludedArtIds = () => [],
  dispatch = () => false,
  render = () => {},
  setMessage = () => {},
  sleep = async () => {},
  resolveCombat = async () => false,
  resolveWallAttack = async () => false,
  resolveInstantArt = async () => false,
  effects,
  playRolloverFx = () => {},
  consumeTutorialPrompt = (fallback) => fallback,
} = {}) {
  function clearInteraction() {
    interaction.selectedId = null;
    interaction.mode = null;
    interaction.footworkPath = [];
    interaction.volleyShotOrigin = null;
  }

  function maybeStartCpuTurn() {
    if (isTempoBattle(runtime.state)) {
      maybeStartTempoCpuTurn();
      return;
    }
    if (runtime.cpuThinking || runtime.state.phase !== "playing" || !isCpu(runtime.state.currentPlayer)) return;
    if (eventPresenter.isBusy()) return;
    maybeShowCampaignDialogue();
    if (dialogue.isOpen()) return;
    if (tutorialPresentation.shouldDelayCpu()) {
      tutorialPresentation.scheduleFlush();
      return;
    }
    runtime.cpuThinking = true;
    void runCpuTurn().finally(() => {
      runtime.cpuThinking = false;
      tutorialPresentation.flush();
    });
  }

  function maybeStartTempoCpuTurn() {
    const state = runtime.state;
    if (!isTempoBattle(state) || runtime.cpuThinking || runtime.resolving || runtime.tempoBusy
      || eventPresenter.isBusy() || state.activation || state.phase !== "playing") return;
    if (dialogue.isOpen() || runtime.tempoAnimating > 0) return;
    const player = findReadyTempoCpuPlayer(state, runtime.cpu);
    if (player == null) return;
    runtime.cpuThinking = true;
    runtime.tempoCpuAbort = false;
    void runTempoCpuActivation(player).finally(() => {
      runtime.cpuThinking = false;
      maybeStartTempoCpuTurn();
    });
  }

  async function runTempoCpuActivation(player) {
    const epoch = runtime.matchEpoch;
    runtime.tempoCpuActing = true;
    render();
    const planningState = { ...runtime.state, currentPlayer: player };
    const commands = chooseActivation(planningState, {
      difficulty: runtime.cpu?.difficulty ?? "normal",
      cpuPlayer: player,
      rng: cpuRng(planningState),
    });
    for (const command of commands) {
      if (epoch !== runtime.matchEpoch || runtime.state.phase !== "playing" || runtime.tempoCpuAbort) break;
      const applied = await applyCpuCommand(command);
      if (epoch !== runtime.matchEpoch || runtime.tempoCpuAbort) break;
      if (!applied || runtime.state.phase !== "playing") break;
    }
    runtime.tempoCpuActing = false;
    runtime.resolving = false;
    if (!runtime.tempoCpuAbort) clearInteraction();
    render();
  }

  async function runCpuTurn() {
    const epoch = runtime.matchEpoch;
    runtime.resolving = true;
    clearInteraction();
    render();
    setMessage(`Player ${runtime.state.currentPlayer} (CPU) is planning…`);
    await sleep(CPU_TURN_LEAD_MS);
    if (dialogue.isOpen()) {
      runtime.resolving = false;
      render();
      return;
    }

    let guard = 0;
    while (epoch === runtime.matchEpoch && runtime.state.phase === "playing"
      && isCpu(runtime.state.currentPlayer) && !dialogue.isOpen() && guard < CPU_MAX_ACTIVATIONS) {
      guard += 1;
      const commands = runtime.tutorial
        ? chooseTutorialCpuActivation(runtime.state, runtime.tutorial)
        : chooseActivation(runtime.state, {
          difficulty: runtime.cpu.difficulty,
          cpuPlayer: runtime.state.currentPlayer,
          rng: cpuRng(runtime.state),
          excludeArtIds: campaignCpuExcludedArtIds(),
        });
      if (!commands.length) break;

      for (const command of commands) {
        if (epoch !== runtime.matchEpoch) return;
        const applied = await applyCpuCommand(command);
        runtime.resolving = true;
        if (!applied || runtime.state.phase !== "playing") break;
      }

      if (epoch !== runtime.matchEpoch || runtime.state.phase !== "playing") break;
      await sleep(CPU_ACTIVATION_GAP_MS);
      if (dialogue.isOpen()) break;
    }

    if (epoch !== runtime.matchEpoch) return;
    if (dialogue.isOpen()) {
      runtime.resolving = false;
      render();
      return;
    }
    runtime.resolving = false;
    if (runtime.state.phase === "complete") {
      render();
      return;
    }
    clearInteraction();
    render();
    if (tutorialPresentation.hasPendingDialogue()) {
      setMessage("Your squad turn. Select a ready commander.");
    } else {
      setMessage(consumeTutorialPrompt("Your squad turn. Select a ready commander."));
    }
  }

  async function applyCpuCommand(command) {
    switch (command.type) {
      case "BEGIN_ACTIVATION": {
        if (!dispatch(command)) return false;
        interaction.selectedId = command.unitId;
        const unit = findUnit(runtime.state, command.unitId);
        if (unit) setMessage(`Player ${unit.player} (CPU) activates its ${unit.nickname || getUnitType(unit.type).name}.`);
        render();
        await sleep(isTempoBattle(runtime.state) ? 0 : CPU_STEP_MS);
        return true;
      }
      case "MOVE_UNIT":
        return resolveCpuMove(command, { keepResolving: true });
      case "CANCEL_MOVE": {
        const accepted = dispatch(command);
        render();
        return accepted;
      }
      case "ATTACK":
        return command.targetPosition ? resolveWallAttack(command) : resolveCombat(command);
      case "DEFEND": {
        const accepted = dispatch(command);
        render();
        return accepted;
      }
      case "USE_ART": {
        const peek = applyCommand(runtime.state, command);
        const rolled = (peek.events ?? []).some((event) => event.type === "ART_RESOLVED" && "hit" in event);
        return rolled ? resolveCombat(command) : resolveInstantArt(command);
      }
      case "FINISH_ACTIVATION": {
        const accepted = dispatch(command);
        render();
        return accepted;
      }
      default:
        return false;
    }
  }

  async function resolveCpuMove(command, options) {
    return resolveAnimatedMove(command, {
      getState: () => runtime.state,
      setResolving: (value) => { runtime.resolving = value; },
      findUnit,
      dispatch,
      getDispatchEvents: () => runtime.lastDispatchEvents,
      playRolloverFx,
      render,
      effects,
    }, options);
  }

  return {
    applyCpuCommand,
    maybeStartCpuTurn,
    maybeStartTempoCpuTurn,
    resolveCpuMove,
  };
}
