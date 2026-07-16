import { attack, beginActivation, cancelMove, defend, finishActivation } from "./core/commands.js";
import { UNIT_TYPES, getArt, getInitialMp, getUnitType } from "./core/unitCatalog.js";
import { createBattleState, createUnit, findUnit, getTileAffinity } from "./core/state.js";
import { positionKey } from "./rules/movement.js";
import { isStunned } from "./rules/statuses.js";
import { applyCommand } from "./core/reducer.js";
import { createCpuTurnController } from "./ai/cpuTurnController.js";
import { createOnlineCommandController } from "./online/onlineCommandController.js";
import { createBoardMetrics } from "./ui/isometric.js";
import { createEffects } from "./ui/effects.js";
import { createBattleEventPresenter, unitCenter } from "./ui/battleEventPresenter.js";
import { presentInstantArt } from "./ui/instantArtPresenter.js";
import { createBattleInputController } from "./ui/battleInputController.js";
import { createTempoLoopController } from "./ui/tempoLoopController.js";
import {
  prepareRolledCombatPresentation,
  presentRolledCombat,
} from "./ui/rolledCombatPresenter.js";
import {
  createTutorialPresentationController,
  hasTutorialPresentation,
} from "./ui/tutorialPresentationController.js";
import { createResolutionGuard } from "./ui/resolutionGuard.js";
import { shouldUseRangedAttackAnimation, wallOreGainFloat } from "./ui/combatPresentation.js";
import { TurnAnnouncer } from "./ui/turnFlash.js";
import { createMenuFlow } from "./ui/menuFlow.js";
import { AudioManager, musicKeyForMatchMode } from "./audio/sounds.js";
import { renderBoard } from "./ui/boardRenderer.js";
import { mountSceneBackdrop } from "./ui/sceneBackdrop.js";
import { renderForecast } from "./ui/forecastRenderer.js";
import { renderHeader, renderUnitCard, renderActions, renderSquads, renderWeatherBadge } from "./ui/hud.js";
import { RulesModal } from "./ui/rulesModal.js";
import { applyMobileViewport, requestMobileFullscreen } from "./ui/mobileViewport.js";
import { applyTheme, loadSavedThemeId } from "./ui/themes.js";
import { applyPerformanceMode, loadPerformanceMode } from "./ui/performanceSettings.js";
import { loadAccuracyForecastEnabled, saveAccuracyForecastEnabled } from "./ui/forecastSettings.js";
import { shouldShowTurnAnnouncement, turnAnnouncementSub } from "./ui/turnAnnouncement.js";
import { openChoiceModal } from "./ui/choiceModal.js";
import { createDialogueSystem } from "./ui/dialogue.js";
import { createBlackout } from "./ui/blackout.js";
import { createCampaignPresentationController } from "./campaign/campaignPresentationController.js";
import { buildSummary, readableError, teamColor } from "./match/matchBuilder.js";
import { createMatchLifecycleController } from "./match/matchLifecycleController.js";
import { isTempoBattle, isTempoUnitReady } from "./core/tempoBattle.js";
import {
  BROTHERS_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  MINER_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  PALADIN_MISSION_ID,
  SHOWDOWN_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  WITCH_DOCTOR_HEAL_CAST_CAP,
  WITCH_DOCTOR_MISSION_ID,
  voidCastleDefeatScript,
  finalBattleBanishScript,
  finalBattleDefeatScript,
  brothersDefeatScript,
  completeCampaignMission,
  getCampaignMission,
  hasbeenHeroesDefeatScript,
  minerDefeatScript,
  notMyKingDefeatScript,
  outOfRetirementDefeatScript,
  paladinDefeatScript,
  showdownDefeatScript,
  shouldShowCampaignPostMatchCutscene,
  voidwoodDefeatScript,
} from "./campaign/campaign.js";
import { isCampaignSkinRewardGranted, isCampaignUnitRewardGranted } from "./progression/unlocks.js";
import { claimOnlineMatchValorReward, recordOnlineValorEvents } from "./progression/valorRewards.js";
import { createCampaignMeta } from "./campaign/campaignMeta.js";
import {
  nextCampaignDialogueBeat as selectCampaignDialogueBeat,
  recordCampaignProgress,
} from "./campaign/campaignRuntime.js";
import {
  TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
  TUTORIAL_BASICS_ID,
  TUTORIAL_CATALOG,
  completeTutorial,
  prepareTutorialCommand,
  recordTutorialCommand,
  validateTutorialCommand,
} from "./tutorials/basics.js";

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
// --- Tempo (real-time) command ownership ---
// In Tempo Battle the bottom command HUD (unit card + action bar) belongs to the PLAYER
// alone. The CPU lives entirely on the board — it never renders the command HUD, never
// writes the message line, never touches the player's selection. `tempoCpuActing` is true
// only while a CPU activation runs; render()/setMessage() consult it so CPU work stays off
// the player's HUD.
//
// Input is NEVER blocked by an animation in tempo. Rolled actions (attack/ART) commit their
// state UP FRONT (see resolveCombat's tempo branch) and only then animate, so the player can
// command another ready unit mid-animation without the old end-of-animation commit clobbering
// it. `tempoAnimating` counts in-flight animations purely so the real-time loop doesn't rebuild
// the board out from under one. Clicking a ready unit frees the shared activation slot
// instantly (releaseTempoSlot) — if the CPU held it, `tempoCpuAbort` tells its loop to stand
// down — so there is never a wait before you can command your own piece.
let tempoCpuActing = false;
let tempoCpuAbort = false;
let tempoAnimating = 0;
// The one place tempo still briefly blocks input: an instant-ART cast (Nuke, Pray, Summon,
// Footwork, …) commits its state at the END of its animation, so we hold input for that ~1s
// to avoid a concurrent command clobbering it. Basic attacks/walls (commit-early) and moves
// (commit via dispatch) never set this — they stay fully non-blocking.
let tempoBusy = false;
// Per-mission bookkeeping for objective grading + condition-triggered dialogue beats.
// Reset in startMatch; both missions read/write their own keys.
let campaignMeta = createCampaignMeta();

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function isCpu(player) {
  return Boolean(cpu && cpu.players.has(player));
}

function currentPlayerIsLocal() {
  if (isTempoBattle(state)) {
    const active = state.activation?.unitId ? findUnit(state, state.activation.unitId) : null;
    if (active && isCpu(active.player)) return false;
    if (net != null && active && active.player !== mySeat) return false;
    return true;
  }
  if (isCpu(state.currentPlayer)) return false;
  if (net != null && state.currentPlayer !== mySeat) return false;
  return true;
}

function lockedActionMessage() {
  if (state.phase === "complete") return "The duel is complete.";
  if (dialogue.isOpen()) return "Dialogue is open.";
  if (isTempoBattle(state)) return state.activation ? "That unit is acting." : "Wait for a ready unit.";
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
  // Tempo is real-time: animations never block input. The player can always reach their
  // ready units (rolled actions commit their state before animating, so nothing is lost).
  // The lone exception is an instant-ART cast (tempoBusy), which commits at animation end.
  if (isTempoBattle(state)) return dialogue.isOpen() || state.phase !== "playing" || tempoBusy || eventPresenter.isBusy();
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
const { playArtCallout, playAttackImpactSound, playEventSounds, playRolloverFx } = eventPresenter;
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
    get lastDispatchEvents() { return lastDispatchEvents; },
  },
  interaction: battleInteraction,
  selectedUnit,
  inputLocked,
  isLocalTempoCommander,
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
const menu = createMenuFlow({ audio, onStartMatch: startMatch, onStartCampaignMission, onCampaignMissionSelected, onCampaignMapEntered, openCodex, onLeaveMatch });
const tutorialPresentation = createTutorialPresentationController({
  runtime: {
    get tutorial() { return tutorial; },
    get state() { return state; },
    get resolving() { return resolving; },
    get cpuThinking() { return cpuThinking; },
  },
  interaction: battleInteraction,
  dialogue,
  clock: window,
  body: document.body,
  isCpu,
  setMessage,
  render,
  maybeStartCpuTurn,
  applyAction: applyTutorialPresentationAction,
  onFinish: finishTutorialPresentation,
});
const cpuTurnController = createCpuTurnController({
  runtime: {
    get state() { return state; },
    get cpu() { return cpu; },
    get tutorial() { return tutorial; },
    get matchEpoch() { return matchEpoch; },
    get lastDispatchEvents() { return lastDispatchEvents; },
    get cpuThinking() { return cpuThinking; },
    set cpuThinking(value) { cpuThinking = value; },
    get resolving() { return resolving; },
    set resolving(value) { resolving = value; },
    get tempoBusy() { return tempoBusy; },
    get tempoAnimating() { return tempoAnimating; },
    get tempoCpuAbort() { return tempoCpuAbort; },
    set tempoCpuAbort(value) { tempoCpuAbort = value; },
    get tempoCpuActing() { return tempoCpuActing; },
    set tempoCpuActing(value) { tempoCpuActing = value; },
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
const tempoLoop = createTempoLoopController({
  runtime: {
    get state() { return state; },
    set state(value) { state = value; },
    get resolving() { return resolving; },
    get tempoAnimating() { return tempoAnimating; },
    set tempoAnimating(value) { tempoAnimating = value; },
    set tempoCpuActing(value) { tempoCpuActing = value; },
    set tempoCpuAbort(value) { tempoCpuAbort = value; },
    set tempoBusy(value) { tempoBusy = value; },
  },
  menu,
  dialogue,
  clock: window,
  now: () => performance.now(),
  root: document,
  render,
  announceTurnChange,
  maybeStartTempoCpuTurn,
  playRolloverFx,
});
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
  tempoLoop,
  blackout,
  effects,
  restartControl: document.querySelector("#restartBtn"),
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
  // Tempo Battle: while the CPU animates on the board, its work must stay OFF the player's
  // command HUD (the unit card + action bar are the player's alone). Redraw the board and
  // readiness rail only and leave the command HUD as the player left it — UNLESS the player
  // has just taken the slot (a preempt mid-CPU-animation), in which case their command panel
  // must appear immediately even though the CPU loop is still unwinding.
  const holder = state.activation ? findUnit(state, state.activation.unitId) : null;
  const playerCommanding = holder && !isCpu(holder.player);
  if (isTempoBattle(state) && tempoCpuActing && !playerCommanding) {
    renderBoardAndRail();
    return;
  }
  renderCommandHud();
  renderBoardAndRail();
}

// The player's command surface: the selected unit's card + its action buttons. In tempo
// this is driven ONLY by the player's own selection — never by the CPU or the clock.
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

// The board, the turn/tempo header, the readiness rail, and the forecast — the shared
// battlefield surface. Safe to redraw from the real-time loop and from CPU animations.
function renderBoardAndRail() {
  const unit = selectedUnit();
  renderHeader(state, { turnTitle, turnSub, turnBanner });
  renderWeatherBadge(state, weatherBadge);
  // In tempo the rail is the player's selection surface at all times — a ready unit of
  // theirs stays clickable even while the CPU is acting, so a click can preempt it.
  const railEnabled = isTempoBattle(state)
    ? (state.phase === "playing" && !dialogue.isOpen())
    : (currentPlayerIsLocal() && !dialogue.isOpen());
  renderSquads(state, squadOverlays, (u) => { beginUnit(u); render(); }, {
    controlsEnabled: railEnabled,
    tempoCanSelect: isLocalTempoCommander
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
      renderForecast({ forecastLayer, state, mode, actor: selectedUnit(), resolving, areaCenter: center, enabled: accuracyForecastEnabled });
    }
  });
  renderForecast({ forecastLayer, state, mode, actor: unit, resolving, areaCenter: currentAreaCenter, enabled: accuracyForecastEnabled });
}

// A living, ready, human-controlled unit the local player may command right now (readiness
// only — it ignores the single activation slot, so a click can preempt a CPU that holds it).
function isLocalTempoCommander(unit) {
  if (!unit || isCpu(unit.player)) return false;
  if (net != null && unit.player !== mySeat) return false;
  return isTempoUnitReady(state, unit) && !isStunned(unit);
}

function setMessage(text, isError = false) {
  // The CPU never speaks through the player's message line in tempo.
  if (isTempoBattle(state) && tempoCpuActing) return;
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

// Missions that play a beat from the losing side between the final blow and the results
// screen. Keyed by mission id; `flag` is the campaignMeta latch that keeps the beat from
// replaying if victory resolves more than once in a match.
const CAMPAIGN_DEFEAT_BEATS = Object.freeze({
  [NOT_MY_KING_MISSION_ID]: { flag: "notMyKingDefeatDialogueShown", script: notMyKingDefeatScript },
  [SHOWDOWN_MISSION_ID]: { flag: "showdownDefeatDialogueShown", script: showdownDefeatScript },
  [VOIDWOOD_MISSION_ID]: { flag: "voidwoodDefeatDialogueShown", script: voidwoodDefeatScript },
  [OUT_OF_RETIREMENT_MISSION_ID]: { flag: "outOfRetirementDefeatDialogueShown", script: outOfRetirementDefeatScript },
  [PALADIN_MISSION_ID]: { flag: "paladinDefeatDialogueShown", script: paladinDefeatScript },
  [MINER_MISSION_ID]: { flag: "minerDefeatDialogueShown", script: minerDefeatScript },
  [HASBEEN_HEROES_MISSION_ID]: { flag: "hasbeenDefeatDialogueShown", script: hasbeenHeroesDefeatScript },
  [BROTHERS_MISSION_ID]: { flag: "brothersDefeatDialogueShown", script: brothersDefeatScript },
  [VOID_CASTLE_MISSION_ID]: { flag: "voidCastleDefeatDialogueShown", script: voidCastleDefeatScript },
  [FINAL_BATTLE_MISSION_ID]: { flag: "finalBattleDefeatDialogueShown", script: finalBattleDefeatScript },
});

// The mirror image: a beat that plays when the PLAYER loses, between the final blow and the
// results screen. Only the finale has one, and only for one specific way of losing —
// Blacksword's Banish, which spends his own life to take the whole party with him. It is the
// one loss in the game that is a deliberate, earned play by the enemy rather than a grind,
// and it deserves to be acknowledged instead of dumped straight onto a defeat screen.
// `when` gates it so an ordinary defeat still goes quietly to results.
const CAMPAIGN_LOSS_BEATS = Object.freeze({
  [FINAL_BATTLE_MISSION_ID]: {
    flag: "finalBattleBanishDialogueShown",
    script: finalBattleBanishScript,
    when: () => campaignMeta.finalBattleBanished,
  },
});

function announceTurnChange(prevPlayer) {
  if (!shouldShowTurnAnnouncement({
    tempo: isTempoBattle(state),
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    prevPlayer
  })) return;
  if (state.phase === "complete") {
    net?.endMatch(); // clean finish: let the session keep the socket alive briefly for the peer
    announceTurn(state.winner);
    const summary = buildSummary(state, { matchStartedAt, initialHpByPlayer });
    claimOnlineMatchValorReward(globalThis.localStorage, summary, { matchConfig, match: state, mySeat });
    if (matchConfig?.mode === "campaign" && campaignMissionId) {
      summary.campaign = completeCampaignMission(globalThis.localStorage, campaignMissionId, state, { ...campaignMeta });
      // Choice-reward missions run their reward pick on the map AFTER results.
      // Only queue it on a win whose reward hasn't already been
      // granted, and force the results screen to route back through the map so the
      // post-match cutscene + reward pick can't be skipped.
      const mission = getCampaignMission(campaignMissionId);
      const rewardPack = mission?.rewardSkinPack ?? null;
      const rewardUnitPack = mission?.rewardUnitChoicePack ?? null;
      if (
        rewardPack &&
        state.winner === 1 &&
        !isCampaignSkinRewardGranted(globalThis.localStorage, rewardPack)
      ) {
        pendingCampaignReward = { missionId: campaignMissionId, packId: rewardPack };
        summary.campaign.forceMapReturn = true;
      } else if (
        rewardUnitPack &&
        state.winner === 1 &&
        !isCampaignUnitRewardGranted(globalThis.localStorage, rewardUnitPack)
      ) {
        pendingCampaignReward = { missionId: campaignMissionId, unitPackId: rewardUnitPack };
        summary.campaign.forceMapReturn = true;
      } else if (
        state.winner === 1 &&
        shouldShowCampaignPostMatchCutscene(globalThis.localStorage, campaignMissionId)
      ) {
        pendingCampaignReward = { missionId: campaignMissionId, packId: null };
        summary.campaign.forceMapReturn = true;
      }
    }
    const showResults = () => {
      window.clearTimeout(resultsTimer);
      resultsTimer = window.setTimeout(() => menu.showResults(summary), 1600);
    };
    const beat = state.winner === 1
      ? CAMPAIGN_DEFEAT_BEATS[campaignMissionId]
      : CAMPAIGN_LOSS_BEATS[campaignMissionId];
    if (beat && !campaignMeta[beat.flag] && (beat.when ? beat.when() : true)) {
      campaignMeta[beat.flag] = true;
      const script = beat.script(state);
      if (script.length) {
        void dialogue.show(script).then(showResults);
      } else {
        showResults();
      }
    } else {
      showResults();
    }
  } else if (state.currentPlayer !== prevPlayer) {
    announceTurn(state.currentPlayer);
    if (net && state.currentPlayer !== mySeat) setMessage(`Player ${state.currentPlayer}'s turn — please wait.`);
  }
}

// --- Command dispatch ---

// Set by every successful dispatch() so a caller that needs the resolved events
// (e.g. a trampling MOVE_UNIT's harmed/damageByTarget/path) can read them without
// dispatch() itself growing animation concerns.
let lastDispatchEvents = [];

function resolveCommand(command) {
  const validation = tutorial ? validateTutorialCommand(tutorial, command, state) : { accepted: true };
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
  const prepared = tutorial ? prepareTutorialCommand(tutorial, command) : command;
  return { prepared, result: applyCommand(state, prepared) };
}

function commandErrorMessage(result, command, commandState = state) {
  return result.message ?? readableError(result.errorCode, commandState, command?.player ?? commandState?.currentPlayer);
}

function dispatch(command, { deferRolloverFx = false } = {}) {
  const prevPlayer = state.currentPlayer;
  const beforeState = state;
  const { prepared, result } = resolveCommand(command);
  if (!result.accepted) {
    recordCampaignRejection(prepared, result);
    setMessage(commandErrorMessage(result, prepared, beforeState), true);
    return false;
  }
  lastDispatchEvents = result.events ?? [];
  recordOnlineValorEvents(matchConfig, lastDispatchEvents);
  state = result.nextState;
  recordTutorialProgress(prepared, result, prevPlayer);
  recordCampaignProgressHooks(prepared, result, beforeState);
  broadcastIfLocal(prepared);
  playEventSounds(result.events ?? []);
  if (!deferRolloverFx) void playRolloverFx(result.events ?? []);
  if (state.activation) selectedId = state.activation.unitId;
  else { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  announceTurnChange(prevPlayer);
  maybeStartCpuTurn();
  return true;
}

// Mission-scoped CPU ART denylist, threaded into chooseActivation's excludeArtIds. Two
// missions use it: Mission 3's Rain Dance heal-stall cap (see WITCH_DOCTOR_HEAL_CAST_CAP),
// and the finale's Banish gate.
function campaignCpuExcludedArtIds() {
  if (matchConfig?.mode !== "campaign") return null;
  if (campaignMissionId === FINAL_BATTLE_MISSION_ID) return finalBattleExcludedArtIds();
  if (campaignMissionId !== WITCH_DOCTOR_MISSION_ID) return null;
  if (campaignMeta.witchDoctorHealCastCount < WITCH_DOCTOR_HEAL_CAST_CAP) return null;
  return ["rain-dance"];
}

// Banish kills every enemy on a dark tile and costs Blacksword every point of HP he has
// left — he does not survive casting it. Spending his life to take out one or two of you is
// a bad trade he would never make, and the engine's own gate (any enemy on a dark tile) is
// far too eager. So he only reaches for it when it takes the WHOLE party with him. That
// makes it a real threat with a real answer: the party is never wiped by it unless all four
// were standing on the dark, which is a thing the player controls.
function finalBattleExcludedArtIds() {
  const party = state.units.filter((unit) => unit.player === 1 && unit.hp > 0);
  const wipesParty = party.length > 0 &&
    party.every((unit) => getTileAffinity(state, unit.position) === "dark");
  return wipesParty ? null : ["banish-dark"];
}

function recordCampaignRejection(command, result) {
  if (matchConfig?.mode !== "campaign") return;
  if (campaignMissionId !== WITCH_DOCTOR_MISSION_ID) return;
  if (result?.errorCode !== "TARGET_OBSTRUCTED") return;
  if (command?.player !== 1) return;
  campaignMeta.blockedShotQueued = true;
  maybeShowCampaignDialogue();
}

function recordCampaignProgressHooks(command, result, beforeState = null) {
  recordCampaignProgress({
    matchMode: matchConfig?.mode,
    campaignMissionId,
    campaignMeta,
    state,
    command,
    result,
    beforeState,
  });
  maybeShowCampaignDialogue();
}

function nextCampaignDialogueBeat() {
  return selectCampaignDialogueBeat({ campaignMissionId, campaignMeta, state });
}


function maybeShowCampaignDialogue() {
  if (matchConfig?.mode !== "campaign" || dialogue.isOpen() || state.phase !== "playing") return;
  const beat = nextCampaignDialogueBeat();
  if (!beat) return;
  beat.markShown();
  const script = beat.script(state);
  if (!script.length) return;
  // Beats can chain: a Final Battle stage change is a beat whose afterAction builds the NEXT
  // stage, which immediately has a beat of its own (the duel introducing itself). Re-asking
  // after each script closes is safe — every beat latches its own shown-flag, so this settles.
  void dialogue.show(script).then(async () => {
    await ensureFinalBattleStageAdvanced();
    maybeShowCampaignDialogue();
    maybeStartCpuTurn();
  });
}

function recordTutorialProgress(command, result, previousPlayer) {
  if (!tutorial) return;
  const update = recordTutorialCommand(tutorial, {
    command,
    events: result.events ?? [],
    match: state,
    previousPlayer,
  });
  // Some scripted moments (the RAGE tutorial's Nuke wiping every real enemy
  // commander) trigger a genuine victory the tutorial isn't ready to end on yet.
  // This must revert synchronously, before the caller's announceTurnChange() reads
  // state.phase, or a results screen flashes in ahead of the follow-up dialogue.
  if (update.revertVictory && state.phase === "complete") {
    state.phase = "playing";
    state.winner = null;
    state.activation = null;
  }
  queueTutorialPresentation(update);
}

function queueTutorialPresentation(update = {}) {
  tutorialPresentation.queue(update);
}

function consumeTutorialPrompt(fallback) {
  return tutorialPresentation.consumePrompt(fallback);
}

function flushTutorialPresentation() {
  tutorialPresentation.flush();
}

function applyTutorialPresentationAction(action) {
  if (!action) return;
  if (action.type === "revealUnit") {
    revealTutorialUnit(action.unitId, action.position);
    if (Number.isInteger(action.currentPlayer)) state.currentPlayer = action.currentPlayer;
    state.activation = null;
    render();
    return;
  }
  if (action.type === "formationSwap") {
    for (const unitId of action.hideUnitIds ?? []) hideTutorialUnit(unitId);
    for (const spawn of action.revealUnits ?? []) revealTutorialUnit(spawn.unitId, spawn.position, spawn.hp, spawn.mp, spawn.spent);
    for (const spawn of action.spawnUnits ?? []) spawnTutorialUnit(spawn);
    if (Number.isInteger(action.currentPlayer)) state.currentPlayer = action.currentPlayer;
    state.activation = null;
    render();
    if (action.dialogue || action.prompt) queueTutorialPresentation({ dialogue: action.dialogue, prompt: action.prompt });
  }
}

// Introduces a brand-new unit mid-match for a scripted formation swap (the RAGE
// tutorial's second enemy Magician "arriving" for its new formation) rather than
// revealing one already present in the squad — buildRoster caps a squad at the
// four corner-block cells, so a fresh unit can't just ride in the initial squads.
function spawnTutorialUnit({ id, type, player, position, hp = null, mp = null, skin = null, spent = false }) {
  if (findUnit(state, id)) return;
  const unit = createUnit({ id, type, player, x: position.x, y: position.y, skin });
  if (Number.isFinite(hp)) unit.hp = hp;
  if (Number.isFinite(mp)) unit.mp = mp;
  unit.spent = Boolean(spent);
  state.units.push(unit);
}

function finishTutorialPresentation() {
  resolving = true;
  selectedId = null;
  mode = null;
  footworkPath = [];
  volleyShotOrigin = null;
  render();

  const progress = completeTutorial(globalThis.localStorage, tutorial.id ?? TUTORIAL_BASICS_ID);
  setMessage(consumeTutorialPrompt("Tutorial complete."));
  menu.showTutorialComplete({
    title: tutorialCompleteTitle(tutorial.id),
    tutorialId: tutorial.id,
    rewardChoices: progress.rewardChoices,
    selectedRewardSkin: progress.selectedRewardSkin,
    rewardGranted: progress.rewardGranted,
    allTutorialsComplete: progress.allTutorialsComplete,
  });
}

function tutorialCompleteTitle(tutorialId) {
  const entry = TUTORIAL_CATALOG.find((candidate) => candidate.id === tutorialId);
  return entry ? `${entry.title} Complete` : "Tutorial Complete";
}

function revealTutorialUnit(unitId, position = null, hp = null, mp = null, spent = false) {
  const unit = findUnit(state, unitId);
  if (!unit) return;
  const definition = getUnitType(unit.type);
  if (position) unit.position = { ...position };
  unit.hp = Number.isFinite(hp) ? hp : definition.stats.maxHp;
  unit.mp = Number.isFinite(mp) ? mp : getInitialMp(definition);
  unit.spent = Boolean(spent);
  unit.defending = false;
  if (unitId === TUTORIAL_ARTS_PLAYER_MYSTIC_ID) {
    setMessage("The Mystic joins the field. Activate her and use Pray to heal the Archer.");
  }
}

// Kills a unit outside combat for a scripted formation swap (e.g. the RAGE tutorial's
// trapped Magician "disappearing" once Nuke resolves). Mirrors revealTutorialUnit in
// reverse; hp<=0 already excludes it from rendering and turn order everywhere else.
function hideTutorialUnit(unitId) {
  const unit = findUnit(state, unitId);
  if (!unit) return;
  unit.hp = 0;
  unit.spent = true;
  unit.defending = false;
}

async function revealRoll(outcome, label = null, originUnit = null) {
  if (isTempoBattle(state)) {
    const unit = originUnit ?? selectedUnit();
    if (unit) {
      const text = label ?? (outcome.missed ? "MISS" : outcome.critical ? "CRIT" : "HIT");
      const color = outcome.missed ? "#cbb78b" : outcome.critical ? "#ffd26a" : "#f3dc86";
      await effects.floatText(unitCenter(createBoardMetrics(state.size), unit), text, color);
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
  mode = null; footworkPath = []; volleyShotOrigin = null;
  if (artCalloutEvent) playArtCallout(artCalloutEvent);
  if (isTempoBattle(state)) {
    render();                 // pre-command board (targeting cleared, nothing committed yet)
    state = result.nextState; // commit up front, before animating
    tempoAnimating += 1;
  } else {
    resolving = true;
    render();
  }
}

// Retire a rolled action once its animation finishes. Classic commits here; tempo already
// committed in beginResolve and only reconciles the board + selection.
function endResolve(prepared, result, prevPlayer) {
  const events = result.events ?? [];
  const tempo = isTempoBattle(state);
  const beforeState = tempo ? null : state;
  if (tempo) tempoAnimating = Math.max(0, tempoAnimating - 1);
  else state = result.nextState;
  recordTutorialProgress(prepared, result, prevPlayer);
  recordCampaignProgressHooks(prepared, result, beforeState);
  broadcastIfLocal(prepared);
  playEventSounds(events);
  playRolloverFx(events);
  if (tempo) {
    // Only drop the selection if the piece we were commanding is spent/gone — never clobber a
    // unit the player switched to mid-animation.
    const sel = selectedUnit();
    if (!sel || sel.spent || sel.hp <= 0) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
    if (tempoAnimating === 0) render();
  } else {
    if (!state.activation) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
    render();
    resolving = false;
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
  const guard = createResolutionGuard(matchEpoch, () => matchEpoch, { effects, revealRoll, playAttackImpactSound });
  const prevPlayer = state.currentPlayer;
  const { prepared, result } = resolveCommand(command);
  if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
  const events = result.events ?? [];
  const before = state;
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
  const guard = createResolutionGuard(matchEpoch, () => matchEpoch, { effects, audio });
  const prevPlayer = state.currentPlayer;
  const { prepared, result } = resolveCommand(command);
  if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
  const event = (result.events ?? []).find((e) => e.type === "WALL_ATTACKED");

  const metrics = createBoardMetrics(state.size);
  const attackerBefore = findUnit(state, command.actorId); // captured before beginResolve commits
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
  const guard = createResolutionGuard(matchEpoch, () => matchEpoch, { effects, audio, render, revealRoll });
  const prevPlayer = state.currentPlayer;
  const { prepared, result } = resolveCommand(command);
  if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
  const events = result.events ?? [];
  const resolved = events.find((e) => e.type === "ART_RESOLVED");
  const actorBefore = resolved ? findUnit(state, resolved.actorId) : null;
  const targetIds = resolved?.targetIds ?? resolved?.harmed ?? (resolved?.targetId ? [resolved.targetId] : []);
  const targetsBefore = targetIds.map((id) => findUnit(state, id)).filter(Boolean);

  resolving = true;
  // Instant ARTs commit at the END of their animation, so in tempo we briefly hold input to
  // keep a concurrent command from clobbering the pending commit. Cleared in the tail below.
  if (isTempoBattle(state)) tempoBusy = true;
  mode = null; footworkPath = []; volleyShotOrigin = null;
  playArtCallout(resolved);
  render();

  await presentInstantArt({
    state,
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

  const beforeState = state;
  state = result.nextState;
  recordTutorialProgress(prepared, result, prevPlayer);
  recordCampaignProgressHooks(prepared, result, beforeState);
  broadcastIfLocal(prepared);
  playEventSounds(events);
  playRolloverFx(events);
  if (state.activation) selectedId = state.activation.unitId;
  else { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
  announceTurnChange(prevPlayer);
  resolving = false;
  tempoBusy = false;
  maybeStartCpuTurn();
  flushTutorialPresentation();
  return true;
}

// --- CPU driver ---

function maybeStartCpuTurn() {
  cpuTurnController.maybeStartCpuTurn();
}

function maybeStartTempoCpuTurn() {
  cpuTurnController.maybeStartTempoCpuTurn();
}

async function applyCpuCommand(command) {
  return cpuTurnController.applyCpuCommand(command);
}

async function resolveCpuMove(command, options) {
  return cpuTurnController.resolveCpuMove(command, options);
}
// --- Activation completion ---

function maybeAutoFinish() {
  const activation = state.activation;
  if (activation && activation.moved && activation.primaryUsed) {
    dispatch(finishActivation(state.currentPlayer, activation.unitId));
    setMessage(consumeTutorialPrompt("Activation complete. The next commander takes the field."));
  }
}

function finishNow() {
  const activation = state.activation;
  if (activation && activation.primaryUsed) {
    dispatch(finishActivation(state.currentPlayer, activation.unitId));
    setMessage(consumeTutorialPrompt("Activation complete. The next commander takes the field."));
  }
}

// --- Command presentation helpers ---

function artDefinition(unit, artId) {
  return getArt(unit.type, artId);
}

// --- Input ---

function beginUnit(unit) {
  // Tempo has its own ownership rules (readiness gauges, player-priority preempt) and must
  // accept a click even while the board is busy, so it bypasses the turn-based input lock.
  if (isTempoBattle(state)) { beginTempoUnit(unit); return; }
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



// --- Input wiring ---

document.querySelector("#restartBtn").addEventListener("click", resetBattle);
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
