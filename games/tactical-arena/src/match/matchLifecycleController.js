import { createCampaignMeta } from "../campaign/campaignMeta.js";
import {
  campaignOpeningScript,
  prepareCampaignMatchState,
} from "../campaign/campaign.js";
import { enableTempoBattle, isTempoBattle } from "../core/tempoBattle.js";
import { musicKeyForMatchMode } from "../audio/sounds.js";
import { createBoardMetrics } from "../ui/isometric.js";
import { DEFAULT_FORMATION_ORDER, DEFAULT_SQUAD } from "../ui/squadPicker.js";
import { applyFormationOrder } from "../ui/squadModel.js";
import {
  TUTORIAL_BASICS_ID,
  createTutorial,
  prepareTutorialMatchState,
} from "../tutorials/basics.js";
import { createMatchState, hpRemaining } from "./matchBuilder.js";

const CPU_MATCH_MODES = new Set(["single", "tempo-single", "tutorial", "campaign"]);

export function cpuConfigForMatch(config) {
  if (!CPU_MATCH_MODES.has(config.mode)) return null;
  return { difficulty: config.difficulty ?? "normal", players: new Set([2]) };
}

export function matchSeedForConfig(config) {
  return config.mode === "online" || config.mode === "tutorial" ? config.seed : undefined;
}

export function createMatchLifecycleController({
  runtime,
  interaction,
  tutorialPresentation,
  tempoLoop,
  blackout,
  effects,
  restartControl,
  turnFlash,
  menu,
  audio,
  dialogue,
  onlineController,
  clock = globalThis,
  now = () => Date.now(),
  setMessage = () => {},
  isCpu = () => false,
  render = () => {},
  announceTurn = () => {},
  queueTutorialPresentation = () => {},
  finalizeCampaignOpeningState = () => {},
  maybeShowCampaignDialogue = () => {},
  maybeStartCpuTurn = () => {},
} = {}) {
  function clearInteraction() {
    interaction.selectedId = null;
    interaction.mode = null;
    interaction.footworkPath = [];
    interaction.volleyShotOrigin = null;
    interaction.rewindTargetId = null;
  }

  function start(config) {
    clock.clearTimeout(runtime.resultsTimer);
    tutorialPresentation.reset();
    tempoLoop.stop();
    blackout.clear();
    runtime.matchEpoch += 1;
    const online = config.mode === "online";

    let state = createMatchState({
      size: config.size,
      squads: config.squads,
      skins: config.skins,
      nicknames: config.nicknames,
      seed: matchSeedForConfig(config),
      playerCount: config.playerCount,
      format: config.format,
      teamColors: config.teamColors,
      teamNames: config.teamNames,
    });
    if (config.mode === "tutorial") {
      state = prepareTutorialMatchState(state, config.tutorialId ?? TUTORIAL_BASICS_ID);
    }
    if (config.mode === "campaign") state = prepareCampaignMatchState(state, config.campaignMissionId);
    if (config.battleMode === "tempo" || config.mode?.startsWith("tempo-")) state = enableTempoBattle(state);
    runtime.state = state;
    effects.setMetrics(createBoardMetrics(config.size));
    runtime.matchConfig = config;
    runtime.matchStartedAt = now();
    runtime.initialHpByPlayer = {};
    for (const player of state.turnOrder ?? [1, 2]) {
      runtime.initialHpByPlayer[player] = hpRemaining(state, player);
    }
    runtime.tutorial = config.mode === "tutorial"
      ? createTutorial(config.tutorialId ?? TUTORIAL_BASICS_ID)
      : null;
    runtime.campaignMissionId = config.mode === "campaign" ? config.campaignMissionId : null;
    runtime.campaignMeta = createCampaignMeta();
    runtime.cpu = cpuConfigForMatch(config);
    runtime.cpuThinking = false;
    runtime.net = online ? config.net : null;
    runtime.mySeat = online ? config.mySeat : null;
    runtime.applyingRemote = false;
    restartControl.hidden = online;
    clearInteraction();
    runtime.resolving = false;
    turnFlash.clear();

    setMessage(online
      ? (state.currentPlayer === runtime.mySeat
        ? "You open the battle."
        : `Player ${state.currentPlayer}'s turn — please wait.`)
      : `${isCpu(state.currentPlayer) ? `Player ${state.currentPlayer} (CPU)` : `Player ${state.currentPlayer}`} opens the battle.`);
    if (isTempoBattle(state)) setMessage("Tempo Battle begins. Units become ready by AGILITY.");
    if (runtime.tutorial) setMessage(runtime.tutorial.prompt);
    menu.show("match");
    if (runtime.audioUnlocked && !runtime.muted) {
      audio.startMusic(musicKeyForMatchMode(config.mode, runtime.campaignMissionId));
    }
    if (online) runtime.net.bind(onlineController);
    render();
    if (!isTempoBattle(state)) announceTurn(state.currentPlayer);
    if (runtime.tutorial) {
      queueTutorialPresentation({ dialogue: runtime.tutorial.dialogue });
    } else if (runtime.matchConfig?.mode === "campaign" && runtime.campaignMissionId) {
      const script = campaignOpeningScript(runtime.campaignMissionId, state);
      if (script.length) {
        void dialogue.show(script).then(() => {
          finalizeCampaignOpeningState();
          maybeShowCampaignDialogue();
          maybeStartCpuTurn();
        });
      }
    }
    if (isTempoBattle(state)) tempoLoop.start();
    maybeStartCpuTurn();
  }

  function reset() {
    if (runtime.net) return;
    const defaultSquad = applyFormationOrder(DEFAULT_SQUAD, DEFAULT_FORMATION_ORDER);
    start(runtime.matchConfig ?? { size: 13, squads: { 1: defaultSquad, 2: defaultSquad } });
  }

  function leave() {
    tempoLoop.stop();
    blackout.clear();
    if (runtime.net && runtime.state.phase === "playing") runtime.net.dispose();
    runtime.net = null;
    runtime.mySeat = null;
  }

  return { leave, reset, start };
}
