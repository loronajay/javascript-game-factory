import { attack, attackTile, beginActivation, cancelMove, concede, defend, finishActivation, moveUnit, useArt } from "./core/commands.js";
import { UNIT_TYPES, getArt, getAvailableArts, getCommandBuffStats, getEffectiveStats, getInitialMp, getSoulShuffleChoices, getUnitType } from "./core/unitCatalog.js";
import { areAllies, areEnemies, createBattleState, createUnit, findUnit, isWallAt, unitAt } from "./core/state.js";
import { canUseArt, getConeCells, getConeOriginForTarget, getFirePlacementTiles, getFlightTiles, getFootworkStepOptions, getFootworkSteps, getLegalFleeTiles, getLineTargets, getProtectLandingTiles, getRevivePlacementTiles, getReviveTargets, getRushStepOptions, getRushSteps, getSelfBlastRadius, getSummonPlacementTiles, getTargetedBlastAimTiles, getVolleyShotAimOptions, getVolleyShotCells, getVolleyShotOriginForTarget, getWallPlacementTiles } from "./rules/arts.js";
import { getBasicAttackDamageType, isWallBetween } from "./rules/combat.js";
import { canTrample, chebyshevDistance, getTrampleMoveOptions, positionKey } from "./rules/movement.js";
import { isStunned } from "./rules/statuses.js";
import { applyCommand } from "./core/reducer.js";
import { chooseActivation, cpuRng } from "./ai/cpuController.js";
import { createBoardMetrics, gridToScreen } from "./ui/isometric.js";
import { createEffects } from "./ui/effects.js";
import { clumsySplashTargets, healingPresentationTargets, orderedHitTargets, shouldUseRangedAttackAnimation, wallOreGainFloat } from "./ui/combatPresentation.js";
import { TurnAnnouncer } from "./ui/turnFlash.js";
import { createMenuFlow } from "./ui/menuFlow.js";
import { DEFAULT_SQUAD } from "./ui/squadPicker.js";
import { AudioManager, musicKeyForMatchMode } from "./audio/sounds.js";
import { isHealArtConfirmTile, renderBoard } from "./ui/boardRenderer.js";
import { mountSceneBackdrop } from "./ui/sceneBackdrop.js";
import { renderForecast } from "./ui/forecastRenderer.js";
import { resolveAnimatedMove } from "./ui/animatedCommands.js";
import { renderHeader, renderUnitCard, renderActions, renderSquads } from "./ui/hud.js";
import { RulesModal } from "./ui/rulesModal.js";
import { applyMobileViewport, requestMobileFullscreen } from "./ui/mobileViewport.js";
import { applyTheme, loadSavedThemeId } from "./ui/themes.js";
import { shouldShowTurnAnnouncement, turnAnnouncementSub } from "./ui/turnAnnouncement.js";
import { openChoiceModal } from "./ui/choiceModal.js";
import { createDialogueSystem } from "./ui/dialogue.js";
import { buildSummary, createMatchState, hpRemaining, readableError, teamColor } from "./match/matchBuilder.js";
import {
  TEMPO_GAUGE_MAX,
  advanceTempoBattle,
  enableTempoBattle,
  getTempoReadiness,
  isTempoBattle,
  isTempoUnitReady
} from "./core/tempoBattle.js";
import {
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  BROTHERS_MISSION_ID,
  GARGOYLE_MISSION_ID,
  HASBEEN_HEROES_FAT_TYPES,
  HASBEEN_HEROES_MISSION_ID,
  MINER_MISSION_ID,
  MONK_MISSION_ID,
  NECROMANCER_MISSION_ID,
  PALADIN_MISSION_ID,
  RONIN_MISSION_ID,
  SNIPER_MISSION_ID,
  VIRUS_MISSION_ID,
  WITCH_DOCTOR_HEAL_CAST_CAP,
  WITCH_DOCTOR_MISSION_ID,
  applyMonkTrialIntroBeat,
  campaignMapCutsceneScript,
  campaignOpeningScript,
  campaignPostMatchCutsceneScript,
  campaignRewardPickedScript,
  brothersDefeatScript,
  brothersRageWarningScript,
  clodRageWarningScript,
  completeCampaignMission,
  fatherTimeRageWarningScript,
  gargoyleRageWarningScript,
  getCampaignMission,
  hasbeenFatRageWarningScript,
  hasbeenHeroesDefeatScript,
  markCampaignMapCutsceneSeen,
  markCampaignPostMatchCutsceneSeen,
  minerBlastingCapSplashWarningScript,
  minerDefeatScript,
  minerRageWarningScript,
  necromancerRageWarningScript,
  necromancerStatusWarningScript,
  necromancerSummonWarningScript,
  paladinDefeatScript,
  paladinLightseekerWarningScript,
  paladinRageWarningScript,
  paladinStatusTauntScript,
  prepareCampaignMatchState,
  roninBlindWarningScript,
  roninRageWarningScript,
  sniperFireWarningScript,
  shouldShowBrothersRageWarning,
  shouldShowCampaignMapCutscene,
  shouldShowCampaignPostMatchCutscene,
  shouldShowClodRageWarning,
  shouldShowFatherTimeRageWarning,
  shouldShowGargoyleRageWarning,
  shouldShowHasbeenFatRageWarning,
  shouldShowMinerBlastingCapSplashWarning,
  shouldShowMinerRageWarning,
  shouldShowNecromancerRageWarning,
  shouldShowNecromancerStatusWarning,
  shouldShowNecromancerSummonWarning,
  shouldShowPaladinLightseekerWarning,
  shouldShowPaladinRageWarning,
  shouldShowPaladinStatusTaunt,
  shouldShowRoninBlindWarning,
  shouldShowRoninRageWarning,
  shouldShowSniperFireWarning,
  shouldShowVirusEnemyStatusTaunt,
  shouldShowVirusPoisonWarning,
  shouldShowWitchDoctorBlockedShotWarning,
  shouldShowWitchDoctorFireWarning,
  shouldShowWitchDoctorGhoulWarning,
  shouldShowWitchDoctorRageWarning,
  virusEnemyStatusTauntScript,
  virusPoisonWarningScript,
  witchDoctorBlockedShotWarningScript,
  witchDoctorFireWarningScript,
  witchDoctorGhoulWarningScript,
  witchDoctorRageWarningScript,
} from "./campaign/campaign.js";
import { isCampaignSkinRewardGranted } from "./progression/unlocks.js";
import {
  TUTORIAL_ARTS_PLAYER_MYSTIC_ID,
  TUTORIAL_BASICS_ID,
  TUTORIAL_CATALOG,
  chooseTutorialCpuActivation,
  completeTutorial,
  createTutorial,
  prepareTutorialMatchState,
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
const actionHelp = document.querySelector("#actionHelp");
const squadOverlays = document.querySelector("#squadOverlays");
const message = document.querySelector("#message");
const refModal = document.querySelector("#refModal");
const dialogueLayer = document.querySelector("#dialogueLayer");

// --- View state ---
let state = createBattleState();
let selectedId = null;
let mode = null;
let footworkPath = [];
let volleyShotOrigin = null;
let areaForecastCenter = null;
let areaForecastMode = null;
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
let tutorial = null;
let pendingTutorialPrompt = null;
let pendingTutorialDialogue = null;
let pendingTutorialComplete = false;
let pendingTutorialSpotlight = null;
let pendingTutorialSelectUnitId = null;
let pendingTutorialBeforeDialogueAction = null;
let pendingTutorialAfterDialogueAction = null;
let tutorialPresentationTimer = 0;
let campaignMissionId = null;
// Set at the end of a mission whose reward flow must run on the map (The Wandering
// Party): { missionId, packId }. Consumed by onCampaignMapEntered when the player is
// routed back to the campaign map from the results screen. Cleared once consumed.
let pendingCampaignReward = null;
let tempoFrame = 0;
let tempoLastFrameAt = 0;
// Cheap fingerprint of everything render() cares about beyond the readiness-gauge
// widths. The real-time loop rebuilds the full board/HUD only when this changes; a
// plain gauge fill just nudges the existing bars (see the tempo loop + updateTempoGauges).
let tempoRenderSignature = "";
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

function createCampaignMeta() {
  return {
    // Clod (mission 1)
    clodWarningShown: false,
    clodChargeUsed: false,
    clodChargeHitCount: 0,
    chargeDefended: false,
    // Necromancer (mission 2)
    statusWarningShown: false,
    summonWarningShown: false,
    rageWarningShown: false,
    cleanseUsed: false,
    spreadHitCount: 0,
    // Witch Doctor (mission 3)
    fireWarningShown: false,
    blockedShotWarningShown: false,
    blockedShotQueued: false,
    ghoulWarningShown: false,
    witchDoctorRageWarningShown: false,
    ghoulsDefeatedCount: 0,
    fireDamageTakenCount: 0,
    ghoulBiteTakenCount: 0,
    blackDeathDanceUsed: false,
    witchDoctorHealCastCount: 0,
    // Father Time (mission 4)
    fatherTimeRageWarningShown: false,
    archerDefeatedBeforeFatherTime: false,
    archerBlinded: false,
    rewindUsed: false,
    // Virus (mission 5)
    virusPoisonWarningShown: false,
    virusEnemyStatusTauntShown: false,
    playerAfflictedEnemyStatus: false,
    // Paladin (mission 6)
    paladinLightseekerWarningShown: false,
    paladinStatusTauntShown: false,
    paladinRageWarningShown: false,
    paladinLightseekerDamageTakenCount: 0,
    paladinStatusAttempted: false,
    paladinDefeatDialogueShown: false,
    // Monk (mission 7)
    monkFakeKilledBeforeReal: false,
    monkBlindAttempted: false,
    // Gargoyle (mission 8)
    gargoyleRageWarningShown: false,
    gargoyleEnteredRage: false,
    gargoylePyroclasmDamageTakenCount: 0,
    // Sniper (mission 9) — shares fireDamageTakenCount above
    sniperFireWarningShown: false,
    wallDestroyedCount: 0,
    sniperBlinded: false,
    // Miner (mission 11)
    minerBlastingCapSplashWarningShown: false,
    minerRageWarningShown: false,
    minerBlastingCapSplashTakenCount: 0,
    minerEnteredRage: false,
    minerRageHarvested: false,
    minerDefeatDialogueShown: false,
    // Mechs on the Farm (mission 7.5)
    flamethrowerBothHitCount: 0,
    brothersEnteredRage: false,
    brothersDefeatDialogueShown: false,
    brothersRageWarned: { "big-brother": false, "little-brother": false },
    // Has-Been Heroes (mission 12)
    fartDisplacementDamageTakenCount: 0,
    hasbeenDefeatDialogueShown: false,
    // Per-fat-member one-time RAGE popup flags, keyed by unit type.
    hasbeenFatRageWarned: Object.fromEntries(HASBEEN_HEROES_FAT_TYPES.map((type) => [type, false])),
    // Ronin (mission 13)
    roninBlindWarningShown: false,
    roninRageWarningShown: false,
    roninBlindApplied: false,
    roninEnteredRage: false,
  };
}
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const CPU_TURN_LEAD_MS = 480;        // pause before the CPU's first move
const CPU_ACTIVATION_GAP_MS = 320;   // between one unit finishing and the next
const CPU_STEP_MS = 260;             // beat when a CPU unit takes the field
const CPU_MAX_ACTIVATIONS = 64;      // guard against a runaway planning loop

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
  if (isTempoBattle(state)) return dialogue.isOpen() || state.phase !== "playing" || tempoBusy;
  return resolving || dialogue.isOpen() || !currentPlayerIsLocal();
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
const dialogue = createDialogueSystem(dialogueLayer, {
  getState: () => state,
  onOpen: render,
  onClose: render,
  onLineAction: handleDialogueLineAction,
});
const menu = createMenuFlow({ audio, onStartMatch: startMatch, onStartCampaignMission, onCampaignMissionSelected, onCampaignMapEntered, openCodex, onLeaveMatch });
window.tacticalArenaDialogue = dialogue;

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
      renderForecast({ forecastLayer, state, mode, actor: selectedUnit(), resolving, areaCenter: center });
    }
  });
  renderForecast({ forecastLayer, state, mode, actor: unit, resolving, areaCenter: currentAreaCenter });
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

// The one-time overworld cutscene plays when the mission node is first selected on
// the map — before the briefing/details panel — so the story beat leads into the
// mission, not into the match launch. Marked seen only once it has actually shown.
async function onCampaignMissionSelected(missionId, selectedSquad = null, options = {}) {
  if (!missionId || !shouldShowCampaignMapCutscene(globalThis.localStorage, missionId)) return;
  const script = campaignMapCutsceneScript(missionId, selectedSquad, options);
  if (!script.length) return;
  // Mark seen only after the cutscene has actually played out, so an interrupted or
  // never-rendered show doesn't silently burn the one-time story beat.
  await dialogue.show(script);
  if (missionId !== MINER_MISSION_ID && missionId !== RONIN_MISSION_ID) {
    markCampaignMapCutsceneSeen(globalThis.localStorage, missionId);
  }
}

function onStartCampaignMission(config) {
  startMatch(config);
}

// Runs when the campaign map screen is entered. If a mission's reward flow is pending
// (currently only The Wandering Party), play its post-match farewell cutscene — flag-
// gated so it only shows once — then open the one-time skin reward pick. The player was
// forced back here from the results screen so this sequence can't be skipped to the menu.
async function onCampaignMapEntered({ openCampaignRewardChoice } = {}) {
  const pending = pendingCampaignReward;
  if (!pending) return;
  pendingCampaignReward = null;
  if (shouldShowCampaignPostMatchCutscene(globalThis.localStorage, pending.missionId)) {
    const script = campaignPostMatchCutsceneScript(pending.missionId, state);
    if (script.length) await dialogue.show(script);
    markCampaignPostMatchCutsceneSeen(globalThis.localStorage, pending.missionId);
  }
  const picked = pending.packId ? await openCampaignRewardChoice?.(pending.packId) : null;
  // A closing beat plays only if the player actually took a reward (Has-Been Heroes'
  // Mystic payoff line); declining the pick shows nothing.
  if (picked) {
    const closer = campaignRewardPickedScript(pending.missionId);
    if (closer.length) await dialogue.show(closer);
  }
}

async function handleDialogueLineAction(action) {
  if (matchConfig?.mode !== "campaign" || campaignMissionId !== MONK_MISSION_ID) return;
  if (action === "monkIntroRevealAndMove") {
    const realMonkId = state.missionRules?.monkTrial?.realMonkId;
    const from = realMonkId ? findUnit(state, realMonkId)?.position : null;
    state = applyMonkTrialIntroBeat(state, action);
    render();
    const moved = realMonkId ? findUnit(state, realMonkId) : null;
    if (from && moved) {
      resolving = true;
      await effects.animateMovement(moved.id, from, moved.position);
      resolving = false;
      render();
    }
    return;
  }
  if (action === "monkIntroSplitShuffle") {
    state = applyMonkTrialIntroBeat(state, action);
    render();
    effects.shake(5);
    await sleep(260);
  }
}

function finalizeCampaignOpeningState() {
  if (matchConfig?.mode !== "campaign" || campaignMissionId !== MONK_MISSION_ID) return;
  if (state.missionRules?.monkTrial?.introComplete) return;
  state = applyMonkTrialIntroBeat(state, "monkIntroComplete");
  resolving = false;
  render();
}

function startMatch(config) {
  window.clearTimeout(resultsTimer);
  window.clearTimeout(tutorialPresentationTimer);
  stopTempoLoop();
  matchEpoch += 1;
  const online = config.mode === "online";
  // Online builds from the relay's shared seed so every client draws identical dice;
  // local play omits it for a fresh random seed each match.
  state = createMatchState({
    size: config.size,
    squads: config.squads,
    skins: config.skins,
    nicknames: config.nicknames,
    seed: online || config.mode === "tutorial" ? config.seed : undefined,
    playerCount: config.playerCount,
    format: config.format,
    teamColors: config.teamColors,
    teamNames: config.teamNames,
  });
  if (config.mode === "tutorial") state = prepareTutorialMatchState(state, config.tutorialId ?? TUTORIAL_BASICS_ID);
  if (config.mode === "campaign") state = prepareCampaignMatchState(state, config.campaignMissionId);
  if (config.battleMode === "tempo" || config.mode?.startsWith("tempo-")) state = enableTempoBattle(state);
  effects.setMetrics(createBoardMetrics(config.size));
  matchConfig = config;
  matchStartedAt = Date.now();
  initialHpByPlayer = {};
  for (const player of state.turnOrder ?? [1, 2]) initialHpByPlayer[player] = hpRemaining(state, player);
  tutorial = config.mode === "tutorial" ? createTutorial(config.tutorialId ?? TUTORIAL_BASICS_ID) : null;
  campaignMissionId = config.mode === "campaign" ? config.campaignMissionId : null;
  campaignMeta = createCampaignMeta();
  pendingTutorialPrompt = null;
  pendingTutorialDialogue = null;
  pendingTutorialComplete = false;
  pendingTutorialSpotlight = null;
  pendingTutorialSelectUnitId = null;
  pendingTutorialBeforeDialogueAction = null;
  pendingTutorialAfterDialogueAction = null;
  // Single-player drives Player 2 with the CPU. Tutorial mode uses the same turn lock,
  // but swaps in a scripted no-ART teaching driver.
  cpu = config.mode === "single" || config.mode === "tempo-single" || config.mode === "tutorial" || config.mode === "campaign"
    ? { difficulty: config.difficulty ?? "normal", players: new Set([2]) }
    : null;
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
  if (isTempoBattle(state)) setMessage("Tempo Battle begins. Units become ready by AGILITY.");
  if (tutorial) setMessage(tutorial.prompt);
  menu.show("match");
  if (audioUnlocked && !muted) audio.startMusic(musicKeyForMatchMode(config.mode, campaignMissionId));
  // Bind AFTER the match screen + state exist so any remote commands buffered during
  // the lobby→match handoff flush onto a live board.
  if (online) net.bind(onlineController);
  render();
  if (!isTempoBattle(state)) announceTurn(state.currentPlayer);
  if (tutorial) queueTutorialPresentation({ dialogue: tutorial.dialogue });
  else if (matchConfig?.mode === "campaign" && campaignMissionId) {
    const script = campaignOpeningScript(campaignMissionId, state);
    if (script.length) void dialogue.show(script).then(() => {
      finalizeCampaignOpeningState();
      maybeShowCampaignDialogue();
      maybeStartCpuTurn();
    });
  }
  if (isTempoBattle(state)) startTempoLoop();
  maybeStartCpuTurn();
}

function resetBattle() {
  if (net) return; // a networked match can't be unilaterally restarted
  startMatch(matchConfig ?? { size: 13, squads: { 1: [...DEFAULT_SQUAD], 2: [...DEFAULT_SQUAD] } });
}

function stopTempoLoop() {
  if (tempoFrame) window.cancelAnimationFrame(tempoFrame);
  tempoFrame = 0;
  tempoLastFrameAt = 0;
  tempoRenderSignature = "";
  tempoCpuActing = false;
  tempoCpuAbort = false;
  tempoAnimating = 0;
  tempoBusy = false;
}

function startTempoLoop() {
  stopTempoLoop();
  tempoLastFrameAt = performance.now();
  const tick = (now) => {
    tempoFrame = 0;
    if (!isTempoBattle(state) || menu.active !== "match") return;
    const delta = Math.min(250, Math.max(0, now - tempoLastFrameAt));
    tempoLastFrameAt = now;
    if (state.phase === "playing" && !dialogue.isOpen()) {
      const advanced = advanceTempoBattle(state, delta);
      if (advanced.state !== state) {
        state = advanced.state;
        if (advanced.events?.length) playRolloverFx(advanced.events);
        // While an action is animating, leave the board to the resolve loop and only nudge
        // the gauge bars — a full render here would rebuild the SVG mid-animation and tear
        // down the tokens being animated. Otherwise, do a full render ONLY when something
        // structural changed (a unit became ready, HP moved, an activation opened/closed,
        // the match ended); a plain gauge fill just updates the existing bars, so the HUD
        // stops churning 60×/second.
        if (resolving || tempoAnimating > 0) {
          updateTempoGauges();
        } else {
          const signature = tempoStructuralSignature();
          if (advanced.events?.length || signature !== tempoRenderSignature) {
            tempoRenderSignature = signature;
            render();
            announceTurnChange(null); // no-op in tempo except to fire the victory/results flow
            maybeStartTempoCpuTurn();
          } else {
            updateTempoGauges();
          }
        }
      }
    }
    tempoFrame = window.requestAnimationFrame(tick);
  };
  tempoFrame = window.requestAnimationFrame(tick);
}

// Everything render() depends on beyond the moment-to-moment gauge widths. When this is
// unchanged we skip the full rebuild and only animate the readiness bars.
function tempoStructuralSignature() {
  const ready = state.units.filter((u) => u.hp > 0 && isTempoUnitReady(state, u)).map((u) => u.id).join(",");
  const vitals = state.units.map((u) => `${u.id}:${u.hp}:${u.mp}:${u.spent ? 1 : 0}:${(u.statuses ?? []).length}`).join("|");
  return `${state.phase}#${state.activation?.unitId ?? ""}#${ready}#${vitals}`;
}

// Lightweight per-frame update of just the readiness gauges (and the "N units ready"
// header count) without rebuilding the board or the action bar. The gauge nodes carry a
// data-tempo-unit attribute (see hud.js) so we can target them in place.
function updateTempoGauges() {
  if (!isTempoBattle(state)) return;
  for (const el of document.querySelectorAll(".vital-tempo[data-tempo-unit]")) {
    const unitId = el.dataset.tempoUnit;
    const pct = Math.max(0, Math.min(100, Math.round(getTempoReadiness(state, unitId) / TEMPO_GAUGE_MAX * 100)));
    const ready = pct >= 100;
    const fill = el.querySelector(".vital-fill");
    const num = el.querySelector(".vital-num");
    if (fill) fill.style.width = `${pct}%`;
    if (num) num.textContent = ready ? "READY" : `${pct}%`;
    el.classList.toggle("is-ready", ready);
  }
}

function resumeActiveMusic() {
  if (muted || !audioUnlocked) return;
  audio.startMusic(menu.active === "match" ? musicKeyForMatchMode(matchConfig?.mode, campaignMissionId) : "menu");
}

// Called by the menu when the match screen is left. Abandon a still-live online
// match (the remaining peer wins by walkover); a cleanly finished one already ran
// net.endMatch(), so we only null our handles here.
function onLeaveMatch() {
  stopTempoLoop();
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
    if (matchConfig?.mode === "campaign" && campaignMissionId) {
      summary.campaign = completeCampaignMission(globalThis.localStorage, campaignMissionId, state, { ...campaignMeta });
      // Skin-reward missions (The Wandering Party, Has-Been Heroes) run their reward pick on
      // the map AFTER results. Only queue it on a win whose reward hasn't already been
      // granted, and force the results screen to route back through the map so the
      // post-match cutscene + reward pick can't be skipped.
      const rewardPack = getCampaignMission(campaignMissionId)?.rewardSkinPack ?? null;
      if (
        rewardPack &&
        state.winner === 1 &&
        !isCampaignSkinRewardGranted(globalThis.localStorage, rewardPack)
      ) {
        pendingCampaignReward = { missionId: campaignMissionId, packId: rewardPack };
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
    if (
      campaignMissionId === PALADIN_MISSION_ID &&
      state.winner === 1 &&
      !campaignMeta.paladinDefeatDialogueShown
    ) {
      campaignMeta.paladinDefeatDialogueShown = true;
      const script = paladinDefeatScript(state);
      if (script.length) {
        void dialogue.show(script).then(showResults);
      } else {
        showResults();
      }
    } else if (
      campaignMissionId === MINER_MISSION_ID &&
      state.winner === 1 &&
      !campaignMeta.minerDefeatDialogueShown
    ) {
      campaignMeta.minerDefeatDialogueShown = true;
      const script = minerDefeatScript(state);
      if (script.length) {
        void dialogue.show(script).then(showResults);
      } else {
        showResults();
      }
    } else if (
      campaignMissionId === HASBEEN_HEROES_MISSION_ID &&
      state.winner === 1 &&
      !campaignMeta.hasbeenDefeatDialogueShown
    ) {
      campaignMeta.hasbeenDefeatDialogueShown = true;
      const script = hasbeenHeroesDefeatScript(state);
      if (script.length) {
        void dialogue.show(script).then(showResults);
      } else {
        showResults();
      }
    } else if (
      campaignMissionId === BROTHERS_MISSION_ID &&
      state.winner === 1 &&
      !campaignMeta.brothersDefeatDialogueShown
    ) {
      campaignMeta.brothersDefeatDialogueShown = true;
      const script = brothersDefeatScript(state);
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

function commandErrorMessage(result) {
  return result.message ?? readableError(result.errorCode);
}

function dispatch(command) {
  const prevPlayer = state.currentPlayer;
  const { prepared, result } = resolveCommand(command);
  if (!result.accepted) {
    recordCampaignRejection(prepared, result);
    setMessage(commandErrorMessage(result), true);
    return false;
  }
  lastDispatchEvents = result.events ?? [];
  state = result.nextState;
  recordTutorialProgress(prepared, result, prevPlayer);
  recordCampaignProgressHooks(prepared, result);
  broadcastIfLocal(prepared);
  playEventSounds(result.events ?? []);
  playRolloverFx(result.events ?? []);
  if (state.activation) selectedId = state.activation.unitId;
  else { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  announceTurnChange(prevPlayer);
  maybeStartCpuTurn();
  return true;
}

// Mission-scoped CPU ART denylist, threaded into chooseActivation's excludeArtIds.
// Currently only Mission 3's Rain Dance heal-stall cap (see WITCH_DOCTOR_HEAL_CAST_CAP).
function campaignCpuExcludedArtIds() {
  if (matchConfig?.mode !== "campaign") return null;
  if (campaignMissionId !== WITCH_DOCTOR_MISSION_ID) return null;
  if (campaignMeta.witchDoctorHealCastCount < WITCH_DOCTOR_HEAL_CAST_CAP) return null;
  return ["rain-dance"];
}

function recordCampaignRejection(command, result) {
  if (matchConfig?.mode !== "campaign") return;
  if (campaignMissionId !== WITCH_DOCTOR_MISSION_ID) return;
  if (result?.errorCode !== "TARGET_OBSTRUCTED") return;
  if (command?.player !== 1) return;
  campaignMeta.blockedShotQueued = true;
  maybeShowCampaignDialogue();
}

function recordCampaignProgressHooks(command, result) {
  if (matchConfig?.mode !== "campaign") return;
  // Defensive: a bad call site passing no result must never throw here — an
  // exception in a resolver leaves `resolving` stuck and hardlocks the match.
  const events = result?.events ?? [];
  if (campaignMissionId === CLOD_MISSION_ID) {
    const charge = events.find((event) =>
      event.type === "ART_RESOLVED" &&
      event.actorId === "p2-0-clod" &&
      event.artId === "thunderous-charge");
    if (charge) {
      campaignMeta.clodChargeUsed = true;
      const playerHitIds = (charge.targetIds ?? []).filter((id) => findUnit(state, id)?.player === 1);
      campaignMeta.clodChargeHitCount = Math.max(campaignMeta.clodChargeHitCount, playerHitIds.length);
      campaignMeta.chargeDefended ||= playerHitIds.some((id) => findUnit(state, id)?.defending);
    }
  } else if (campaignMissionId === NECROMANCER_MISSION_ID || campaignMissionId === VIRUS_MISSION_ID) {
    // A cleanse (Mystic Purify / Fat Cleric Cleanse) that actually stripped something
    // reports a non-empty `cleansed` list; only the player's own cast counts.
    const cleansed = events.some((event) =>
      event.type === "ART_RESOLVED" &&
      Array.isArray(event.cleansed) && event.cleansed.length > 0 &&
      findUnit(state, event.actorId)?.player === 1);
    if (campaignMissionId === NECROMANCER_MISSION_ID && cleansed) campaignMeta.cleanseUsed = true;
    // Virus's Spread jumping a debuff onto a second player unit fails the spacing bonus.
    for (const event of events) {
      if (event.type !== "STATUS_SPREAD") continue;
      if ((event.spreadTo ?? []).some((id) => findUnit(state, id)?.player === 1)) {
        campaignMeta.spreadHitCount += 1;
      }
    }
    if (campaignMissionId === VIRUS_MISSION_ID && playerLandedEnemyStatus(events)) {
      campaignMeta.playerAfflictedEnemyStatus = true;
    }
  } else if (campaignMissionId === WITCH_DOCTOR_MISSION_ID) {
    campaignMeta.ghoulsDefeatedCount = Math.max(
      campaignMeta.ghoulsDefeatedCount,
      state.units.filter((unit) => unit.player === 2 && unit.type === "ghoul" && unit.hp <= 0).length,
    );
    for (const event of events) {
      if (event.type === "FIRE_DAMAGE" && findUnit(state, event.unitId)?.player === 1) {
        campaignMeta.fireDamageTakenCount += 1;
      }
      if (event.type === "AUTO_STRIKE") {
        const source = findUnit(state, event.sourceId);
        const target = findUnit(state, event.targetId);
        if (source?.type === "ghoul" && target?.player === 1) campaignMeta.ghoulBiteTakenCount += 1;
      }
      if (event.type === "ART_RESOLVED" && event.stance === "blackDeath") {
        const actor = findUnit(state, event.actorId);
        if (actor?.player === 2 && actor.type === "witch-doctor") campaignMeta.blackDeathDanceUsed = true;
      }
      // Count every Rain Dance cast against the mission's heal-cast cap so the CPU
      // can't stall to full HP while the player crosses the Ghoul lattice — see
      // WITCH_DOCTOR_HEAL_CAST_CAP in campaign.js.
      if (event.type === "ART_RESOLVED" && event.artId === "rain-dance") {
        const actor = findUnit(state, event.actorId);
        if (actor?.player === 2 && actor.type === "witch-doctor") {
          campaignMeta.witchDoctorHealCastCount += 1;
        }
      }
    }
  } else if (campaignMissionId === FATHER_TIME_MISSION_ID) {
    const fatherTime = state.units.find((unit) => unit.player === 2 && unit.type === "father-time") ?? null;
    const archer = state.units.find((unit) => unit.player === 2 && unit.type === "archer") ?? null;
    if (archer?.hp <= 0 && fatherTime?.hp > 0) {
      campaignMeta.archerDefeatedBeforeFatherTime = true;
    }
    if (archer?.statuses?.some((status) => status.type === "blind")) {
      campaignMeta.archerBlinded = true;
    }
    for (const event of events) {
      if (event.type !== "ART_RESOLVED") continue;
      const actor = findUnit(state, event.actorId);
      if (actor?.player !== 2 || actor.type !== "father-time") continue;
      if (event.artId === "rewind") {
        campaignMeta.rewindUsed = true;
      }
    }
  } else if (campaignMissionId === PALADIN_MISSION_ID) {
    for (const event of events) {
      if (event.type === "ART_RESOLVED" && event.actorId === "p2-0-paladin" && event.artId === "lightseeker") {
        const playerHits = (event.targetIds ?? []).filter((id) =>
          findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
        campaignMeta.paladinLightseekerDamageTakenCount += playerHits.length;
      }
    }
    if (playerTriedStatusOnPaladin(command, events)) {
      campaignMeta.paladinStatusAttempted = true;
    }
  } else if (campaignMissionId === MONK_MISSION_ID) {
    const realMonkId = state.missionRules?.monkTrial?.realMonkId;
    const realMonk = realMonkId ? findUnit(state, realMonkId) : null;
    if (realMonk?.hp > 0 && state.units.some((unit) => unit.trialFakeMonk && unit.hp <= 0)) {
      campaignMeta.monkFakeKilledBeforeReal = true;
    }
    if (playerTriedBlindOnMonk(command, events)) {
      campaignMeta.monkBlindAttempted = true;
    }
  } else if (campaignMissionId === GARGOYLE_MISSION_ID) {
    const gargoyle = findUnit(state, "p2-0-gargoyle");
    if (gargoyle?.hp > 0 && gargoyle.hp <= 5) {
      campaignMeta.gargoyleEnteredRage = true;
    }
    for (const event of events) {
      if (event.type === "FIRE_DAMAGE" && findUnit(state, event.unitId)?.player === 1) {
        campaignMeta.fireDamageTakenCount += 1;
      }
      const isChosenPyroclasm =
        event.type === "ART_RESOLVED" &&
        event.actorId === "p2-0-gargoyle" &&
        event.artId === "pyroclasm";
      const isFreePyroclasm =
        event.type === "PYROCLASM_ERUPT" &&
        event.actorId === "p2-0-gargoyle";
      if (!isChosenPyroclasm && !isFreePyroclasm) continue;
      const playerHits = (event.targetIds ?? []).filter((id) =>
        findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
      campaignMeta.gargoylePyroclasmDamageTakenCount += playerHits.length;
      if (isFreePyroclasm) campaignMeta.gargoyleEnteredRage = true;
    }
  } else if (campaignMissionId === SNIPER_MISSION_ID) {
    // A blind can tick off before the match ends, so latch the moment the enemy Sniper
    // wears one (mirrors Father Time's archerBlinded latch).
    const sniper = state.units.find((unit) => unit.player === 2 && unit.type === "sniper") ?? null;
    if (sniper?.statuses?.some((status) => status.type === "blind")) {
      campaignMeta.sniperBlinded = true;
    }
    for (const event of events) {
      if (event.type === "FIRE_DAMAGE" && findUnit(state, event.unitId)?.player === 1) {
        campaignMeta.fireDamageTakenCount += 1;
      }
      // Any wall the player brings down (a scattered cover wall or one the enemy Sniper
      // built) satisfies the destroy-a-wall objective.
      if (event.type === "WALL_ATTACKED" && event.destroyed && findUnit(state, event.actorId)?.player === 1) {
        campaignMeta.wallDestroyedCount += 1;
      }
    }
  } else if (campaignMissionId === MINER_MISSION_ID) {
    const miner = findUnit(state, "p2-0-miner");
    if (miner?.hp > 0 && miner.hp <= 5) {
      campaignMeta.minerEnteredRage = true;
    }
    for (const event of events) {
      if (event.type === "RAGE_REGENERATE" && event.unitId === "p2-0-miner" && (event.mpRestored ?? 0) > 0) {
        campaignMeta.minerEnteredRage = true;
        campaignMeta.minerRageHarvested = true;
      }
      if (event.type !== "ART_RESOLVED" || event.actorId !== "p2-0-miner" || event.artId !== "blasting-cap") continue;
      for (const id of event.blocked ?? []) {
        if (findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0) {
          campaignMeta.minerBlastingCapSplashTakenCount += 1;
        }
      }
    }
  } else if (campaignMissionId === HASBEEN_HEROES_MISSION_ID) {
    // The star is "take no Fart displacement damage": a Fart that CAN'T shove its target
    // (wall/body/edge behind it) deals true damage instead, surfaced on the resolve event's
    // `blocked` list. Count each blocked-shove that actually hit one of the player's units.
    for (const event of events) {
      if (event.type !== "ART_RESOLVED" || event.artId !== "fart") continue;
      if (findUnit(state, event.actorId)?.player !== 2) continue;
      for (const id of event.blocked ?? []) {
        if (findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0) {
          campaignMeta.fartDisplacementDamageTakenCount += 1;
        }
      }
    }
  } else if (campaignMissionId === RONIN_MISSION_ID) {
    const ronin = findUnit(state, "p2-0-ronin");
    if (ronin?.hp > 0 && ronin.hp <= 5) {
      campaignMeta.roninEnteredRage = true;
    }
    if (state.units.some((unit) =>
      unit.player === 1 && unit.statuses?.some((status) => status.type === "blind"))) {
      campaignMeta.roninBlindApplied = true;
    }
  } else if (campaignMissionId === BROTHERS_MISSION_ID) {
    // Latch the "kill before RAGE" star fail the moment either brother sits at RAGE
    // threshold (<=5 HP) while still alive (mirrors the Gargoyle/Miner rage latch).
    const bigBrother = findUnit(state, "p2-0-big-brother");
    const littleBrother = findUnit(state, "p2-1-little-brother");
    if ((bigBrother?.hp > 0 && bigBrother.hp <= 5) || (littleBrother?.hp > 0 && littleBrother.hp <= 5)) {
      campaignMeta.brothersEnteredRage = true;
    }
    // The "avoid double flame" star: any single Flamethrower cone — the active Little
    // Brother ART or the raging Flamespitter free cone — that damaged BOTH player units.
    for (const event of events) {
      const isFlamethrower =
        (event.type === "ART_RESOLVED" && event.artId === "flamethrower") ||
        (event.type === "FLAMESPITTER" && event.artId === "flamethrower");
      if (!isFlamethrower) continue;
      if (findUnit(state, event.actorId)?.player !== 2) continue;
      const playerHits = (event.targetIds ?? []).filter((id) =>
        findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
      if (playerHits.length >= 2) campaignMeta.flamethrowerBothHitCount += 1;
    }
  }
  maybeShowCampaignDialogue();
}

function playerTriedStatusOnPaladin(command, events = []) {
  if (command?.type !== "USE_ART" || command.player !== 1) return false;
  const actor = findUnit(state, command.unitId);
  const art = actor ? getArt(actor.type, command.artId) : null;
  if (!artHasStatusEffect(art)) return false;
  if (command.targetId === "p2-0-paladin") return true;
  const paladin = findUnit(state, "p2-0-paladin");
  if (!paladin) return false;
  if (!command.targetId && (art.selfCast || art.globalStatus || art.targeting?.shape === "selfAura")) return true;
  return events.some((event) =>
    event.type === "ART_RESOLVED" &&
    event.actorId === command.unitId &&
    (
      event.targetId === "p2-0-paladin" ||
      (event.targetIds ?? []).includes("p2-0-paladin") ||
      (event.statusTargets ?? []).includes("p2-0-paladin") ||
      (event.blinded ?? []).includes("p2-0-paladin")
    ));
}

function artHasStatusEffect(value) {
  if (!value || typeof value !== "object") return false;
  if (value.effect?.type === "status" || value.type === "status") return true;
  if (typeof value.status === "string" && value.type !== "immunity") return true;
  return Object.values(value).some((child) => {
    if (Array.isArray(child)) return child.some(artHasStatusEffect);
    return child && typeof child === "object" && artHasStatusEffect(child);
  });
}

function playerTriedBlindOnMonk(command, events = []) {
  if (command?.type !== "USE_ART" || command.player !== 1) return false;
  const actor = findUnit(state, command.unitId);
  const art = actor ? getArt(actor.type, command.artId) : null;
  if (!artHasBlindEffect(art)) return false;
  if (command.targetId && findUnit(state, command.targetId)?.type === "monk") return true;
  const monks = state.units.filter((unit) => unit.player === 2 && unit.type === "monk" && unit.hp > 0);
  if (!monks.length) return false;
  if (!command.targetId && (art.selfCast || art.globalStatus || art.targeting?.shape === "selfAura")) return true;
  return events.some((event) =>
    event.type === "ART_RESOLVED" &&
    event.actorId === command.unitId &&
    monks.some((monk) =>
      event.targetId === monk.id ||
      (event.targetIds ?? []).includes(monk.id) ||
      (event.statusTargets ?? []).includes(monk.id) ||
      (event.blinded ?? []).includes(monk.id)
    ));
}

function artHasBlindEffect(value) {
  if (!value || typeof value !== "object") return false;
  if (value.effect?.status === "blind" || value.globalStatus?.status === "blind") return true;
  if (value.status === "blind" && value.type !== "immunity") return true;
  return Object.values(value).some((child) => {
    if (Array.isArray(child)) return child.some(artHasBlindEffect);
    return child && typeof child === "object" && artHasBlindEffect(child);
  });
}

function playerLandedEnemyStatus(events) {
  return events.some((event) => {
    const actor = findUnit(state, event.actorId);
    if (actor?.player !== 1) return false;
    const targetIds = [
      event.targetId,
      ...(event.targetIds ?? []),
      ...(event.statusTargets ?? []),
      ...(event.blinded ?? []),
    ].filter(Boolean);
    if (!targetIds.some((id) => findUnit(state, id)?.player === 2)) return false;
    return Boolean(
      event.effect?.applied ||
      event.appliedStatus ||
      event.statusTargets?.length ||
      event.blinded?.length
    );
  });
}

// Returns the next eligible condition-triggered dialogue beat for the active mission
// (or null). Each beat marks its own once-only flag so the same warning never repeats.
function nextCampaignDialogueBeat() {
  if (campaignMissionId === CLOD_MISSION_ID) {
    if (shouldShowClodRageWarning(state, { warningShown: campaignMeta.clodWarningShown, chargeUsed: campaignMeta.clodChargeUsed })) {
      return { markShown: () => { campaignMeta.clodWarningShown = true; }, script: clodRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === NECROMANCER_MISSION_ID) {
    if (shouldShowNecromancerStatusWarning(state, { warningShown: campaignMeta.statusWarningShown })) {
      return { markShown: () => { campaignMeta.statusWarningShown = true; }, script: necromancerStatusWarningScript };
    }
    if (shouldShowNecromancerSummonWarning(state, { warningShown: campaignMeta.summonWarningShown })) {
      return { markShown: () => { campaignMeta.summonWarningShown = true; }, script: necromancerSummonWarningScript };
    }
    if (shouldShowNecromancerRageWarning(state, { warningShown: campaignMeta.rageWarningShown })) {
      return { markShown: () => { campaignMeta.rageWarningShown = true; }, script: necromancerRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === WITCH_DOCTOR_MISSION_ID) {
    if (shouldShowWitchDoctorFireWarning(state, {
      warningShown: campaignMeta.fireWarningShown,
      fireDamageTakenCount: campaignMeta.fireDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.fireWarningShown = true; }, script: witchDoctorFireWarningScript };
    }
    if (shouldShowWitchDoctorBlockedShotWarning(state, {
      warningShown: campaignMeta.blockedShotWarningShown,
      blockedShotQueued: campaignMeta.blockedShotQueued,
    })) {
      return {
        markShown: () => {
          campaignMeta.blockedShotWarningShown = true;
          campaignMeta.blockedShotQueued = false;
        },
        script: witchDoctorBlockedShotWarningScript,
      };
    }
    if (shouldShowWitchDoctorGhoulWarning(state, {
      warningShown: campaignMeta.ghoulWarningShown,
      ghoulBiteTakenCount: campaignMeta.ghoulBiteTakenCount,
    })) {
      return { markShown: () => { campaignMeta.ghoulWarningShown = true; }, script: witchDoctorGhoulWarningScript };
    }
    if (shouldShowWitchDoctorRageWarning(state, {
      warningShown: campaignMeta.witchDoctorRageWarningShown,
      blackDeathDanceUsed: campaignMeta.blackDeathDanceUsed,
    })) {
      return { markShown: () => { campaignMeta.witchDoctorRageWarningShown = true; }, script: witchDoctorRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === FATHER_TIME_MISSION_ID) {
    if (shouldShowFatherTimeRageWarning(state, {
      warningShown: campaignMeta.fatherTimeRageWarningShown,
      rewindUsed: campaignMeta.rewindUsed,
    })) {
      return { markShown: () => { campaignMeta.fatherTimeRageWarningShown = true; }, script: fatherTimeRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === VIRUS_MISSION_ID) {
    if (shouldShowVirusPoisonWarning(state, {
      warningShown: campaignMeta.virusPoisonWarningShown,
    })) {
      return { markShown: () => { campaignMeta.virusPoisonWarningShown = true; }, script: virusPoisonWarningScript };
    }
    if (shouldShowVirusEnemyStatusTaunt(state, {
      warningShown: campaignMeta.virusEnemyStatusTauntShown,
      playerAfflictedEnemyStatus: campaignMeta.playerAfflictedEnemyStatus,
    })) {
      return { markShown: () => { campaignMeta.virusEnemyStatusTauntShown = true; }, script: virusEnemyStatusTauntScript };
    }
    return null;
  }
  if (campaignMissionId === PALADIN_MISSION_ID) {
    if (shouldShowPaladinLightseekerWarning(state, {
      warningShown: campaignMeta.paladinLightseekerWarningShown,
      lightseekerDamageTakenCount: campaignMeta.paladinLightseekerDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.paladinLightseekerWarningShown = true; }, script: paladinLightseekerWarningScript };
    }
    if (shouldShowPaladinStatusTaunt(state, {
      warningShown: campaignMeta.paladinStatusTauntShown,
      statusAttempted: campaignMeta.paladinStatusAttempted,
    })) {
      return { markShown: () => { campaignMeta.paladinStatusTauntShown = true; }, script: paladinStatusTauntScript };
    }
    if (shouldShowPaladinRageWarning(state, {
      warningShown: campaignMeta.paladinRageWarningShown,
    })) {
      return { markShown: () => { campaignMeta.paladinRageWarningShown = true; }, script: paladinRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === GARGOYLE_MISSION_ID) {
    if (shouldShowGargoyleRageWarning(state, {
      warningShown: campaignMeta.gargoyleRageWarningShown,
    })) {
      return {
        markShown: () => {
          campaignMeta.gargoyleRageWarningShown = true;
          campaignMeta.gargoyleEnteredRage = true;
        },
        script: gargoyleRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === SNIPER_MISSION_ID) {
    if (shouldShowSniperFireWarning(state, {
      warningShown: campaignMeta.sniperFireWarningShown,
      fireDamageTakenCount: campaignMeta.fireDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.sniperFireWarningShown = true; }, script: sniperFireWarningScript };
    }
    return null;
  }
  if (campaignMissionId === MINER_MISSION_ID) {
    if (shouldShowMinerBlastingCapSplashWarning(state, {
      warningShown: campaignMeta.minerBlastingCapSplashWarningShown,
      minerBlastingCapSplashTakenCount: campaignMeta.minerBlastingCapSplashTakenCount,
    })) {
      return {
        markShown: () => { campaignMeta.minerBlastingCapSplashWarningShown = true; },
        script: minerBlastingCapSplashWarningScript,
      };
    }
    if (shouldShowMinerRageWarning(state, {
      warningShown: campaignMeta.minerRageWarningShown,
      minerRageHarvested: campaignMeta.minerRageHarvested,
    })) {
      return {
        markShown: () => {
          campaignMeta.minerRageWarningShown = true;
          campaignMeta.minerEnteredRage = true;
        },
        script: minerRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === HASBEEN_HEROES_MISSION_ID) {
    // Each fat member gets ONE popup the first time it enters RAGE. Progression is not
    // gated on these — the player is meant to avoid pushing them this far. Fire them in
    // fielding order, one per check, so simultaneous rages queue instead of colliding.
    for (const type of HASBEEN_HEROES_FAT_TYPES) {
      if (shouldShowHasbeenFatRageWarning(state, type, { warned: campaignMeta.hasbeenFatRageWarned[type] })) {
        return {
          markShown: () => { campaignMeta.hasbeenFatRageWarned[type] = true; },
          script: (matchState) => hasbeenFatRageWarningScript(matchState, type),
        };
      }
    }
    return null;
  }
  if (campaignMissionId === RONIN_MISSION_ID) {
    if (shouldShowRoninBlindWarning(state, {
      warningShown: campaignMeta.roninBlindWarningShown,
      roninBlindApplied: campaignMeta.roninBlindApplied,
    })) {
      return {
        markShown: () => { campaignMeta.roninBlindWarningShown = true; },
        script: roninBlindWarningScript,
      };
    }
    if (shouldShowRoninRageWarning(state, {
      warningShown: campaignMeta.roninRageWarningShown,
    })) {
      return {
        markShown: () => {
          campaignMeta.roninRageWarningShown = true;
          campaignMeta.roninEnteredRage = true;
        },
        script: roninRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === BROTHERS_MISSION_ID) {
    // Each brother gets ONE popup the first time it enters RAGE. Firing it also latches the
    // "kill before RAGE" star fail. Big Brother first, then Little Brother, one per check.
    for (const type of ["big-brother", "little-brother"]) {
      if (shouldShowBrothersRageWarning(state, type, { warned: campaignMeta.brothersRageWarned[type] })) {
        return {
          markShown: () => {
            campaignMeta.brothersRageWarned[type] = true;
            campaignMeta.brothersEnteredRage = true;
          },
          script: (matchState) => brothersRageWarningScript(matchState, type),
        };
      }
    }
    return null;
  }
  return null;
}

function maybeShowCampaignDialogue() {
  if (matchConfig?.mode !== "campaign" || dialogue.isOpen() || state.phase !== "playing") return;
  const beat = nextCampaignDialogueBeat();
  if (!beat) return;
  beat.markShown();
  const script = beat.script(state);
  if (!script.length) return;
  void dialogue.show(script).then(() => maybeStartCpuTurn());
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
  if (!tutorial) return;
  if (update.prompt) pendingTutorialPrompt = update.prompt;
  if (update.dialogue) pendingTutorialDialogue = update.dialogue;
  if (update.spotlight) pendingTutorialSpotlight = update.spotlight;
  if (update.selectUnitId) pendingTutorialSelectUnitId = update.selectUnitId;
  if (update.beforeDialogueAction) pendingTutorialBeforeDialogueAction = update.beforeDialogueAction;
  if (update.afterDialogueAction) pendingTutorialAfterDialogueAction = update.afterDialogueAction;
  if (update.completed) pendingTutorialComplete = true;
  window.clearTimeout(tutorialPresentationTimer);
  tutorialPresentationTimer = window.setTimeout(flushTutorialPresentation, 0);
}

function hasTutorialPresentation(update = {}) {
  return Boolean(
    update.prompt ||
    update.dialogue ||
    update.spotlight ||
    update.selectUnitId ||
    update.beforeDialogueAction ||
    update.afterDialogueAction ||
    update.completed
  );
}

function consumeTutorialPrompt(fallback) {
  if (!pendingTutorialPrompt) return fallback;
  const prompt = pendingTutorialPrompt;
  pendingTutorialPrompt = null;
  return prompt;
}

function flushTutorialPresentation() {
  if (!tutorial) return;
  if (resolving || cpuThinking || dialogue.isOpen()) return;
  applyPendingTutorialBeforeDialogueAction();
  applyPendingTutorialSelection();
  const spotlightShown = Boolean(pendingTutorialSpotlight);
  if (pendingTutorialSpotlight) showTutorialSpotlight(pendingTutorialSpotlight);
  if (pendingTutorialDialogue && !dialogue.isOpen()) {
    const script = pendingTutorialDialogue;
    pendingTutorialDialogue = null;
    void dialogue.show(script).then(() => {
      clearTutorialSpotlight();
      applyPendingTutorialAfterDialogueAction();
      showPendingTutorialPromptForLocalTurn();
      maybeStartCpuTurn();
      flushTutorialPresentation();
    });
    return;
  }
  if (spotlightShown) window.setTimeout(clearTutorialSpotlight, 1700);
  showPendingTutorialPromptForLocalTurn();
  finishTutorialIfReady();
  maybeStartCpuTurn();
}

function showPendingTutorialPromptForLocalTurn() {
  if (!pendingTutorialPrompt || dialogue.isOpen() || isCpu(state.currentPlayer)) return;
  setMessage(consumeTutorialPrompt("Your squad turn. Select a ready commander."));
}

function applyPendingTutorialSelection() {
  if (!pendingTutorialSelectUnitId) return;
  selectedId = pendingTutorialSelectUnitId;
  pendingTutorialSelectUnitId = null;
  mode = null;
  footworkPath = [];
  volleyShotOrigin = null;
  render();
}

function applyPendingTutorialBeforeDialogueAction() {
  const action = pendingTutorialBeforeDialogueAction;
  pendingTutorialBeforeDialogueAction = null;
  applyTutorialPresentationAction(action);
}

function applyPendingTutorialAfterDialogueAction() {
  const action = pendingTutorialAfterDialogueAction;
  pendingTutorialAfterDialogueAction = null;
  applyTutorialPresentationAction(action);
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
    for (const spawn of action.revealUnits ?? []) revealTutorialUnit(spawn.unitId, spawn.position, spawn.hp, spawn.mp);
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
function spawnTutorialUnit({ id, type, player, position, hp = null, mp = null, skin = null }) {
  if (findUnit(state, id)) return;
  const unit = createUnit({ id, type, player, x: position.x, y: position.y, skin });
  if (Number.isFinite(hp)) unit.hp = hp;
  if (Number.isFinite(mp)) unit.mp = mp;
  state.units.push(unit);
}

function finishTutorialIfReady() {
  if (!tutorial || !pendingTutorialComplete || dialogue.isOpen() || pendingTutorialDialogue) return false;
  pendingTutorialComplete = false;
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
  return true;
}

function tutorialCompleteTitle(tutorialId) {
  const entry = TUTORIAL_CATALOG.find((candidate) => candidate.id === tutorialId);
  return entry ? `${entry.title} Complete` : "Tutorial Complete";
}

function showTutorialSpotlight(kind) {
  clearTutorialSpotlight();
  if (kind === "hp" || kind === "mp") {
    document.body.classList.add(`tutorial-spotlight-${kind}`);
  }
  pendingTutorialSpotlight = null;
}

function clearTutorialSpotlight() {
  document.body.classList.remove("tutorial-spotlight-hp", "tutorial-spotlight-mp");
}

function revealTutorialUnit(unitId, position = null, hp = null, mp = null) {
  const unit = findUnit(state, unitId);
  if (!unit) return;
  const definition = getUnitType(unit.type);
  if (position) unit.position = { ...position };
  unit.hp = Number.isFinite(hp) ? hp : definition.stats.maxHp;
  unit.mp = Number.isFinite(mp) ? mp : getInitialMp(definition);
  unit.spent = false;
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
  if (tempo) tempoAnimating = Math.max(0, tempoAnimating - 1);
  else state = result.nextState;
  recordTutorialProgress(prepared, result, prevPlayer);
  recordCampaignProgressHooks(prepared, result);
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
  const prevPlayer = state.currentPlayer;
  const { prepared, result } = resolveCommand(command);
  if (!result.accepted) { setMessage(commandErrorMessage(result), true); return false; }
  const events = result.events ?? [];
  const rolled = events.find((e) => (e.type === "ATTACK_RESOLVED" || e.type === "ART_RESOLVED") && "hit" in e && e.rolled !== false);

  // Capture every pre-command snapshot BEFORE beginResolve commits (in tempo `state` becomes
  // the post-command board the instant beginResolve runs). `before` pins the deeper animation
  // lookups (surge/clumsy/Hand of Life) to the pre-command board; in classic it === state.
  const metrics = createBoardMetrics(state.size);
  const before = state;
  const attackerBefore = rolled ? findUnit(state, rolled.actorId) : null;
  const rolledTargetsBefore = rolled ? orderedHitTargets(rolled, (id) => findUnit(state, id)) : [];
  const targetBefore = rolledTargetsBefore[0] ?? (rolled ? findUnit(state, rolled.targetId) : null);

  beginResolve(result, events.find((e) => e.type === "ART_RESOLVED" && e.artId));

  if (rolled?.artId === "surge" && attackerBefore && targetBefore) {
    const center = unitCenter(metrics, targetBefore);
    const healedTargetsBefore = healingPresentationTargets(rolled, (id) => findUnit(before, id));
    const splashTargetsBefore = clumsySplashTargets(rolled, (id) => findUnit(before, id), "healing");
    const vfxTargets = [...new Map([...healedTargetsBefore, ...splashTargetsBefore].map((unit) => [unit.id, unit])).values()];

    await revealRoll({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) }, null, attackerBefore);
    if (rolled.missed) await effects.floatText(center, "MISS", "#cbb78b");

    if (!rolled.missed || splashTargetsBefore.length) {
      await effects.playAbilityVfx("surge", {
        actor: attackerBefore,
        targets: vfxTargets.length ? vfxTargets : [targetBefore]
      });
    }

    const floats = [];
    if (splashTargetsBefore.length) floats.push(effects.floatText(center, "CLUMSY", "#d8c2f5"));
    for (const target of healedTargetsBefore) {
      const healed = rolled.healingByTarget?.[target.id] ?? 0;
      if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4"));
    }
    for (const target of splashTargetsBefore) {
      const healed = rolled.splashHealingByTarget?.[target.id] ?? 0;
      if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4"));
    }
    await Promise.all(floats);
  } else if (rolled && attackerBefore && targetBefore) {
    // A ranged ART fires a projectile even from a melee-range unit (Clod's Stone Throw is
    // range 4), so read the ART's own reach when one is being cast.
    const artRange = rolled.artId ? artDefinition(attackerBefore, rolled.artId)?.targeting?.range : null;
    const ranged = shouldUseRangedAttackAnimation(attackerBefore, targetBefore, { artRange });
    const center = unitCenter(metrics, targetBefore);

    await effects.animateAttack(attackerBefore, targetBefore, ranged, rolled.artId ?? null);
    await revealRoll({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) }, null, attackerBefore);
    playAttackImpactSound(rolled, ranged);

    if (rolled.missed) {
      await effects.floatText(center, "MISS", "#cbb78b");
    } else {
      const dmg = Math.max(0, typeof rolled.damage === "number" ? rolled.damage : (rolled.damage?.damage ?? 0));
      const impactKind = (rolled.artId
        ? artDefinition(attackerBefore, rolled.artId)?.damageType === "magic"
        : getBasicAttackDamageType(attackerBefore) === "magic") ? "magic" : "physical";
      if (rolled.critical) { effects.critFlash(); effects.shake(11); }
      else effects.shake(Math.min(8, 2.5 + dmg * 1.4));
      effects.impact(center, Boolean(rolled.critical), impactKind);
      await effects.hitRecoil(targetBefore.id, targetBefore.position, Boolean(rolled.critical));
      await effects.floatText(center, dmg > 0 ? (rolled.critical ? `✦ ${dmg}` : `-${dmg}`) : "0", rolled.critical ? "#ffd26a" : "#ff7684");
      for (const hitTarget of rolledTargetsBefore) {
        if (hitTarget.id === targetBefore.id) continue;
        const hitCenter = unitCenter(metrics, hitTarget);
        const hitDamage = Math.max(0, rolled.damageByTarget?.[hitTarget.id] ?? dmg);
        effects.impact(hitCenter, Boolean(rolled.critical), impactKind);
        await effects.hitRecoil(hitTarget.id, hitTarget.position, Boolean(rolled.critical));
        await effects.floatText(hitCenter, hitDamage > 0 ? (rolled.critical ? `âœ¦ ${hitDamage}` : `-${hitDamage}`) : "0", rolled.critical ? "#ffd26a" : "#ff7684");
      }
      if (rolled.artId) {
        const art = artDefinition(attackerBefore, rolled.artId);
        if (art?.effect?.type === "status" && rolled.effect?.attempted) {
          const statusName = (art.effect.status ?? "status").toUpperCase();
          await revealRoll(
            { missed: !rolled.effect.applied, critical: false },
            rolled.effect.applied ? statusName : "RESISTED",
            attackerBefore
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
          await revealRoll(
            { missed: !rolled.effect.applied, critical: false },
            rolled.effect.applied ? "HEALED" : "NO HEAL",
            attackerBefore
          );
          if (rolled.effect.applied) {
            await effects.playAbilityVfx(rolled.artId, { actor: attackerBefore, target: targetBefore, effect: rolled.effect });
            if (rolled.effect.healing > 0) await effects.floatText(unitCenter(metrics, attackerBefore), `+${rolled.effect.healing}`, "#8cf0a4");
          }
        }
      }
      // Stone Throw (Clod): a guaranteed slow / crit-stun with no separate roll — float it
      // directly on a surviving target (the reducer already applied it).
      if (rolled.appliedStatus) {
        await effects.floatText(center, rolled.appliedStatus.toUpperCase(), rolled.appliedStatus === "stun" ? "#ffe45e" : "#70b7ff");
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

  const clumsyDamageTargetsBefore = rolled ? clumsySplashTargets(rolled, (id) => findUnit(before, id), "damage") : [];
  if (rolled?.splashDamageByTarget && attackerBefore && targetBefore && clumsyDamageTargetsBefore.length) {
    const center = unitCenter(metrics, targetBefore);
    await effects.floatText(center, "CLUMSY", "#d8c2f5");
    await Promise.all(clumsyDamageTargetsBefore.map(async (target) => {
      const damage = rolled.splashDamageByTarget?.[target.id] ?? 0;
      if (damage <= 0) return;
      const splashCenter = unitCenter(metrics, target);
      effects.impact(splashCenter, false, "magic");
      await effects.hitRecoil(target.id, target.position, false);
      await effects.floatText(splashCenter, `-${damage}`, "#c89cff");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  }

  const handOfLifeEvent = events.find((e) => e.type === "HAND_OF_LIFE");
  if (handOfLifeEvent) {
    const paladinBefore = findUnit(before, handOfLifeEvent.actorId);
    const healedUnitsBefore = Object.keys(handOfLifeEvent.healingByTarget)
      .map((id) => findUnit(before, id))
      .filter(Boolean);
    if (paladinBefore && healedUnitsBefore.length) {
      await effects.playAbilityVfx("hand-of-life", { actor: paladinBefore, targets: healedUnitsBefore });
      await Promise.all(healedUnitsBefore.map((unit) => {
        const healed = handOfLifeEvent.healingByTarget[unit.id] ?? 0;
        const restored = handOfLifeEvent.restoredByTarget?.[unit.id] ?? 0;
        const floats = [];
        if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, unit), `+${healed}`, "#f7e27d"));
        if (restored > 0) floats.push(effects.floatText(unitCenter(metrics, unit), `+${restored} MP`, "#8cc8ff"));
        return Promise.all(floats);
      }));
    }
  }

  // Growth (Virus): restores the caster MP whenever a cast poisons an enemy — under
  // Polarity Shift the same call restores HP instead, so read whichever side landed.
  const growthEvent = events.find((e) => e.type === "GROWTH_MP");
  if (growthEvent) {
    const unit = findUnit(before, growthEvent.unitId);
    if (unit) {
      const center = unitCenter(metrics, unit);
      if (growthEvent.mpGained > 0) effects.floatText(center, `+${growthEvent.mpGained} MP`, "#8cc8ff");
      else if (growthEvent.hpRestored > 0) effects.floatText(center, `+${growthEvent.hpRestored}`, "#8cf0a4");
    }
  }

  // Rock Hard (Clod): a landed physical strike against a defending Clod refunds MP
  // (or HP under Polarity Shift) in addition to negating the damage.
  const rockHardEvent = events.find((e) => e.type === "ROCK_HARD_MP");
  if (rockHardEvent) {
    const unit = findUnit(before, rockHardEvent.unitId);
    if (unit) {
      const center = unitCenter(metrics, unit);
      if (rockHardEvent.mpGained > 0) effects.floatText(center, `+${rockHardEvent.mpGained} MP`, "#8cc8ff");
      else if (rockHardEvent.hpRestored > 0) effects.floatText(center, `+${rockHardEvent.hpRestored}`, "#8cf0a4");
    }
  }

  // Study (Fat Wizard): magic damage to the studied target leeches HP/MP back to her.
  const studyLeechEvent = events.find((e) => e.type === "STUDY_LEECH");
  if (studyLeechEvent) {
    const unit = findUnit(before, studyLeechEvent.actorId);
    if (unit) {
      const center = unitCenter(metrics, unit);
      if (studyLeechEvent.hpRestored > 0) effects.floatText(center, `+${studyLeechEvent.hpRestored}`, "#8cf0a4");
      if (studyLeechEvent.mpRestored > 0) effects.floatText(center, `+${studyLeechEvent.mpRestored} MP`, "#8cc8ff");
    }
  }

  // Spirit Stance (Witch Doctor): a basic attack restores MP to nearby allies (or HP
  // under Polarity Shift).
  const stanceMpEvent = events.find((e) => e.type === "STANCE_MP_RESTORED");
  if (stanceMpEvent) {
    for (const [id, amount] of Object.entries(stanceMpEvent.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(before, id);
      if (unit) effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#8cc8ff");
    }
    for (const [id, amount] of Object.entries(stanceMpEvent.healedByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(before, id);
      if (unit) effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4");
    }
  }

  // Flamespitter (Little Brother RAGE): a basic attack triggers a free Flamethrower
  // cone. The reducer already applied the damage; without this the free cast is
  // silent — no VFX, no float, no visible sign it happened.
  const flamespitterEvent = events.find((e) => e.type === "FLAMESPITTER");
  if (flamespitterEvent) {
    const casterBefore = findUnit(before, flamespitterEvent.actorId);
    const art = casterBefore ? artDefinition(casterBefore, flamespitterEvent.artId) : null;
    const hitTargetsBefore = (flamespitterEvent.targetIds ?? []).map((id) => findUnit(before, id)).filter(Boolean);
    if (casterBefore && art) {
      const coneCells = getConeCells(before, casterBefore, flamespitterEvent.targetPosition, art) ?? [];
      await effects.playAbilityVfx(art.id, {
        actor: casterBefore,
        targets: hitTargetsBefore,
        targetPosition: flamespitterEvent.targetPosition,
        coneCells
      });
      await Promise.all(hitTargetsBefore.map(async (target) => {
        const center = unitCenter(metrics, target);
        await effects.hitRecoil(target.id, target.position, false);
        const dmg = flamespitterEvent.damageByTarget?.[target.id] ?? 0;
        await effects.floatText(center, `-${dmg}`, "#ff7684");
        const after = findUnit(result.nextState, target.id);
        if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
      }));
    }
  }

  // Splash Fire (Little Brother passive): a crit basic attack splashes true damage
  // onto enemies near the original target. The reducer already applied the damage;
  // without this the splash was silent — no float, no visible sign it happened.
  const splashFireEvent = events.find((e) => e.type === "SPLASH_FIRE");
  if (splashFireEvent) {
    const splashTargetsBefore = (splashFireEvent.targetIds ?? []).map((id) => findUnit(before, id)).filter(Boolean);
    await Promise.all(splashTargetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      effects.impact(center, false, "true");
      await effects.hitRecoil(target.id, target.position, false);
      const dmg = splashFireEvent.damageByTarget?.[target.id] ?? 0;
      await effects.floatText(center, `-${dmg}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  }

  return endResolve(prepared, result, prevPlayer);
}

// A wall is attacked like a unit (it can't dodge, so there's no roll), but it gets
// the SAME attacker lunge/projectile animation as a normal strike instead of just
// popping. Impact lands on the wall; a destroyed wall bursts into stone shards.
async function resolveWallAttack(command) {
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
    await effects.animateAttack(attackerBefore, { id: `wall:${positionKey(event.position)}`, position: event.position }, ranged);
    audio.play(ranged ? "arrowHit" : "attackHit");
    effects.impact(center, false);
    effects.shake(5);
    if (event.destroyed) {
      audio.play("wallBreak");
      effects.deathBurst(center, "#9a9384");
      const oreFloat = wallOreGainFloat(event);
      if (oreFloat) await effects.floatText(unitCenter(metrics, attackerBefore), oreFloat.text, oreFloat.color);
      setMessage("Wall destroyed.");
    } else {
      setMessage(`Wall struck — ${event.hpAfter} HP left.`);
    }
  }

  return endResolve(prepared, result, prevPlayer);
}

// The float label each King command shows over every buffed ally: the stat it reads off
// the live command fold, plus its color. Higher Ground's ally reach rides the attackRange
// buff (matching getCommandRangeBonus), so it reads from the same stat as the others.
const COMMAND_FLOAT = Object.freeze({
  strike: { stat: "strength", suffix: "STR", color: "#ff9a6b" },
  hold: { stat: "defense", suffix: "DEF", color: "#8cc0f0" },
  pursue: { stat: "moveRange", suffix: "MOVE", color: "#8fe08a" },
  "higher-ground": { stat: "attackRange", suffix: "RANGE", color: "#f2d472" }
});

const WEATHER_FLOAT = Object.freeze({
  blizzard: { label: "-1 MOVE", color: "#70b7ff" },
  "spring-shower": { label: "SPRING", color: "#8cf0a4" },
  heatwave: { label: "+1 STR", color: "#ff9a4c" },
  thunderstorm: { label: "+1 MAGIC", color: "#b08cff" }
});

async function resolveInstantArt(command) {
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

  if ((resolved?.artId === "footwork" || resolved?.artId === "stumble" || resolved?.artId === "dark-rush") && actorBefore) {
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
      const amount = resolved.damageByTarget?.[target.id] ?? 2;
      await effects.floatText(center, `-${amount}`, "#ff7684");
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
  } else if (resolved?.artId && artDefinition(actorBefore, resolved.artId)?.targeting?.shape === "cone" && actorBefore) {
    // Any other cone-shaped ART cast manually through the ART button (e.g. Flamethrower),
    // generalized from the Volley Shot branch above — reads its own per-target damage
    // instead of a hardcoded amount.
    const metrics = createBoardMetrics(state.size);
    const coneCells = getConeCells(state, actorBefore, resolved.targetPosition, artDefinition(actorBefore, resolved.artId)) ?? [];
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: targetsBefore,
      targetPosition: resolved.targetPosition,
      coneCells
    });
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      await effects.hitRecoil(target.id, target.position, false);
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      await effects.floatText(center, `-${dmg}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if ((resolved?.artId === "flee" || resolved?.artId === "dematerialize") && actorBefore) {
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: [],
      path: resolved.path ?? [actorBefore.position]
    });
  } else if ((resolved?.artId === "summon-ghoul" || resolved?.artId === "summon" || resolved?.artId === "beckon") && actorBefore) {
    const summoned = findUnit(result.nextState, resolved.summonedUnitId);
    if (summoned) {
      await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: [summoned] });
      if (resolved.ghostTurn) await effects.floatText(unitCenter(createBoardMetrics(state.size), summoned), "GHOST", "#cbb8ff");
    }
  } else if ((resolved?.artId === "build-cover" || resolved?.artId === "shaft-prop") && resolved.position) {
    const point = unitCenter(createBoardMetrics(state.size), { position: resolved.position });
    audio.play("buildCover");
    effects.impact(point, false);
    effects.shake(4);
  } else if ((resolved?.artId === "ore-harvest" || resolved?.artId === "ore-abundance") && actorBefore) {
    await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: [actorBefore] });
    await effects.floatText(unitCenter(createBoardMetrics(state.size), actorBefore), `+${resolved.oreGained} ORE`, "#d8b35e");
  } else if (resolved?.artId === "throw-cigar" && resolved.position && actorBefore) {
    // The cigar visibly tumbles from the Sniper to the tile before the fire takes
    // (the lob recipe plays the throwCigar sound and lands its own impact).
    await effects.playAbilityVfx("throw-cigar", { actor: actorBefore, targetPosition: resolved.position });
  } else if (resolved?.artId === "study" && actorBefore) {
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("study", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "STUDIED", "#f2d98a");
    }
  } else if (resolved?.artId === "relay-power" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("relay-power", { actor: actorBefore, targets: targetsBefore });
    const actorCenter = unitCenter(metrics, actorBefore);
    const floats = [];
    if ((resolved.hpPaid ?? 0) > 0) floats.push(effects.floatText({ ...actorCenter, y: actorCenter.y - 10 }, `-${resolved.hpPaid}`, "#ff7684"));
    if ((resolved.mpPaid ?? 0) > 0) floats.push(effects.floatText({ ...actorCenter, y: actorCenter.y + 10 }, `-${resolved.mpPaid} MP`, "#8cc8ff"));
    if (targetBefore) {
      const targetCenter = unitCenter(metrics, targetBefore);
      const healed = resolved.healingByTarget?.[targetBefore.id] ?? 0;
      const restored = resolved.restoredByTarget?.[targetBefore.id] ?? 0;
      if (healed > 0) floats.push(effects.floatText({ ...targetCenter, y: targetCenter.y - 10 }, `+${healed}`, "#8cf0a4"));
      if (restored > 0) floats.push(effects.floatText({ ...targetCenter, y: targetCenter.y + 10 }, `+${restored} MP`, "#8cc8ff"));
    }
    await Promise.all(floats);
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
  } else if (resolved?.command !== undefined && actorBefore) {
    // A King command (Strike / Hold / Pursue / Higher Ground): a global one-turn team
    // order. The banner ritual washes over every living squadmate, then each ally floats
    // the exact buff it just gained — read from getCommandBuffStats on the COMMITTED state
    // (where the King's command is now recorded), so the number already folds in the
    // +1-per-raging-ally scaling and Strike's Pursue bonus, just like the Witch Doctor's
    // dance floats above.
    const metrics = createBoardMetrics(state.size);
    const allies = result.nextState.units.filter(
      (u) => u.hp > 0 && u.player === actorBefore.player && u.id !== actorBefore.id && !getUnitType(u.type).commandOnly
    );
    await effects.playAbilityVfx(resolved.artId, { actor: actorBefore, targets: allies });
    const label = COMMAND_FLOAT[resolved.command];
    if (label) {
      await Promise.all(allies.map((ally) => {
        const amount = getCommandBuffStats(ally, result.nextState)[label.stat] ?? 0;
        return amount > 0
          ? effects.floatText(unitCenter(metrics, ally), `+${amount} ${label.suffix}`, label.color)
          : Promise.resolve();
      }));
    }
  } else if (resolved?.artId === "tether-grab" && actorBefore) {
    // Fire the tether, then — on a landed grab — haul the unit to the Juggernaut's side and
    // land the magic hit if it was an enemy. `state` is still pre-commit, so the target
    // reads at its old tile; a missed enemy grab hauls no one, so float MISS in place.
    const metrics = createBoardMetrics(state.size);
    const target = findUnit(state, resolved.targetId);
    await effects.playAbilityVfx("tether-grab", { actor: actorBefore, targets: target ? [target] : [] });
    // An enemy grab rolls to-hit like any strike — reveal the die before hauling/damaging.
    // An ally grab (rolled === false) is pure repositioning and always lands, so no reveal.
    if (resolved.rolled) await revealRoll({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) }, null, actorBefore);
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
    await revealRoll({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) }, null, actorBefore);
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
    const recipient = findUnit(result.nextState, resolved.recipientId) ?? actorBefore;
    if (resolved.mpRestored > 0) await effects.floatText(unitCenter(metrics, recipient), `+${resolved.mpRestored} MP`, "#7fd0ff");
    else if (resolved.hpHealed > 0) await effects.floatText(unitCenter(metrics, recipient), `+${resolved.hpHealed}`, "#8cf0a4");
  } else if (resolved?.artId === "polarity-shift" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("polarity-shift", { actor: actorBefore, targets: [actorBefore] });
    const label = resolved.restorePolarityShift ? "POLARITY SHIFTED" : "POLARITY RESTORED";
    await effects.floatText(unitCenter(metrics, actorBefore), label, "#b08cff");
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
  } else if (resolved?.artId === "heavenseeker" && actorBefore) {
    // A holy pulse: true damage to enemies on white tiles AND a heal to allies on them.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("heavenseeker", { actor: actorBefore, targets: targetsBefore });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#fff2a8");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    await Promise.all(Object.entries(resolved.healingByTarget ?? {}).map(([id, amount]) => {
      const ally = findUnit(state, id);
      return ally && amount > 0
        ? effects.floatText(unitCenter(metrics, ally), `+${amount}`, "#8cf0a4")
        : Promise.resolve();
    }));
  } else if (resolved?.artId === "anoint" && actorBefore) {
    // A holy mote glides to the ally; the +1 range float lands where it lights.
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("anoint", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.effect?.applied) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "+1 RNG", "#f7e9c0");
    }
  } else if (resolved?.artId === "purify" && actorBefore) {
    // A clean green-white mote lifts the status stack off the ally.
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("purify", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.cleansed?.includes(targetBefore.id)) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "PURIFIED", "#dfffd8");
    }
  } else if (resolved?.artId === "cleanse" && actorBefore) {
    // A gold-white mote lifts the negative statuses off the ally (buffs stay).
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("cleanse", { actor: actorBefore, targets: targetsBefore });
    if (targetBefore && resolved.cleansed?.includes(targetBefore.id)) {
      await effects.floatText(unitCenter(createBoardMetrics(state.size), targetBefore), "CLEANSED", "#fff2c0");
    }
  } else if (resolved?.artId === "flight" && actorBefore) {
    // The Gargoyle surges to the landing tile (dash trail), then a TRUE blast pops on
    // every enemy within a tile of it. `state` is pre-commit, so victims read at their
    // current tiles; the token relocates when the board re-renders after commit.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("flight", { actor: actorBefore, targets: [], path: resolved.path ?? [actorBefore.position] });
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
  } else if (resolved?.artId === "smog" && actorBefore) {
    // A blind cloud rolls out from Virus; every caught enemy floats BLIND (no roll).
    const metrics = createBoardMetrics(state.size);
    const clouded = (resolved.statusTargets ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    await effects.playAbilityVfx("smog", { actor: actorBefore, targets: clouded });
    await Promise.all(clouded.map((target) => effects.floatText(unitCenter(metrics, target), "BLIND", "#f0d77a")));
  } else if (resolved?.artId === "poison-tick" && actorBefore) {
    // Every poisoned enemy convulses for true damage (ignores DEF/Defend).
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("poison-tick", { actor: actorBefore, targets: targetsBefore });
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#9be86b");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "explosion" && actorBefore) {
    // The rage ultimate detonates every poisoned enemy, then consumes Virus itself.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("explosion", { actor: actorBefore, targets: targetsBefore });
    effects.shake(10);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#9be86b");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    await effects.deathDissolve(actorBefore.id, actorBefore.position, teamColor(actorBefore.player));
  } else if (resolved?.artId === "dark-tick" && actorBefore) {
    // Every blinded enemy convulses for true damage (ignores DEF/Defend), anywhere.
    const metrics = createBoardMetrics(state.size);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "true");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#c8a2ff");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "banish-dark" && actorBefore) {
    // The RAGE ultimate: every enemy on a dark tile is destroyed, then Blacksword falls.
    const metrics = createBoardMetrics(state.size);
    effects.shake(12);
    await Promise.all(targetsBefore.map(async (target) => {
      const center = unitCenter(metrics, target);
      effects.impact(center, true, "true");
      await effects.hitRecoil(target.id, target.position, true);
      await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    await effects.deathDissolve(actorBefore.id, actorBefore.position, teamColor(actorBefore.player));
  } else if (resolved?.artId === "dark-ether" && actorBefore) {
    // A self crit-charge: no target, just a dark shimmer + a readiness float on Blacksword.
    const metrics = createBoardMetrics(state.size);
    const center = unitCenter(metrics, actorBefore);
    effects.impact(center, false, "magic");
    await effects.floatText(center, "CRIT READY", "#c8a2ff");
  } else if (resolved?.artId === "quake" && actorBefore) {
    // A self-centred ground slam: earthen magic ripples out and shakes everyone caught.
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("quake", { actor: actorBefore, targets: targetsBefore });
    effects.shake(9);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "magic");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText(center, `-${dmg}`, "#c8b06a");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
    if (resolved.refunded) await effects.floatText(unitCenter(metrics, actorBefore), "MP REFUND", "#8cc8ff");
  } else if (resolved?.artId === "dark-pulse" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("dark-pulse", {
      actor: actorBefore,
      targets: targetsBefore,
      rays: resolved.pulseRays ?? []
    });
    const feedback = [];
    for (const target of targetsBefore) {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const healed = resolved.healingByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        feedback.push((async () => {
          await effects.hitRecoil(target.id, target.position, false);
          await effects.floatText(center, `-${dmg}`, "#c89cff");
          const after = findUnit(result.nextState, target.id);
          if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
        })());
      } else if (healed > 0) {
        feedback.push(effects.floatText(center, `+${healed}`, "#8cf0a4"));
      }
    }
    await Promise.all(feedback);
    if (resolved.refunded) await effects.floatText(unitCenter(metrics, actorBefore), "MP REFUND", "#8cc8ff");
  } else if (resolved?.artId === "thunderous-charge" && actorBefore) {
    // The RAGE ultimate: Clod CHARGES to the chosen tile, then quakes a 2-tile radius —
    // physical damage + a mass stun, launching everyone caught up into a brief pop.
    const metrics = createBoardMetrics(state.size);
    const from = resolved.from ?? actorBefore.position;
    const dest = resolved.center ?? actorBefore.position;
    // Move the live token to the landing tile and slide it in, so the charge reads as a
    // charge (mutating the about-to-be-replaced input state is safe — result.nextState,
    // a clone, already stands Clod on `dest` and overwrites it right after this branch).
    if (from.x !== dest.x || from.y !== dest.y) {
      const live = findUnit(state, actorBefore.id);
      if (live) { live.position = { ...dest }; render(); }
      await effects.animateMovement(actorBefore.id, from, dest);
    }
    await effects.playAbilityVfx("thunderous-charge", { actor: { ...actorBefore, position: dest }, targets: targetsBefore, targetPosition: dest });
    effects.shake(13);
    effects.impact(unitCenter(metrics, { position: dest }), true, "physical");
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) effects.impact(center, false, "physical");
      // Launch the target up and let it drop right back down.
      const bounce = effects.knockUp(target.id, target.position);
      if (dmg > 0) await effects.floatText(center, `-${dmg}`, "#ff7684");
      await bounce;
      if ((resolved.stunnedIds ?? []).includes(target.id)) await effects.floatText(center, "STUN", "#ffe45e");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.artId === "focus-prayer" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await revealRoll({ missed: Boolean(resolved.missed), critical: Boolean(resolved.critical) }, null, actorBefore);
    if (!resolved.missed) {
      await effects.playAbilityVfx("focus-prayer", { actor: actorBefore, targets: targetsBefore });
      const healed = resolved.healingByTarget?.[targetBefore?.id] ?? 0;
      if (targetBefore && healed > 0) {
        await effects.floatText(unitCenter(metrics, targetBefore), `+${healed}`, "#8cf0a4");
      }
    } else if (targetBefore && resolved.effect?.attempted) {
      const statusLabel = resolved.effect.status?.toUpperCase() ?? "STATUS";
      await revealRoll(
        { missed: !resolved.effect.applied, critical: false },
        resolved.effect.applied ? statusLabel : "RESISTED",
        actorBefore
      );
      if (resolved.effect.applied) {
        await effects.playAbilityVfx(resolved.artId, {
          actor: actorBefore,
          target: targetBefore,
          effect: resolved.effect
        });
        await effects.floatText(unitCenter(metrics, targetBefore), statusLabel, "#c89cff");
      }
    }
  } else if (resolved?.artId === "blasting-cap" && resolved.destroyedWall && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const center = unitCenter(metrics, { position: resolved.position });
    await effects.animateAttack(actorBefore, { id: `wall:${positionKey(resolved.position)}`, position: resolved.position }, true, "blasting-cap");
    audio.play("wallBreak");
    effects.impact(center, false, "true");
    effects.deathBurst(center, "#9a9384");
    effects.shake(8);
    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      if (dmg <= 0) return;
      const targetCenter = unitCenter(metrics, target);
      effects.impact(targetCenter, false, "true");
      await effects.hitRecoil(target.id, target.position, false);
      await effects.floatText(targetCenter, `-${dmg}`, "#ff7684");
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));
  } else if (resolved?.weather && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const beaconTargets = (resolved.beaconTargetIds ?? resolved.targetIds ?? resolved.statusTargets ?? [])
      .map((id) => findUnit(state, id))
      .filter(Boolean);
    await effects.playAbilityVfx(resolved.artId, {
      actor: actorBefore,
      targets: beaconTargets
    });

    const floats = [];
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4"));
    }
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#7fd0ff"));
    }
    const weatherFloat = WEATHER_FLOAT[resolved.artId];
    const statusLabel = resolved.buffLabel ?? weatherFloat?.label;
    if (statusLabel) {
      for (const id of resolved.statusTargets ?? []) {
        const unit = findUnit(state, id);
        if (unit) floats.push(effects.floatText(unitCenter(metrics, unit), statusLabel, weatherFloat?.color ?? "#f7e9c0"));
      }
    }
    if (!floats.length && weatherFloat) {
      floats.push(effects.floatText(unitCenter(metrics, actorBefore), weatherFloat.label, weatherFloat.color));
    }
    await Promise.all(floats);
  } else if (resolved?.artId === "landscaper" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    const targetBefore = targetsBefore[0];
    await effects.playAbilityVfx("landscaper", {
      actor: actorBefore,
      targets: targetBefore ? [targetBefore] : [],
      targetPosition: resolved.from
    });
    if (targetBefore && resolved.pushed) {
      await effects.animateMovement(targetBefore.id, resolved.from, resolved.to);
      const wallCenter = unitCenter(metrics, { position: resolved.from });
      effects.impact(wallCenter, false, "physical");
      effects.deathBurst(wallCenter, "#8f7a52");
      await effects.floatText(wallCenter, "WALL", "#c8b06a");
    } else if (targetBefore) {
      const dmg = resolved.damageByTarget?.[targetBefore.id] ?? resolved.damage?.damage ?? 0;
      const center = unitCenter(metrics, targetBefore);
      if (dmg > 0) {
        effects.impact(center, false, "physical");
        effects.shake(7);
        await effects.hitRecoil(targetBefore.id, targetBefore.position, false);
        await effects.floatText(center, `-${dmg}`, "#ff7684");
      }
      const after = findUnit(result.nextState, targetBefore.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(targetBefore.id, targetBefore.position, teamColor(targetBefore.player));
    }
  } else if (resolved?.artId === "great-flood" && actorBefore) {
    const metrics = createBoardMetrics(state.size);
    await effects.playAbilityVfx("great-flood", { actor: actorBefore, targets: targetsBefore });
    effects.shake(12);

    await Promise.all(targetsBefore.map(async (target) => {
      const dmg = resolved.damageByTarget?.[target.id] ?? 0;
      const center = unitCenter(metrics, target);
      if (dmg > 0) {
        effects.impact(center, false, "magic");
        await effects.hitRecoil(target.id, target.position, false);
        await effects.floatText({ ...center, y: center.y - 8 }, `-${dmg}`, "#6fb7f2");
      }
      const after = findUnit(result.nextState, target.id);
      if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }));

    const restoreFloats = [];
    for (const [id, amount] of Object.entries(resolved.healingByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) restoreFloats.push(effects.floatText({ ...unitCenter(metrics, unit), y: unitCenter(metrics, unit).y + 10 }, `+${amount}`, "#8cf0a4"));
    }
    for (const [id, amount] of Object.entries(resolved.restoredByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      if (unit) restoreFloats.push(effects.floatText({ ...unitCenter(metrics, unit), y: unitCenter(metrics, unit).y + 10 }, `+${amount} MP`, "#7fd0ff"));
    }
    await Promise.all(restoreFloats);

    await Promise.all(Object.entries(resolved.afterPositions ?? {}).map(([id, to]) => {
      const from = resolved.beforePositions?.[id];
      const unit = findUnit(state, id);
      if (!unit || !from || positionKey(from) === positionKey(to)) return Promise.resolve();
      return effects.animateMovement(id, from, to);
    }));
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
      const restored = resolved.restoredByTarget?.[target.id] ?? 0;
      const floats = [];
      if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4"));
      if (restored > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${restored} MP`, "#7fd0ff"));
      return Promise.all(floats);
    }));
  } else if (resolved?.effect && actorBefore) {
    const targetBefore = targetsBefore[0];
    if (targetBefore && resolved.effect.attempted) {
      const statusLabel = resolved.effect.status?.toUpperCase() ?? "STATUS";
      await revealRoll(
        { missed: !resolved.effect.applied, critical: false },
        resolved.effect.applied ? statusLabel : "RESISTED",
        actorBefore
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
  recordTutorialProgress(prepared, result, prevPlayer);
  recordCampaignProgressHooks(prepared, result);
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
  if (isTempoBattle(state)) {
    maybeStartTempoCpuTurn();
    return;
  }
  if (cpuThinking || state.phase !== "playing" || !isCpu(state.currentPlayer)) return;
  maybeShowCampaignDialogue();
  if (dialogue.isOpen()) return;
  if (shouldDelayCpuForTutorialPresentation()) {
    window.clearTimeout(tutorialPresentationTimer);
    tutorialPresentationTimer = window.setTimeout(flushTutorialPresentation, 0);
    return;
  }
  cpuThinking = true;
  void runCpuTurn().finally(() => {
    cpuThinking = false;
    flushTutorialPresentation();
  });
}

function shouldDelayCpuForTutorialPresentation() {
  return Boolean(tutorial && (
    dialogue.isOpen() ||
    pendingTutorialDialogue ||
    pendingTutorialSpotlight ||
    pendingTutorialBeforeDialogueAction
  ));
}

// Real-time mode shares ONE activation slot between the player and the CPU, but the player
// always has priority and NEVER waits. There is no reaction delay — the CPU acts as soon as a
// unit of its is ready and the board is free. The instant the player clicks a ready unit,
// beginTempoUnit frees the slot synchronously (releaseTempoSlot) and, if the CPU held it,
// sets tempoCpuAbort so its loop stands down after the current animation. Because rolled
// actions commit their state up front, the player's command can never be clobbered.
function maybeStartTempoCpuTurn() {
  if (!isTempoBattle(state) || cpuThinking || resolving || tempoBusy || state.activation || state.phase !== "playing") return;
  if (dialogue.isOpen() || tempoAnimating > 0) return;
  const player = [...(cpu?.players ?? [])].find((p) =>
    state.units.some((unit) => unit.player === p && isTempoUnitReady(state, unit))
  );
  if (player == null) return;
  cpuThinking = true;
  tempoCpuAbort = false;
  void runTempoCpuActivation(player).finally(() => {
    cpuThinking = false;
    maybeStartTempoCpuTurn();
  });
}

async function runTempoCpuActivation(player) {
  const epoch = matchEpoch;
  tempoCpuActing = true;   // keeps this whole activation off the player's command HUD
  render();
  const planningState = { ...state, currentPlayer: player };
  const commands = chooseActivation(planningState, {
    difficulty: cpu?.difficulty ?? "normal",
    cpuPlayer: player,
    rng: cpuRng(planningState)
  });
  for (const command of commands) {
    if (epoch !== matchEpoch || state.phase !== "playing" || tempoCpuAbort) break;
    const applied = await applyCpuCommand(command);
    if (epoch !== matchEpoch || tempoCpuAbort) break;
    if (!applied || state.phase !== "playing") break;
  }
  tempoCpuActing = false;
  // resolveCpuMove keeps `resolving` set across the move (keepResolving) — clear it here so the
  // next CPU activation (guarded on `resolving`) and the real-time loop resume.
  resolving = false;
  // If the player preempted, they now hold the slot and their unit is selected — don't clobber
  // that. Otherwise clear the CPU's leftover board selection.
  if (!tempoCpuAbort) { selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null; }
  render();
}

async function runCpuTurn() {
  const epoch = matchEpoch;
  resolving = true;
  selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null;
  render();
  setMessage(`Player ${state.currentPlayer} (CPU) is planning…`);
  await sleep(CPU_TURN_LEAD_MS);
  if (dialogue.isOpen()) {
    resolving = false;
    render();
    return;
  }

  // The guard is belt-and-braces against a planning bug; chooseActivation always
  // returns at least a defend, so a living squad cannot truly stall.
  let guard = 0;
  while (epoch === matchEpoch && state.phase === "playing" && isCpu(state.currentPlayer) && !dialogue.isOpen() && guard < CPU_MAX_ACTIVATIONS) {
    guard += 1;
    const commands = tutorial
      ? chooseTutorialCpuActivation(state, tutorial)
      : chooseActivation(state, {
        difficulty: cpu.difficulty,
        cpuPlayer: state.currentPlayer,
        rng: cpuRng(state),
        excludeArtIds: campaignCpuExcludedArtIds()
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
    if (dialogue.isOpen()) break;
  }

  if (epoch !== matchEpoch) return;
  if (dialogue.isOpen()) {
    resolving = false;
    render();
    return;
  }
  resolving = false;
  if (state.phase === "complete") { render(); return; }
  selectedId = null; mode = null; footworkPath = []; volleyShotOrigin = null;
  render();
  if (pendingTutorialDialogue) {
    setMessage("Your squad turn. Select a ready commander.");
  } else {
    setMessage(consumeTutorialPrompt("Your squad turn. Select a ready commander."));
  }
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
      // setMessage/render are HUD-silent during a tempo CPU activation (see their guards);
      // this line only surfaces in the classic turn-based CPU turn.
      if (unit) setMessage(`Player ${unit.player} (CPU) activates its ${unit.nickname || getUnitType(unit.type).name}.`);
      render();
      // No artificial "thinking" beat in real-time tempo — it would just delay the board.
      await sleep(isTempoBattle(state) ? 0 : CPU_STEP_MS);
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
      const rolled = (peek.events ?? []).some((e) => e.type === "ART_RESOLVED" && "hit" in e && e.rolled !== false);
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
        if (unit) setMessage(`Opponent activates its ${unit.nickname || getUnitType(unit.type).name}.`);
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
        const rolled = (peek.events ?? []).some((e) => e.type === "ART_RESOLVED" && "hit" in e && e.rolled !== false);
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
  return getArt(unit.type, artId);
}

function artCalloutLabel(unit, artId) {
  if (unit?.fakeArtNames?.[artId]) return unit.fakeArtNames[artId];
  const art = unit ? artDefinition(unit, artId) : null;
  if (art?.name) return art.name;
  return String(artId ?? "ART").split("-").filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function playArtCallout(event) {
  if (!event?.actorId || !event?.artId) return;
  const actor = findUnit(state, event.actorId);
  if (actor) effects.artCallout(actor, artCalloutLabel(actor, event.artId));
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
      if (artId === "footwork" || artId === "dark-rush" || artId === "flee" || artId === "nuke" ||
          artId === "dematerialize" ||
          artId === "spark" || artId === "pray" || artId === "wish" ||
          artId === "lightseeker" || artId === "darkseeker" ||
          artId === "dark-bomb" || artId === "summon-ghoul" || artId === "summon" || artId === "beckon" ||
          artId === "smoke-bomb" || artId === "build-cover" || artId === "shaft-prop" || artId === "throw-cigar" ||
          artId === "age" || artId === "time-stretch" || artId === "rewind" ||
          artId === "tether-grab" || artId === "rocket-punch" || artId === "recharge" ||
          artId === "self-destruct" ||
          artId === "anoint" || artId === "purify" || artId === "elevate" || artId === "heavenseeker" ||
          artId === "hope" || artId === "cleanse" || artId === "focus-prayer" ||
          artId === "flight" || artId === "pyroclasm" ||
          artId === "ore-harvest" || artId === "ore-abundance" || artId === "headlamp" || artId === "blasting-cap" ||
          artId === "dark-pulse" || artId === "realm-traversal" ||
          artId === "quake" || artId === "thunderous-charge" ||
          artId === "blizzard" || artId === "spring-shower" || artId === "heatwave" ||
          artId === "landscaper" || artId === "thunderstorm" || artId === "great-flood" ||
          artId === "patient-blade" || artId === "broken-oath" || artId === "challenge" ||
          artId === "strike" || artId === "hold" || artId === "pursue" || artId === "higher-ground") continue;
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
  // Ghoul Bite (autoStrike): a Ghoul mauls one random adjacent enemy at the rollover.
  const bites = events.filter((e) => e.type === "AUTO_STRIKE");
  // The King's Dictator/Spectator passive fires after any command that fells or revives an
  // allied unit, so its reactive HP swings ride whatever command triggered them.
  const mourns = events.filter((e) => e.type === "KING_MOURNS");
  const rallies = events.filter((e) => e.type === "SQUAD_RALLY");
  const restores = events.filter((e) => e.type === "KING_RESTORED");
  const darkPulses = events.filter((e) => e.type === "DARK_PULSE_AUTO");
  // Gargoyle: a free Volcanic-Rage Pyroclasm (fired on rage entry / cadence) and Stone
  // Body's melee/displacement recoil both surface here as fire-and-forget floats.
  const erupts = events.filter((e) => e.type === "PYROCLASM_ERUPT");
  const retaliations = events.filter((e) => e.type === "STONE_RETALIATION");
  // Fat Cleric's Snack Break (defend top-up) and Emergency Snacks (per-turn RAGE regen)
  // both surface as fire-and-forget HP/MP floats over her.
  const snacks = events.filter((e) => e.type === "SNACK_BREAK" || e.type === "EMERGENCY_SNACK");
  // Miner's Diamond Harvester (rage entry) instantly refills ore — give it the same
  // "full harvest" presentation as a manually-cast Ore Abundance instead of a silent stat jump.
  const oreRageFills = events.filter((e) =>
    e.type === "RAGE_REGENERATE" && (e.mpRestored ?? 0) > 0 && findUnit(state, e.unitId)?.type === "miner");
  // Ronin's Wanderer crit self-heal and Final Draw attack recoil ride whatever attack fired them.
  const duelHeals = events.filter((e) => e.type === "DUELIST_HEAL");
  const recoils = events.filter((e) => e.type === "ATTACK_RECOIL");
  const critMpRestores = events.filter((e) => e.type === "CRIT_MP_RESTORE");
  const ghostDissipations = events.filter((e) => e.type === "GHOST_DISSIPATED");
  if (!burns.length && !steals.length && !mourns.length && !rallies.length && !restores.length &&
      !darkPulses.length && !erupts.length && !retaliations.length && !snacks.length && !bites.length &&
      !oreRageFills.length && !duelHeals.length && !recoils.length && !critMpRestores.length && !ghostDissipations.length) return;
  const metrics = createBoardMetrics(state.size);
  let killed = false;

  for (const ghost of ghostDissipations) {
    const unit = findUnit(state, ghost.unitId);
    const shell = unit ?? { id: ghost.unitId, player: state.currentPlayer, position: ghost.position };
    effects.floatText(unitCenter(metrics, shell), "DISSIPATE", "#cbb8ff");
    effects.deathDissolve(ghost.unitId, ghost.position, teamColor(shell.player));
  }

  // Free Pyroclasm eruption (Volcanic Rage): float the magic damage on every enemy the
  // rays caught, with a fiery impact. The state here is already post-eruption.
  if (erupts.length) audio.play("nuke");
  for (const erupt of erupts) {
    for (const [id, amount] of Object.entries(erupt.damageByTarget ?? {})) {
      if (amount <= 0) continue;
      const unit = findUnit(state, id);
      const center = unitCenter(metrics, unit ?? { position: { x: 0, y: 0 } });
      effects.impact(center, false, "fire");
      effects.floatText(center, `-${amount}`, "#ff9a3c");
      if (!unit || unit.hp <= 0) { effects.deathBurst(center, teamColor(unit?.player ?? 1)); killed = true; }
    }
  }

  for (const pulse of darkPulses) {
    const actor = findUnit(state, pulse.actorId);
    if (!actor) continue;
    const targets = (pulse.targetIds ?? []).map((id) => findUnit(state, id)).filter(Boolean);
    effects.playAbilityVfx("dark-pulse", { actor, targets, rays: pulse.pulseRays ?? [] }).then(() => {
      for (const target of targets) {
        const center = unitCenter(metrics, target);
        const damage = pulse.damageByTarget?.[target.id] ?? 0;
        const healing = pulse.healingByTarget?.[target.id] ?? 0;
        if (damage > 0) {
          effects.floatText(center, `-${damage}`, "#c89cff");
          if (target.hp <= 0) { effects.deathBurst(center, teamColor(target.player)); audio.play("unitDefeated"); }
        } else if (healing > 0) {
          effects.floatText(center, `+${healing}`, "#8cf0a4");
        }
      }
    }).catch(() => {});
  }

  // Stone Body recoil: a melee attacker / displacer takes true damage, floated over it.
  for (const bite of retaliations) {
    const offender = findUnit(state, bite.offenderId);
    const center = unitCenter(metrics, offender ?? { position: { x: 0, y: 0 } });
    effects.impact(center, false, "true");
    effects.floatText(center, `-${bite.damage}`, "#e8f4ff");
    if (!offender || offender.hp <= 0) { effects.deathBurst(center, teamColor(offender?.player ?? 1)); killed = true; }
  }

  // Wanderer crit self-heal: a green tick over Ronin.
  for (const heal of duelHeals) {
    const unit = findUnit(state, heal.unitId);
    if (!unit || !(heal.hpRestored > 0)) continue;
    effects.floatText(unitCenter(metrics, unit), `+${heal.hpRestored}`, "#8cf0a4");
  }
  // Final Draw recoil: Ronin takes his own damage — a red tick, and a death burst if it fells him.
  for (const recoil of recoils) {
    const unit = findUnit(state, recoil.unitId);
    const center = unitCenter(metrics, unit ?? { position: { x: 0, y: 0 } });
    effects.floatText(center, `-${recoil.damage}`, "#ff7684");
    if (!unit || unit.hp <= 0) { effects.deathBurst(center, teamColor(unit?.player ?? 1)); killed = true; }
  }

  // Weather Commander: Mother Nature's basic-attack crit restores MP, or HP if a global
  // polarity effect has flipped the restoration channel.
  for (const restore of critMpRestores) {
    const unit = findUnit(state, restore.unitId);
    if (!unit) continue;
    const center = unitCenter(metrics, unit);
    if (restore.mpGained > 0) effects.floatText(center, `+${restore.mpGained} MP`, "#7fd0ff");
    else if (restore.hpRestored > 0) effects.floatText(center, `+${restore.hpRestored}`, "#8cf0a4");
  }

  if (bites.length) audio.play("attackHit");
  for (const bite of bites) {
    const center = unitCenter(metrics, { position: bite.position });
    effects.impact(center, false, "true");
    effects.floatText(center, `-${bite.damage}`, "#e8f4ff");
    const after = findUnit(state, bite.targetId);
    if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
  }

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
      if (!src) continue;
      const center = unitCenter(metrics, src);
      if (mp.mpGained > 0) effects.floatText(center, `+${mp.mpGained} MP`, "#7fd0ff");
      else if (mp.hpRestored > 0) effects.floatText(center, `+${mp.hpRestored}`, "#8cf0a4");
    }
  }

  // King reactions: he bleeds when a squadmate falls (and can be finished off by the
  // grief), the surviving squad rallies at each fall, and he mends when a fallen ally is
  // brought back. Float each swing where it lands — fire-and-forget like the ticks above.
  for (const mourn of mourns) {
    const king = findUnit(state, mourn.kingId);
    if (!king) continue;
    const center = unitCenter(metrics, king);
    effects.floatText(center, `-${mourn.damage}`, "#ff7684");
    if (king.hp <= 0) { effects.deathBurst(center, teamColor(king.player)); killed = true; }
  }
  for (const rally of rallies) {
    for (const id of rally.rallied ?? []) {
      const unit = findUnit(state, id);
      if (unit) effects.floatText(unitCenter(metrics, unit), `+${rally.healing}`, "#8cf0a4");
    }
  }
  for (const restore of restores) {
    const king = findUnit(state, restore.kingId);
    if (king) effects.floatText(unitCenter(metrics, king), `+${restore.healing}`, "#8cf0a4");
  }

  // Fat Cleric snacks: a small +HP / +MP top-up (Snack Break on defend, Emergency Snacks
  // at the start of a raging turn). Fire-and-forget floats over her.
  for (const snack of snacks) {
    const unit = findUnit(state, snack.unitId);
    if (!unit) continue;
    const center = unitCenter(metrics, unit);
    if (snack.hpRestored > 0) effects.floatText(center, `+${snack.hpRestored}`, "#8cf0a4");
    if (snack.mpRestored > 0) effects.floatText(center, `+${snack.mpRestored} MP`, "#8cc8ff");
  }

  // Diamond Harvester: reuse Ore Abundance's bigger gather-windup VFX for the free
  // full-ore fill Miner gets the instant he enters RAGE.
  for (const fill of oreRageFills) {
    const unit = findUnit(state, fill.unitId);
    if (!unit) continue;
    const center = unitCenter(metrics, unit);
    effects.playAbilityVfx("ore-abundance", { actor: unit, targets: [unit] }).then(() => {
      effects.floatText(center, `+${fill.mpRestored} ORE`, "#d8b35e");
    }).catch(() => {});
  }

  if (killed) audio.play("unitDefeated");
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

async function handleTile(position) {
  // Tempo: clicking one of my ready units always commands it instantly — even mid-animation,
  // even while another of mine is selected (it switches). beginTempoUnit frees the slot and
  // gates ownership/readiness/tempoBusy itself.
  if (isTempoBattle(state)) {
    const clicked = unitAt(state, position);
    if (clicked && clicked.id !== selectedId && isLocalTempoCommander(clicked)) {
      beginUnit(clicked); render(); return;
    }
  }
  if (inputLocked()) return;
  const unit = selectedUnit();
  if (!unit) {
    const clicked = unitAt(state, position);
    if (clicked) beginUnit(clicked);
    render();
    return;
  }
  if (mode === "move" && canTrample(unit)) {
    // RAGE Trample (Fat Knight): targeted exactly like Footwork/Stumble — one
    // adjacent tile at a time via footworkPath, not a single click straight to a
    // far destination. The move commits only after the full movement-length path.
    const options = getTrampleMoveOptions(state, unit, footworkPath);
    if (!options.has(positionKey(position))) {
      setMessage("Trample: choose the next highlighted tile.", true);
      render();
      return;
    }
    footworkPath.push(position);
    const maxSteps = getEffectiveStats(unit, state).moveRange;
    if (footworkPath.length < maxSteps) {
      const crossedEnemy = Boolean(unitAt(state, position));
      setMessage(`Trample: ${crossedEnemy ? "enemy crossed. " : ""}Choose step ${footworkPath.length + 1} of ${maxSteps}.`);
      render();
      return;
    }
    const from = { ...unit.position };
    const actorBefore = unit;
    const path = [...footworkPath];
    const dest = path[path.length - 1];
    footworkPath = [];
    if (dispatch(moveUnit(state.currentPlayer, unit.id, dest.x, dest.y, path))) {
      const moved = lastDispatchEvents.find((e) => e.type === "UNIT_MOVED");
      const completesActivation = state.activation?.primaryUsed;
      mode = null;
      setMessage(consumeTutorialPrompt(completesActivation ? "Moved. Activation complete." : "Moved. Now attack or defend to finish."));
      resolving = true;
      render();
      // Give the harmed tiles the same dash + contact-hit presentation Footwork/
      // Stumble use, instead of silently sliding past the units it just damaged.
      if (moved?.harmed?.length) {
        const metrics = createBoardMetrics(state.size);
        const harmedByTile = new Map();
        for (const id of moved.harmed) {
          const target = findUnit(state, id);
          if (target) harmedByTile.set(positionKey(target.position), target);
        }
        await effects.footworkCharge(actorBefore, moved.path, async (tile) => {
          const target = harmedByTile.get(positionKey(tile));
          if (!target) return;
          const center = unitCenter(metrics, target);
          audio.play("attackHit");
          effects.impact(center, false, "true");
          await effects.hitRecoil(target.id, target.position, false);
          const amount = moved.damageByTarget?.[target.id] ?? 0;
          await effects.floatText(center, `-${amount}`, "#ff7684");
          if (target.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
        });
      } else {
        await effects.animateMovement(unit.id, from, dest);
      }
      resolving = false;
      if (completesActivation) maybeAutoFinish();
      render();
      return;
    }
    render();
    return;
  } else if (mode === "move") {
    const from = { ...unit.position };
    if (dispatch(moveUnit(state.currentPlayer, unit.id, position.x, position.y))) {
      const completesActivation = state.activation?.primaryUsed;
      mode = null;
      setMessage(consumeTutorialPrompt(completesActivation ? "Moved. Activation complete." : "Moved. Now attack or defend to finish."));
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
        setMessage(consumeTutorialPrompt("Attack resolved."));
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
      const steps = getFootworkSteps(unit, state);
      if (footworkPath.length === steps) {
        if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "footwork", [...footworkPath])))
          setMessage("Footwork complete. This unit's activation is complete.");
      } else {
        setMessage(`Footwork: choose step ${footworkPath.length + 1} of ${steps}.`);
      }
    }
  } else if (mode?.startsWith("art:") && getAvailableArts(unit).find((a) => a.id === mode.slice("art:".length))?.targeting?.shape === "rushPath") {
    const artId = mode.slice("art:".length);
    const art = getAvailableArts(unit).find((a) => a.id === artId);
    const options = getRushStepOptions(state, unit, footworkPath, art);
    if (!options.has(positionKey(position))) { setMessage(`${art.name}: choose the next highlighted tile.`, true); }
    else {
      footworkPath.push(position);
      const steps = getRushSteps(unit, art, state);
      if (footworkPath.length === steps) {
        if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, [...footworkPath])))
          setMessage(`${art.name} complete. This unit's activation is complete.`);
      } else {
        setMessage(`${art.name}: choose step ${footworkPath.length + 1} of ${steps}.`);
      }
    }
  } else if (mode?.startsWith("art:") && (() => {
    const art = getArt(unit.type, mode.slice("art:".length));
    return art?.targeting?.shape === "flee" || art?.resolution === "flee";
  })()) {
    const artId = mode.slice("art:".length);
    const art = getArt(unit.type, artId);
    const fleeLegal = getLegalFleeTiles(state, unit, art);
    if (!fleeLegal.has(positionKey(position))) {
      setMessage(`${art.name}: choose a highlighted empty tile to teleport to.`, true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetPosition: position }))) {
      mode = null;
      setMessage(`${art.name} complete. This unit's activation is complete.`);
    }
  } else if (mode === "art:flight") {
    const flightLegal = getFlightTiles(state, unit, getArt(unit.type, "flight"));
    if (!flightLegal.has(positionKey(position))) {
      setMessage("Flight: choose a highlighted empty tile to fly onto.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "flight", { targetPosition: position }))) {
      mode = null;
      setMessage("Flight complete. This unit's activation is complete.");
    }
  } else if (mode === "art:volley-shot") {
    const origin = getVolleyShotOriginForTarget(state, unit, position);
    if (!origin) {
      setMessage("Click a tile inside a highlighted Volley Shot cone.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "volley-shot", { targetPosition: origin }))) {
      setMessage("Volley Shot resolved. This unit's activation is complete.");
    }
  } else if (mode?.startsWith("art:") && getAvailableArts(unit).find((a) => a.id === mode.slice("art:".length))?.targeting?.shape === "cone") {
    // Any other cone-shaped ART (e.g. Flamethrower) — same aim-direction targeting
    // as Volley Shot, generalized instead of hardcoded to that one art id.
    const artId = mode.slice("art:".length);
    const art = getAvailableArts(unit).find((a) => a.id === artId);
    const origin = getConeOriginForTarget(state, unit, position, art);
    if (!origin) {
      setMessage(`Click a tile inside a highlighted ${art.name} cone.`, true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetPosition: origin }))) {
      setMessage(`${art.name} resolved. This unit's activation is complete.`);
    }
  } else if (mode?.startsWith("art:") && (() => {
    const art = getArt(unit.type, mode.slice("art:".length));
    return art?.targeting?.shape === "placement" && (art.resolution === "summon" || art.resolution === "summonGhost");
  })()) {
    const artId = mode.slice("art:".length);
    const art = getArt(unit.type, artId);
    const placement = getSummonPlacementTiles(state, unit, art);
    if (!placement.has(positionKey(position))) {
      setMessage(`${art.name}: choose a highlighted empty tile.`, true);
    } else if (art.resolution === "summonGhost") {
      const shuffled = getSoulShuffleChoices(unit, state.rngState).choices;
      setMessage(`${art.name}: choose a spirit to call.`);
      render();
      const summonType = await openChoiceModal({
        title: `${art.name} — Soul Shuffle`,
        subtitle: "Choose one ghost. It takes a full turn, then dissipates.",
        accent: teamColor(unit.player),
        choices: shuffled.map((type) => ({
          value: type,
          label: getUnitType(type).name,
          sub: getUnitType(type).classType,
          type
        }))
      });
      if (!summonType || mode !== `art:${artId}`) {
        mode = null;
        setMessage(`${art.name} cancelled. Choose an action below.`);
        render();
        return;
      }
      if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetPosition: position, summonType }))) {
        mode = null;
        setMessage(`${getUnitType(summonType).name} beckoned as a ghost. Take its turn.`);
      }
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetPosition: position }))) {
      mode = null;
      setMessage(`${art.name} complete. This unit's activation is complete.`);
    }
  } else if (mode === "art:build-cover") {
    const placement = getWallPlacementTiles(state, unit, getUnitType(unit.type).arts.find((a) => a.id === "build-cover"));
    if (!placement.has(positionKey(position))) {
      setMessage("Build Cover: choose a highlighted empty tile to raise the wall.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "build-cover", { targetPosition: position }))) {
      mode = null;
      setMessage("Cover raised. This unit's activation is complete.");
    }
  } else if (mode === "art:shaft-prop") {
    const placement = getWallPlacementTiles(state, unit, getUnitType(unit.type).arts.find((a) => a.id === "shaft-prop"));
    if (!placement.has(positionKey(position))) {
      setMessage("Shaft Prop: choose a highlighted empty tile to raise the wall.", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "shaft-prop", { targetPosition: position }))) {
      mode = null;
      setMessage("Shaft prop raised. This unit's activation is complete.");
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
        title: `Age — ${ally ? "empower" : "weaken"} ${target.nickname || getUnitType(target.type).name}`,
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
  } else if (mode === "art:anoint") {
    // Friendly-only buff: click a highlighted ally in range (never self). A wall does not
    // block a friendly cast.
    const target = unitAt(state, position);
    const art = getArt(unit.type, "anoint");
    const reach = art?.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
    const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
      chebyshevDistance(unit.position, target.position) <= reach;
    if (!inReach) {
      setMessage("Anoint: click a highlighted ally in range (not yourself).", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "anoint", { targetId: target.id }))) {
      mode = null;
      setMessage("Anoint resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:purify") {
    // Friendly-only cleanse: click a highlighted ally in range (never self).
    const target = unitAt(state, position);
    const art = getArt(unit.type, "purify");
    const reach = art?.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
    const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
      chebyshevDistance(unit.position, target.position) <= reach;
    if (!inReach) {
      setMessage("Purify: click a highlighted ally in range (not yourself).", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "purify", { targetId: target.id }))) {
      mode = null;
      setMessage("Purify resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:cleanse") {
    // Friendly-only negative-status cleanse: click a highlighted ally in range (never self).
    const target = unitAt(state, position);
    const art = getArt(unit.type, "cleanse");
    const reach = art?.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
    const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
      chebyshevDistance(unit.position, target.position) <= reach;
    if (!inReach) {
      setMessage("Cleanse: click a highlighted ally in range (not yourself).", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "cleanse", { targetId: target.id }))) {
      mode = null;
      setMessage("Cleanse resolved. This unit's activation is complete.");
    }
  } else if (mode === "art:focus-prayer") {
    // Friendly-only heal-or-backfire prayer: click a highlighted ally in range (never self).
    const target = unitAt(state, position);
    const art = getArt(unit.type, "focus-prayer");
    const reach = art?.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
    const inReach = target && target.id !== unit.id && areAllies(unit, target) &&
      chebyshevDistance(unit.position, target.position) <= reach;
    if (!inReach) {
      setMessage("Focus Prayer: click a highlighted ally in range (not yourself).", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "focus-prayer", { targetId: target.id }))) {
      mode = null;
      setMessage("Focus Prayer resolved. This unit's activation is complete.");
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
  } else if (mode === "art:thunderous-charge") {
    // Charge a highlighted aim tile (never an enemy's tile); the blast hits a 2-tile radius.
    const art = getAvailableArts(unit).find((a) => a.id === "thunderous-charge");
    if (!art || !getTargetedBlastAimTiles(state, unit, art).has(positionKey(position))) {
      setMessage("Thunderous Charge: click a highlighted tile (not one an enemy stands on).", true);
    } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, "thunderous-charge", { targetPosition: position }))) {
      mode = null;
      setMessage("Thunderous Charge resolved. This unit's activation is complete.");
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
    } else if (art?.targeting?.shape === "lineBurst") {
      // Self-centred line burst (Pyroclasm): any click confirms the eruption.
      if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId))) {
        mode = null;
        setMessage(`${art.name} resolved. This unit's activation is complete.`);
      }
    } else if (art?.effect?.type === "healAllies") {
      if (!isHealArtConfirmTile(state, unit, art, position)) {
        setMessage(`${art.name}: click a highlighted heal tile to confirm.`, true);
      } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId))) {
        mode = null;
        setMessage(`${art.name} resolved. This unit's activation is complete.`);
      }
    } else if (art?.targeting?.shape === "protectAlly") {
      const key = positionKey(position);
      const target = state.units.find((candidate) =>
        candidate.hp > 0 &&
        candidate.player === unit.player &&
        candidate.id !== unit.id &&
        getProtectLandingTiles(state, unit, candidate, art).has(key));
      if (!target) {
        setMessage(`${art.name}: click a highlighted landing tile beside an ally.`, true);
      } else if (await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetId: target.id }))) {
        mode = null;
        setMessage(`${art.name} resolved. This unit's activation is complete.`);
      }
    } else {
      const target = unitAt(state, position);
      let resolved = false;
      if (art?.id === "blasting-cap" && isWallAt(state, position)) {
        resolved = await resolveInstantArt(useArt(state.currentPlayer, unit.id, artId, { targetPosition: position }));
      } else if (target) {
        const command = useArt(state.currentPlayer, unit.id, artId, { targetId: target.id });
        const peek = applyCommand(state, command);
        const rolled = (peek.events ?? []).some((event) => event.type === "ART_RESOLVED" && "hit" in event && event.rolled !== false);
        resolved = rolled ? await resolveCombat(command) : await resolveInstantArt(command);
      }
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
      setMessage(consumeTutorialPrompt("Defending: incoming physical and magic damage is halved."));
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
      setMessage(consumeTutorialPrompt("Activation complete. The next commander takes the field."));
  } else {
    const deselect = mode === action;
    mode = deselect ? null : action;
    footworkPath = [];
    volleyShotOrigin = null;
    rewindTargetId = null;
    if (deselect) {
      setMessage("Choose an action below.");
    } else if (action === "move" && canTrample(unit)) {
      setMessage(`Trample: choose step 1 of up to ${getEffectiveStats(unit, state).moveRange} — walking into an enemy tramples it for true damage.`);
    } else if (action === "footwork") {
      const footwork = getUnitType(unit.type).arts.find((a) => a.id === "footwork");
      setMessage(`Footwork (${footwork.mpCost} MP): ${footwork.description} Choose step 1 of ${getFootworkSteps(unit, state)}.`);
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
          choices: fallen.map((ally) => ({ value: ally.id, label: ally.nickname || getUnitType(ally.type).name, sub: "Fallen · returns at full HP", type: ally.type }))
        });
        if (!chosen || mode !== "art:rewind") {
          mode = null;
          rewindTargetId = null;
          setMessage("Rewind cancelled. Choose an action below.");
          render();
          return;
        }
        rewindTargetId = chosen;
        {
          const revivedUnit = findUnit(state, chosen);
          setMessage(`${art.name}: click a highlighted tile within 3 to place ${revivedUnit.nickname || getUnitType(revivedUnit.type).name}.`);
        }
        render();
        return;
      }
      if (art?.selfCast) {
        // Self-centred AoE blasts (Dark Bomb, Nuke) and the Gargoyle's Pyroclasm line
        // burst preview their footprint first — staying in art mode lets the board light
        // the zone and its victims; a click confirms (see handleTile). Every other
        // selfCast resolves immediately.
        if (art.targeting?.shape === "nukeAura") {
          setMessage(`${art.name} (${art.mpCost} MP): ${art.description} Click inside the highlighted blast zone to detonate.`);
          render();
          return;
        }
        if (art.targeting?.shape === "lineBurst") {
          setMessage(`${art.name} (${art.mpCost} MP): ${art.description} Click to erupt.`);
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
      const lead = action === "art:volley-shot" || art?.targeting?.shape === "cone"
        ? "Hover a direction to preview the cone, then click to fire."
        : action === "art:thunderous-charge"
          ? "Hover a highlighted tile to preview the blast, then click to charge (not an enemy's tile)."
        : art?.targeting?.shape === "rushPath"
          ? `Choose step 1 of ${getRushSteps(unit, art, state)}.`
        : action === "art:flight"
          ? "Choose a highlighted empty tile to fly onto."
        : art?.targeting?.shape === "flee" || art?.resolution === "flee"
          ? "Choose a highlighted empty tile to teleport to."
          : art?.targeting?.shape === "placement" && (art?.resolution === "summon" || art?.resolution === "summonGhost")
            ? "Choose a highlighted empty tile for the summon."
            : action === "art:build-cover"
              ? "Choose a highlighted empty tile to raise the wall."
              : action === "art:shaft-prop"
                ? "Choose a highlighted empty tile to raise the wall."
                : action === "art:throw-cigar"
                  ? "Choose a highlighted tile to set alight."
                : art?.effect?.type === "healAllies"
                  ? "Click any highlighted ally to confirm."
                  : art?.targeting?.shape === "ally"
                    ? "Click a highlighted ally in range (not yourself)."
                  : art?.targeting?.shape === "allyOrEnemy"
                    ? "Click a highlighted ally or enemy in range."
                    : art?.targeting?.shape === "protectAlly"
                      ? "Click a highlighted landing tile beside an ally."
                    : art?.targeting?.shape === "lineAny"
                      ? "Click a highlighted ally or enemy on a straight line to grab it."
                      : art?.targeting?.shape === "lineEnemy"
                        ? "Click a highlighted enemy on a straight line to punch it."
                        : art?.resolution === "statusCast"
                          ? "Choose a highlighted enemy target."
                          : action === "art:blasting-cap"
                            ? "Choose a highlighted enemy or wall target."
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
