import { beginActivation } from "./core/commands.js";
import { UNIT_TYPES, getUnitType } from "./core/unitCatalog.js";
import { createBattleState, findUnit } from "./core/state.js";
import { isStunned } from "./rules/statuses.js";
import { createCpuTurnController } from "./ai/cpuTurnController.js";
import { createOnlineCommandController } from "./online/onlineCommandController.js";
import { createBoardMetrics } from "./ui/isometric.js";
import { createEffects } from "./ui/effects.js";
import { createBattleEventPresenter } from "./ui/battleEventPresenter.js";
import { createBattleInputController } from "./ui/battleInputController.js";
import { createCommandResolutionController } from "./ui/commandResolutionController.js";
import { createMatchOutcomeController } from "./ui/matchOutcomeController.js";
import { createTutorialPresentationController } from "./ui/tutorialPresentationController.js";
import { TurnAnnouncer } from "./ui/turnFlash.js";
import { createMenuFlow } from "./ui/menuFlow.js";
import { AudioManager, musicKeyForMatchMode } from "./audio/sounds.js";
import { renderBoard } from "./ui/boardRenderer.js";
import { mountSceneBackdrop } from "./ui/sceneBackdrop.js";
import { renderForecast } from "./ui/forecastRenderer.js";
import { renderHeader, renderUnitCard, renderActions, renderSquads, renderWeatherBadge, renderRankedMatchNameplates } from "./ui/hud.js";
import { RulesModal } from "./ui/rulesModal.js";
import { applyMobileViewport, requestMobileFullscreen } from "./ui/mobileViewport.js";
import { applyTheme, loadSavedThemeId } from "./ui/themes.js";
import { applyPerformanceMode, loadPerformanceMode } from "./ui/performanceSettings.js";
import { loadAccuracyForecastEnabled, saveAccuracyForecastEnabled } from "./ui/forecastSettings.js";
import { openChoiceModal } from "./ui/choiceModal.js";
import { createDialogueSystem } from "./ui/dialogue.js";
import { createBlackout } from "./ui/blackout.js";
import { createCampaignMatchHooks } from "./campaign/campaignMatchHooks.js";
import { createCampaignPresentationController } from "./campaign/campaignPresentationController.js";
import { createMatchLifecycleController } from "./match/matchLifecycleController.js";
import { createCampaignMeta } from "./campaign/campaignMeta.js";
import { syncGameProgress } from "./platform/bootProgressSync.js";
import { requestProgressionAnnouncements } from "./ui/progressionAnnouncements.js";

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
const weatherBadge = document.querySelector("#weatherBadge");
const rankedNameplates = document.querySelector("#rankedNameplates");
const accuracyForecastToggle = document.querySelector("#accuracyForecastToggle");
const actionHelp = document.querySelector("#actionHelp");
const squadOverlays = document.querySelector("#squadOverlays");
const message = document.querySelector("#message");
const refModal = document.querySelector("#refModal");
const dialogueLayer = document.querySelector("#dialogueLayer");
const blackoutLayer = document.querySelector("#blackoutLayer");

// --- View state ---
let state = createBattleState();
let selectedId = null;
let mode = null;
let footworkPath = [];
let volleyShotOrigin = null;
let areaForecastCenter = null;
let areaForecastMode = null;
let hoveredForecastTargetId = null;
let accuracyForecastEnabled = loadAccuracyForecastEnabled();
// The fallen ally chosen for a revive ART, awaiting a placement-tile click.
let reviveTargetId = null;
let resolving = false;

// --- CPU (single-player) ---
// `cpu` is null in hot-seat; in single-player it names the difficulty and which seats
// the computer drives (Player 2 in v1). `cpuThinking` guards against re-entering the
// CPU loop, and `matchEpoch` lets a running CPU loop bail the moment a new match starts.
let cpu = null;
let cpuThinking = false;
let matchEpoch = 0;
let tutorial = null;
let campaignMissionId = null;
// Set at the end of a mission whose reward flow must run on the map (The Wandering
// Party): { missionId, packId }. Consumed by onCampaignMapEntered when the player is
// routed back to the campaign map from the results screen. Cleared once consumed.
let pendingCampaignReward = null;
// Per-mission bookkeeping for objective grading + condition-triggered dialogue beats.
// Reset in startMatch; both missions read/write their own keys.
let campaignMeta = createCampaignMeta();

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
  if (dialogue.isOpen()) return "Dialogue is open.";
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
  return resolving || eventPresenter.isBusy() || dialogue.isOpen() || !currentPlayerIsLocal();
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
const eventPresenter = createBattleEventPresenter({
  audio,
  effects,
  getState: () => state,
  onIdle: () => maybeStartCpuTurn(),
});
const { playRolloverFx } = eventPresenter;
const battleInteraction = {
  get selectedId() { return selectedId; },
  set selectedId(value) { selectedId = value; },
  get mode() { return mode; },
  set mode(value) { mode = value; },
  get footworkPath() { return footworkPath; },
  set footworkPath(value) { footworkPath = value; },
  get volleyShotOrigin() { return volleyShotOrigin; },
  set volleyShotOrigin(value) { volleyShotOrigin = value; },
  get reviveTargetId() { return reviveTargetId; },
  set reviveTargetId(value) { reviveTargetId = value; },
  get resolving() { return resolving; },
  set resolving(value) { resolving = value; },
};
const battleInput = createBattleInputController({
  runtime: {
    get state() { return state; },
    get lastDispatchEvents() { return resolution.lastDispatchEvents; },
  },
  interaction: battleInteraction,
  selectedUnit,
  inputLocked,
  beginUnit,
  dispatch,
  render,
  setMessage,
  consumeTutorialPrompt,
  resolveCombat,
  resolveInstantArt,
  resolveWallAttack,
  maybeAutoFinish,
  effects,
  audio,
  playRolloverFx,
  openChoiceModal,
  finishNow,
  resumeActiveMusic,
});
const { handleActionClick, handleTile } = battleInput;
const turnFlash = new TurnAnnouncer(document.querySelector("#turnFlash"));
const dialogue = createDialogueSystem(dialogueLayer, {
  getState: () => state,
  onOpen: render,
  onClose: render,
  onLineAction: handleDialogueLineAction,
});
// The blackout sits under the dialogue layer, so a script can keep talking while the board
// is torn down and rebuilt behind the dark (The Final Battle's stage changes).
const blackout = createBlackout(blackoutLayer, { sleep: (ms) => sleep(ms) });
const campaignPresentation = createCampaignPresentationController({
  runtime: {
    get state() { return state; },
    set state(value) { state = value; },
    get resolving() { return resolving; },
    set resolving(value) { resolving = value; },
    get matchConfig() { return matchConfig; },
    get campaignMissionId() { return campaignMissionId; },
    get pendingCampaignReward() { return pendingCampaignReward; },
    set pendingCampaignReward(value) { pendingCampaignReward = value; },
  },
  dialogue,
  blackout,
  effects,
  render,
  announceTurn,
  sleep,
  startMatch,
  storage: globalThis.localStorage,
});
const menu = createMenuFlow({ audio, onStartMatch: startMatch, onStartCampaignMission, onCampaignMissionSelected, onCampaignMapEntered, openCodex, onLeaveMatch, syncGameProgress });
const tutorialPresentation = createTutorialPresentationController({
  runtime: {
    get tutorial() { return tutorial; },
    get state() { return state; },
    get resolving() { return resolving; },
    get cpuThinking() { return cpuThinking; },
  },
  interaction: battleInteraction,
  dialogue,
  menu,
  storage: globalThis.localStorage,
  clock: window,
  body: document.body,
  isCpu,
  setMessage,
  render,
  maybeStartCpuTurn,
});
const campaignHooks = createCampaignMatchHooks({
  runtime: {
    get state() { return state; },
    get matchConfig() { return matchConfig; },
    get campaignMissionId() { return campaignMissionId; },
    get campaignMeta() { return campaignMeta; },
  },
  dialogue,
  ensureFinalBattleStageAdvanced,
  maybeStartCpuTurn,
});
const matchOutcome = createMatchOutcomeController({
  runtime: {
    get state() { return state; },
    get matchConfig() { return matchConfig; },
    get campaignMissionId() { return campaignMissionId; },
    get campaignMeta() { return campaignMeta; },
    get matchStartedAt() { return matchStartedAt; },
    get initialHpByPlayer() { return initialHpByPlayer; },
    get mySeat() { return mySeat; },
    get net() { return net; },
    get resultsTimer() { return resultsTimer; },
    set resultsTimer(value) { resultsTimer = value; },
    set pendingCampaignReward(value) { pendingCampaignReward = value; },
  },
  turnFlash,
  menu,
  dialogue,
  setMessage,
  isCpu,
  storage: globalThis.localStorage,
  clock: window,
  syncGameProgress,
});
const resolution = createCommandResolutionController({
  runtime: {
    get state() { return state; },
    set state(value) { state = value; },
    get tutorial() { return tutorial; },
    get matchConfig() { return matchConfig; },
    get matchEpoch() { return matchEpoch; },
    get resolving() { return resolving; },
    set resolving(value) { resolving = value; },
  },
  interaction: battleInteraction,
  effects,
  audio,
  eventPresenter,
  setMessage,
  render,
  announceTurnChange,
  maybeStartCpuTurn,
  broadcastIfLocal,
  recordCampaignRejection: (command, result) => campaignHooks.recordCampaignRejection(command, result),
  recordCampaignProgressHooks: (command, result, beforeState) => campaignHooks.recordCampaignProgressHooks(command, result, beforeState),
  recordTutorialProgress: (command, result, previousPlayer) => tutorialPresentation.record(command, result, previousPlayer),
  queueTutorialPresentation,
  flushTutorialPresentation,
  consumeTutorialPrompt,
});
const cpuTurnController = createCpuTurnController({
  runtime: {
    get state() { return state; },
    get cpu() { return cpu; },
    get tutorial() { return tutorial; },
    get matchEpoch() { return matchEpoch; },
    get lastDispatchEvents() { return resolution.lastDispatchEvents; },
    get cpuThinking() { return cpuThinking; },
    set cpuThinking(value) { cpuThinking = value; },
    get resolving() { return resolving; },
    set resolving(value) { resolving = value; },
  },
  interaction: battleInteraction,
  eventPresenter,
  dialogue,
  tutorialPresentation,
  isCpu,
  maybeShowCampaignDialogue,
  campaignCpuExcludedArtIds,
  dispatch,
  render,
  setMessage,
  sleep,
  resolveCombat,
  resolveWallAttack,
  resolveInstantArt,
  effects,
  playRolloverFx,
  consumeTutorialPrompt,
});
const onlineCommandController = createOnlineCommandController({
  runtime: {
    get state() { return state; },
    get matchConfig() { return matchConfig; },
    get net() { return net; },
    set net(value) { net = value; },
    get mySeat() { return mySeat; },
    set mySeat(value) { mySeat = value; },
    get applyingRemote() { return applyingRemote; },
    set applyingRemote(value) { applyingRemote = value; },
    get resolving() { return resolving; },
    set resolving(value) { resolving = value; },
    get resultsTimer() { return resultsTimer; },
    set resultsTimer(value) { resultsTimer = value; },
  },
  interaction: battleInteraction,
  dispatch,
  render,
  setMessage,
  sleep,
  resolveMove: resolveCpuMove,
  resolveCombat,
  resolveWallAttack,
  resolveInstantArt,
  turnFlash,
  menu,
  clock: window,
});
const onlineController = onlineCommandController.sessionController;
const matchLifecycle = createMatchLifecycleController({
  runtime: {
    get state() { return state; },
    set state(value) { state = value; },
    get resultsTimer() { return resultsTimer; },
    get matchEpoch() { return matchEpoch; },
    set matchEpoch(value) { matchEpoch = value; },
    get matchConfig() { return matchConfig; },
    set matchConfig(value) { matchConfig = value; },
    set matchStartedAt(value) { matchStartedAt = value; },
    get initialHpByPlayer() { return initialHpByPlayer; },
    set initialHpByPlayer(value) { initialHpByPlayer = value; },
    get tutorial() { return tutorial; },
    set tutorial(value) { tutorial = value; },
    get campaignMissionId() { return campaignMissionId; },
    set campaignMissionId(value) { campaignMissionId = value; },
    set campaignMeta(value) { campaignMeta = value; },
    set cpu(value) { cpu = value; },
    set cpuThinking(value) { cpuThinking = value; },
    get net() { return net; },
    set net(value) { net = value; },
    get mySeat() { return mySeat; },
    set mySeat(value) { mySeat = value; },
    set applyingRemote(value) { applyingRemote = value; },
    set resolving(value) { resolving = value; },
    get audioUnlocked() { return audioUnlocked; },
    get muted() { return muted; },
  },
  interaction: battleInteraction,
  tutorialPresentation,
  blackout,
  effects,
  restartControl: document.querySelector("#restartBtn"),
  concedeControl: document.querySelector("#concedeBtn"),
  menuControl: document.querySelector("#matchMenuBtn"),
  turnFlash,
  menu,
  audio,
  dialogue,
  onlineController,
  clock: window,
  setMessage,
  isCpu,
  render,
  announceTurn,
  queueTutorialPresentation,
  finalizeCampaignOpeningState,
  maybeShowCampaignDialogue,
  maybeStartCpuTurn,
});
window.tacticalArenaDialogue = dialogue;

// Preserve the full presentation by default; battery saver remains an explicit,
// persisted option for machines that benefit from shedding ambient effects.
applyPerformanceMode(loadPerformanceMode());

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
  renderCommandHud();
  renderBoardAndRail();
}

// The player's command surface: the selected unit's card + its action buttons.
function renderCommandHud() {
  const unit = selectedUnit();
  const controlsEnabled = currentPlayerIsLocal() && !dialogue.isOpen();
  renderUnitCard(unit, state, unitCard);
  if (accuracyForecastToggle) {
    accuracyForecastToggle.checked = accuracyForecastEnabled;
  }
  renderActions(unit, state, mode, { actions, actionHelp }, {
    resolving,
    controlsEnabled,
    lockedMessage: lockedActionMessage(),
    onActionClick: (action) => handleActionClick(action, unit)
  });
}

// The board, the turn header, the readiness rail, and the forecast — the shared
// battlefield surface. Safe to redraw from CPU animations.
function renderBoardAndRail() {
  const unit = selectedUnit();
  renderHeader(state, { turnTitle, turnSub, turnBanner });
  renderWeatherBadge(state, weatherBadge);
  renderRankedMatchNameplates(rankedNameplates, { state, net, mySeat, ranked: matchConfig?.ranked });
  const railEnabled = currentPlayerIsLocal() && !dialogue.isOpen();
  renderSquads(state, squadOverlays, (u) => { beginUnit(u); render(); }, {
    controlsEnabled: railEnabled
  });
  const currentAreaCenter = areaForecastMode === mode ? areaForecastCenter : null;
  renderBoard({
    board,
    boardLayer,
    unitsLayer,
    state,
    mode,
    selectedId,
    footworkPath,
    onTileClick: handleTile,
    onAreaHover: (center) => {
      areaForecastCenter = center;
      areaForecastMode = center ? mode : null;
      renderForecast({
        forecastLayer,
        state,
        mode,
        actor: selectedUnit(),
        resolving,
        areaCenter: center,
        enabled: accuracyForecastEnabled,
        hoveredTargetId: hoveredForecastTargetId
      });
    },
    onUnitHover: (unit) => {
      hoveredForecastTargetId = unit?.id ?? null;
      renderForecast({
        forecastLayer,
        state,
        mode,
        actor: selectedUnit(),
        resolving,
        areaCenter: currentAreaCenter,
        enabled: accuracyForecastEnabled,
        hoveredTargetId: hoveredForecastTargetId
      });
    }
  });
  renderForecast({
    forecastLayer,
    state,
    mode,
    actor: unit,
    resolving,
    areaCenter: currentAreaCenter,
    enabled: accuracyForecastEnabled,
    hoveredTargetId: hoveredForecastTargetId
  });
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

// --- Match lifecycle ---

async function onCampaignMissionSelected(missionId, selectedSquad = null, options = {}) { return campaignPresentation.onCampaignMissionSelected(missionId, selectedSquad, options); }
function onStartCampaignMission(config) { campaignPresentation.onStartCampaignMission(config); }
async function onCampaignMapEntered(options = {}) { return campaignPresentation.onCampaignMapEntered(options); }
async function handleDialogueLineAction(action) { return campaignPresentation.handleDialogueLineAction(action); }
async function ensureFinalBattleStageAdvanced() { return campaignPresentation.ensureFinalBattleStageAdvanced(); }
function finalizeCampaignOpeningState() { campaignPresentation.finalizeCampaignOpeningState(); }
function startMatch(config) { matchLifecycle.start(config); }
function resetBattle() { matchLifecycle.reset(); }

function resumeActiveMusic() {
  if (muted || !audioUnlocked) return;
  audio.startMusic(menu.active === "match" ? musicKeyForMatchMode(matchConfig?.mode, campaignMissionId) : "menu");
}

// Called by the menu when the match screen is left. Abandon a still-live online
// match (the remaining peer wins by walkover); a cleanly finished one already ran
// net.endMatch(), so we only null our handles here.
function onLeaveMatch() {
  matchLifecycle.leave();
}

// Turn/results announcement + end-of-match orchestration live in matchOutcomeController;
// per-command campaign glue lives in campaignMatchHooks. These hoisted delegates keep
// construction order flexible (controllers reference each other only at call time).
function announceTurn(player, options = {}) { matchOutcome.announceTurn(player, options); }
function announceTurnChange(prevPlayer) { matchOutcome.announceTurnChange(prevPlayer); }
function campaignCpuExcludedArtIds() { return campaignHooks.campaignCpuExcludedArtIds(); }
function maybeShowCampaignDialogue() { campaignHooks.maybeShowCampaignDialogue(); }

// --- Command dispatch ---
// The shared resolve loop lives in commandResolutionController (also consumed by the
// dev sandbox); these delegates are what the input/CPU/online controllers receive.

function dispatch(command, options) { return resolution.dispatch(command, options); }
function resolveCombat(command) { return resolution.resolveCombat(command); }
function resolveWallAttack(command) { return resolution.resolveWallAttack(command); }
function resolveInstantArt(command) { return resolution.resolveInstantArt(command); }
function maybeAutoFinish() { resolution.maybeAutoFinish(); }
function finishNow() { resolution.finishNow(); }

function queueTutorialPresentation(update = {}) {
  tutorialPresentation.queue(update);
}

function consumeTutorialPrompt(fallback) {
  return tutorialPresentation.consumePrompt(fallback);
}

function flushTutorialPresentation() {
  tutorialPresentation.flush();
}

// --- CPU driver ---

function maybeStartCpuTurn() {
  cpuTurnController.maybeStartCpuTurn();
}

async function applyCpuCommand(command) {
  return cpuTurnController.applyCpuCommand(command);
}

async function resolveCpuMove(command, options) {
  return cpuTurnController.resolveCpuMove(command, options);
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
    setMessage(consumeTutorialPrompt(`${unit.nickname || getUnitType(unit.type).name} ready. Choose an action.`));
    return;
  }
  if (dispatch(beginActivation(unit.player, unit.id))) {
    selectedId = unit.id;
    mode = null;
    volleyShotOrigin = null;
    audio.play("unitSelect");
    setMessage(consumeTutorialPrompt(`${unit.nickname || getUnitType(unit.type).name} ready. Choose an action.`));
  }
}

<<<<<<< Updated upstream
=======
// Command one of my ready units in real-time — instantly, no matter what is on the board.
// Frees the shared activation slot from whoever holds it (a CPU mid-animation, or my own
// previous piece) and opens this unit's command HUD right away. The one thing that defers a
// click is an instant-ART cast in flight (tempoBusy), guarded by beginUnit/inputLocked.
function beginTempoUnit(unit) {
  if (state.phase !== "playing" || dialogue.isOpen() || tempoBusy) return;
  if (!isLocalTempoCommander(unit)) return;
  // Already commanding this unit — just refocus its panel.
  if (state.activation?.unitId === unit.id) {
    selectedId = unit.id;
    mode = null;
    volleyShotOrigin = null;
    audio.play("unitSelect");
    setMessage(`${unit.nickname || getUnitType(unit.type).name} ready. Choose an action.`);
    render();
    return;
  }
  releaseTempoSlot(unit.id);
  // beginActivation replaces a fresh (un-acted) foreign activation and starts on a freed slot,
  // so we just dispatch — releaseTempoSlot already retired any activation that had acted/moved.
  if (dispatch(beginActivation(unit.player, unit.id))) {
    selectedId = unit.id;
    mode = null;
    volleyShotOrigin = null;
    audio.play("unitSelect");
    setMessage(`${unit.nickname || getUnitType(unit.type).name} ready. Choose an action.`);
    render();
  }
}

// Free the single activation slot for the player, whoever holds it. A CPU holder is told to
// stand down (tempoCpuAbort). Whatever it had already done in state stays; because rolled
// actions commit up front, the board is consistent. A slot that has already acted is finished;
// a move-only one is reverted (cancelMove) so the piece keeps its readiness for a retry; a
// fresh one is simply left for beginActivation to replace.
function releaseTempoSlot(exceptId) {
  const activation = state.activation;
  if (!activation || activation.unitId === exceptId) return;
  const holder = findUnit(state, activation.unitId);
  if (isCpu(holder?.player)) tempoCpuAbort = true;
  if (!holder) return;
  if (activation.primaryUsed) dispatch(finishActivation(holder.player, holder.id));
  else if (activation.moved) dispatch(cancelMove(holder.player, holder.id));
}


>>>>>>> Stashed changes
// --- Input wiring ---

document.querySelector("#restartBtn").addEventListener("click", resetBattle);
document.querySelector("#concedeBtn")?.addEventListener("click", () => {
  const handled = onlineCommandController.concedeLocalMatch();
  if (handled && state.phase === "complete") {
    document.querySelector("#concedeBtn").disabled = true;
  } else if (!handled) {
    setMessage("Concede is only available during an online match.", true);
  }
});
document.querySelector("#rulesBtn").addEventListener("click", openCodex);

accuracyForecastToggle?.addEventListener("change", () => {
  accuracyForecastEnabled = saveAccuracyForecastEnabled(accuracyForecastToggle.checked);
  render();
});

const muteBtn = document.querySelector("#muteBtn");
muteBtn.addEventListener("click", () => {
  muted = !muted;
  audio.setEnabled(!muted);
  muteBtn.setAttribute("aria-pressed", String(muted));
  muteBtn.classList.toggle("is-muted", muted);
  muteBtn.textContent = muted ? "Muted" : "Sound";
  resumeActiveMusic();
});

document.addEventListener("click", (event) => {
  if (!audioUnlocked) {
    audioUnlocked = true;
    resumeActiveMusic();
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
  if (rulesModal.isOpen || dialogue.isOpen() || resolving) return;
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
// Boot sync can reconcile in server-side entitlements; the presenter holds any queued
// popup until the player reaches a screen where it belongs.
void syncGameProgress().then(() => requestProgressionAnnouncements({ storage: globalThis.localStorage }));
