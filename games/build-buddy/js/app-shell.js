import { DEFAULT_PACK_ID, getStageSequence, listStages } from './stages/stage-registry.js';
import {
  getUnlockedStageIds,
  isStageUnlocked,
  loadProgression,
  recordCanonStageClear,
  saveProgression,
} from './progression.js';
import {
  advanceSession,
  buildRunSummary,
  createDebugSession,
  createLocalRunSession,
  createPracticeSession,
  getCurrentRoles,
  recordStageClear,
  recordStageFailure,
} from './session.js';
import { sanitizeOnlineIdentity } from './online-client.js';
import {
  createOnlineGameplayState,
  markOnlineGameplayDisconnected,
  receiveRunCompleteMessage,
  receiveStageResultMessage,
  recordAuthoritativeStageResult,
} from './online-gameplay.js';
import { VIEW_MODES } from './view-modes.js';

export const APP_SCREENS = Object.freeze({
  MAIN_MENU: 'main_menu',
  MODE_SELECT: 'mode_select',
  ONLINE_MENU: 'online_menu',
  ONLINE_LOBBY: 'online_lobby',
  PRACTICE_SELECT: 'practice_select',
  GAMEPLAY: 'gameplay',
  STAGE_RESULT: 'stage_result',
  RUN_RESULT: 'run_result',
});

const DEFAULT_PLAYERS = Object.freeze([
  Object.freeze({ id: 'player_a', displayName: 'Player A' }),
  Object.freeze({ id: 'player_b', displayName: 'Player B' }),
]);

function clone(value) {
  return structuredClone(value);
}

function normalizeStages(stageList = listStages(DEFAULT_PACK_ID)) {
  return stageList
    .filter((stage) => stage && typeof stage.id === 'string' && stage.id)
    .map((stage, index) => ({
      ...stage,
      packId: stage.packId || DEFAULT_PACK_ID,
      stageNumber: Number.isFinite(Number(stage.stageNumber)) ? Number(stage.stageNumber) : index + 1,
      name: typeof stage.name === 'string' && stage.name ? stage.name : `Stage ${index + 1}`,
    }));
}

function sequenceForPack(stages, packId) {
  const ids = stages.filter((stage) => stage.packId === packId).map((stage) => stage.id);
  return ids.length > 0 ? ids : getStageSequence(packId);
}

function stageById(state, stageId) {
  return state.stageList.find((stage) => stage.id === stageId) ?? null;
}

function withProgressionSaved(state, progression) {
  saveProgression(state.storage, progression);
  return { ...state, progression };
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function createOnlineState(intent, identity, extra = {}) {
  return {
    intent,
    identity: sanitizeOnlineIdentity(identity),
    lobbyStatus: extra.lobbyStatus || 'idle',
    requestedRoomCode: normalizeRoomCode(extra.requestedRoomCode),
    roomCode: normalizeRoomCode(extra.roomCode),
    ownerId: extra.ownerId || '',
    isOwner: false,
    players: [],
    readyByPlayerId: {},
    authorityMode: 'client_host',
    serverMatchState: null,
    error: null,
  };
}

export function localOnlineRole(state) {
  const session = state?.onlineGameplay?.session ?? state?.session;
  const localPlayerId = state?.onlineGameplay?.localPlayerId ?? state?.online?.identity?.playerId ?? '';
  if (!session || !localPlayerId) return '';
  const roles = getCurrentRoles(session);
  if (roles.runnerPlayerId === localPlayerId) return VIEW_MODES.RUNNER;
  if (roles.builderPlayerId === localPlayerId) return VIEW_MODES.BUILDER;
  return '';
}

export function viewModeForOnlineRole(state) {
  return localOnlineRole(state) || VIEW_MODES.RUNNER;
}

function playerFromMember(memberId, profiles, fallbackIndex) {
  const profile = sanitizeOnlineIdentity(profiles?.[memberId]);
  return {
    id: profile.playerId || memberId || `online_player_${fallbackIndex + 1}`,
    displayName: profile.displayName || `Player ${fallbackIndex + 1}`,
  };
}

export function createAppShellState({
  storage = globalThis.localStorage,
  packId = DEFAULT_PACK_ID,
  stageList = listStages(packId),
  players = DEFAULT_PLAYERS,
} = {}) {
  const normalizedStages = normalizeStages(stageList);
  return {
    screen: APP_SCREENS.MAIN_MENU,
    storage,
    packId,
    stageList: normalizedStages,
    players: clone(players),
    progression: loadProgression(storage),
    session: null,
    stageResult: null,
    runSummary: null,
    viewMode: VIEW_MODES.RUNNER,
    online: null,
    onlineGameplay: null,
  };
}

export function goToModeSelect(state) {
  return { ...state, screen: APP_SCREENS.MODE_SELECT, stageResult: null, runSummary: null };
}

export function goToOnlineMenu(state) {
  return { ...state, screen: APP_SCREENS.ONLINE_MENU, stageResult: null, runSummary: null, online: null };
}

export function goToPracticeSelect(state) {
  return { ...state, screen: APP_SCREENS.PRACTICE_SELECT, stageResult: null, runSummary: null };
}

export function startOnlineSearch(state, identity) {
  return {
    ...state,
    screen: APP_SCREENS.ONLINE_LOBBY,
    online: createOnlineState('public', identity, { lobbyStatus: 'searching' }),
    stageResult: null,
    runSummary: null,
  };
}

export function startPrivateLobby(state, identity) {
  return {
    ...state,
    screen: APP_SCREENS.ONLINE_LOBBY,
    online: createOnlineState('private_create', identity, { lobbyStatus: 'creating' }),
    stageResult: null,
    runSummary: null,
  };
}

export function joinOnlineLobby(state, roomCode, identity) {
  return {
    ...state,
    screen: APP_SCREENS.ONLINE_LOBBY,
    online: createOnlineState('private_join', identity, {
      lobbyStatus: 'joining',
      requestedRoomCode: roomCode,
    }),
    stageResult: null,
    runSummary: null,
  };
}

export function applyOnlineClientSnapshot(state, snapshot = {}) {
  if (!state.online) return state;

  const lobby = snapshot.lobby ?? null;
  const profiles = snapshot.profiles ?? {};
  const members = Array.isArray(lobby?.members) ? lobby.members : [];
  const players = members.map((memberId, index) => playerFromMember(memberId, profiles, index));
  const ownerId = lobby?.ownerId || state.online.ownerId || '';
  const roomCode = lobby?.roomCode || state.online.roomCode || state.online.requestedRoomCode;

  return {
    ...state,
    online: {
      ...state.online,
      lobbyStatus: snapshot.status || state.online.lobbyStatus,
      roomCode: normalizeRoomCode(roomCode),
      ownerId,
      isOwner: !!ownerId && ownerId === (snapshot.clientId || state.online.identity.playerId),
      players,
      readyByPlayerId: { ...(snapshot.readyByPlayerId ?? state.online.readyByPlayerId) },
      authorityMode: snapshot.onlineGameplay?.lastMatchState?.value?.network?.authorityMode || state.online.authorityMode,
      serverMatchState: snapshot.onlineGameplay?.lastMatchState?.value ?? state.online.serverMatchState,
      error: snapshot.error ?? null,
    },
  };
}

export function startOnlineRunFromLobby(state) {
  if (!state.online || state.online.players.length < 2) return state;
  const authorityPlayerId = state.online.authorityMode === 'server'
    ? 'server'
    : state.online.ownerId || state.online.players[0].id;
  const onlineGameplay = createOnlineGameplayState({
    packId: state.packId,
    stageSequence: sequenceForPack(state.stageList, state.packId),
    players: state.online.players,
    localPlayerId: state.online.identity.playerId,
    authorityPlayerId,
  });
  const serverStage = state.online.serverMatchState?.stage;
  const session = serverStage?.stageId
    ? {
      ...onlineGameplay.session,
      stageIndex: Number(serverStage.stageIndex) || 0,
      currentStageId: serverStage.stageId,
    }
    : onlineGameplay.session;
  return {
    ...state,
    screen: APP_SCREENS.GAMEPLAY,
    session,
    onlineGameplay: { ...onlineGameplay, session },
    stageResult: null,
    runSummary: null,
    viewMode: viewModeForOnlineRole({ ...state, session, onlineGameplay: { ...onlineGameplay, session } }),
  };
}

export function markOnlineReady(state, ready = true) {
  if (!state.online) return state;
  const playerId = state.online.identity.playerId;
  if (!playerId) return state;
  return {
    ...state,
    online: {
      ...state.online,
      readyByPlayerId: {
        ...state.online.readyByPlayerId,
        [playerId]: ready === true,
      },
    },
  };
}

export function getPracticeStageOptions(state) {
  return state.stageList
    .filter((stage) => stage.packId === state.packId)
    .map((stage) => ({
      ...stage,
      unlocked: isStageUnlocked(state.progression, stage.packId, stage.id),
    }));
}

export function startLocalRun(state) {
  return {
    ...state,
    screen: APP_SCREENS.GAMEPLAY,
    session: createLocalRunSession({
      packId: state.packId,
      stageSequence: sequenceForPack(state.stageList, state.packId),
      players: state.players,
    }),
    stageResult: null,
    runSummary: null,
    viewMode: VIEW_MODES.RUNNER,
  };
}

export function startPractice(state, stageId) {
  const stage = stageById(state, stageId);
  if (!stage || !isStageUnlocked(state.progression, stage.packId, stage.id)) {
    return goToPracticeSelect(state);
  }

  return {
    ...state,
    screen: APP_SCREENS.GAMEPLAY,
    session: createPracticeSession({ packId: stage.packId, stageId: stage.id, players: state.players }),
    stageResult: null,
    runSummary: null,
    viewMode: VIEW_MODES.RUNNER,
  };
}

export function startDebugLab(state, stageId = state.stageList[0]?.id) {
  const stage = stageById(state, stageId) ?? state.stageList[0];
  return {
    ...state,
    screen: APP_SCREENS.GAMEPLAY,
    session: createDebugSession({
      packId: stage?.packId ?? state.packId,
      stageId: stage?.id,
      stageSequence: stage ? [stage.id] : sequenceForPack(state.stageList, state.packId),
      players: state.players,
    }),
    stageResult: null,
    runSummary: null,
    viewMode: VIEW_MODES.HYBRID,
  };
}

export function submitStageClear(state, details = {}) {
  if (!state.session || state.screen !== APP_SCREENS.GAMEPLAY) return state;
  if (state.onlineGameplay) {
    const onlineGameplay = recordAuthoritativeStageResult(state.onlineGameplay, {
      outcome: 'clear',
      details,
    });
    if (onlineGameplay.stageResult) {
      return {
        ...state,
        screen: APP_SCREENS.STAGE_RESULT,
        session: onlineGameplay.session,
        onlineGameplay,
        stageResult: onlineGameplay.stageResult,
        runSummary: onlineGameplay.runSummary,
      };
    }
    return { ...state, onlineGameplay };
  }

  const session = recordStageClear(state.session, details);
  const result = session.stageResults.find((entry) => entry.stageIndex === session.stageIndex) ?? null;
  const nextStageId = session.stageSequence[session.stageIndex + 1] ?? null;
  const progression = result
    ? recordCanonStageClear(state.progression, {
      packId: result.packId,
      stageId: result.stageId,
      nextStageId,
      isCanonRun: session.isCanonRun && session.progressionWritesEnabled,
    })
    : state.progression;

  return withProgressionSaved({
    ...state,
    screen: APP_SCREENS.STAGE_RESULT,
    session,
    stageResult: result,
  }, progression);
}

export function submitStageFailure(state, reason = 'failure', details = {}) {
  if (!state.session || state.screen !== APP_SCREENS.GAMEPLAY) return state;
  if (state.onlineGameplay) {
    const onlineGameplay = recordAuthoritativeStageResult(state.onlineGameplay, {
      outcome: 'fail',
      reason,
      details,
    });
    if (onlineGameplay.stageResult) {
      return {
        ...state,
        screen: APP_SCREENS.STAGE_RESULT,
        session: onlineGameplay.session,
        onlineGameplay,
        stageResult: onlineGameplay.stageResult,
        runSummary: onlineGameplay.runSummary,
      };
    }
    return { ...state, onlineGameplay };
  }

  const session = recordStageFailure(state.session, reason, details);
  const result = session.stageResults.find((entry) => entry.stageIndex === session.stageIndex) ?? null;
  return {
    ...state,
    screen: APP_SCREENS.STAGE_RESULT,
    session,
    stageResult: result,
  };
}

export function continueFromStageResult(state) {
  if (!state.session || state.screen !== APP_SCREENS.STAGE_RESULT) return state;
  if (state.onlineGameplay) {
    if (state.session.isComplete) {
      return {
        ...state,
        screen: APP_SCREENS.RUN_RESULT,
        stageResult: null,
        runSummary: state.onlineGameplay.runSummary ?? buildRunSummary(state.session),
      };
    }
    return {
      ...state,
      screen: APP_SCREENS.GAMEPLAY,
      stageResult: null,
      viewMode: viewModeForOnlineRole(state),
    };
  }

  const session = advanceSession(state.session);
  if (session.isComplete) {
    return {
      ...state,
      screen: APP_SCREENS.RUN_RESULT,
      session,
      stageResult: null,
      runSummary: buildRunSummary(session),
    };
  }

  return {
    ...state,
    screen: APP_SCREENS.GAMEPLAY,
    session,
    stageResult: null,
  };
}

export function resetToMainMenu(state) {
  return {
    ...state,
    screen: APP_SCREENS.MAIN_MENU,
    session: null,
    stageResult: null,
    runSummary: null,
    online: null,
    onlineGameplay: null,
    progression: loadProgression(state.storage),
  };
}

export function applyOnlineStageResult(state, message = {}) {
  if (!state.onlineGameplay || state.screen !== APP_SCREENS.GAMEPLAY) return state;
  const onlineGameplay = receiveStageResultMessage(state.onlineGameplay, message);
  if (!onlineGameplay.stageResult) return { ...state, onlineGameplay };
  return {
    ...state,
    screen: APP_SCREENS.STAGE_RESULT,
    session: onlineGameplay.session,
    onlineGameplay,
    stageResult: onlineGameplay.stageResult,
    runSummary: onlineGameplay.runSummary,
  };
}

export function applyOnlineRunComplete(state, message = {}) {
  if (!state.onlineGameplay) return state;
  const onlineGameplay = receiveRunCompleteMessage(state.onlineGameplay, message);
  return {
    ...state,
    screen: APP_SCREENS.RUN_RESULT,
    session: onlineGameplay.session,
    onlineGameplay,
    stageResult: null,
    runSummary: onlineGameplay.runSummary,
  };
}

export function applyOnlineGameplayDisconnect(state, playerId = '') {
  if (!state.onlineGameplay) return state;
  return {
    ...state,
    screen: APP_SCREENS.ONLINE_LOBBY,
    game: null,
    online: {
      ...state.online,
      lobbyStatus: 'disconnected',
      error: { code: 'PLAYER_DISCONNECTED', message: 'Online player disconnected' },
    },
    onlineGameplay: markOnlineGameplayDisconnected(state.onlineGameplay, playerId),
  };
}

export function unlockedStageIdSet(state) {
  return new Set(getUnlockedStageIds(state.progression, state.packId));
}
