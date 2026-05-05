import { DEFAULT_SETTINGS, PHASES } from './config.js';
import { sanitizePenaltyWord } from './validation.js';

function fallbackPlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    clientId: `local-${index + 1}`,
    name: `Player ${index + 1}`,
    letters: '',
    eliminated: false,
    lastResult: null,
  }));
}

export function normalizePlayers(players, count = 2) {
  if (Array.isArray(players) && players.length > 0) {
    return players.slice(0, 6).map((player, index) => ({
      id: String(player.id || player.clientId || `p${index + 1}`),
      clientId: String(player.clientId || player.id || `local-${index + 1}`),
      name: String(player.name || player.displayName || `Player ${index + 1}`).slice(0, 18),
      letters: String(player.letters || ''),
      eliminated: !!player.eliminated,
      lastResult: player.lastResult || null,
    }));
  }
  return fallbackPlayers(count);
}

export function createInitialState() {
  return {
    phase: PHASES.MENU,
    mode: 'local',
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    ownerIndex: 0,
    activeSequence: [],
    ownerReplayIndex: 0,
    ownerDraft: [],
    appendTargetLength: 0,
    copyProgress: {},
    roundResults: [],
    winnerId: null,
    status: '',
    timer: null,
    playback: null,
    network: null,
  };
}

export function createMatchState({
  playerCount,
  penaltyWord,
  firstOwnerIndex = null,
  players = null,
  mode = 'local',
  seed = null,
  network = null,
}) {
  const normalizedPlayers = normalizePlayers(players, playerCount || 2);
  const count = normalizedPlayers.length;
  const settings = {
    ...DEFAULT_SETTINGS,
    playerCount: count,
    penaltyWord: sanitizePenaltyWord(penaltyWord || DEFAULT_SETTINGS.penaltyWord),
  };
  const seededOwner = Number.isFinite(Number(seed)) ? Math.abs(Number(seed)) % count : Math.floor(Math.random() * count);
  const ownerIndex = firstOwnerIndex == null ? seededOwner : Math.max(0, Math.min(count - 1, Number(firstOwnerIndex)));
  return {
    ...createInitialState(),
    mode,
    network,
    phase: PHASES.OWNER_CREATE_INITIAL,
    settings,
    players: normalizedPlayers,
    ownerIndex,
    activeSequence: [],
    ownerDraft: [],
    appendTargetLength: 0,
    copyProgress: {},
    status: `${normalizedPlayers[ownerIndex]?.name || 'Owner'} starts control. Create a 4-input pattern.`,
  };
}

export function activePlayers(state) {
  return state.players.filter(player => !player.eliminated);
}

export function getOwner(state) {
  return state.players[state.ownerIndex] || null;
}

export function findPlayerIndexById(state, playerId) {
  return state.players.findIndex(player => player.id === playerId || player.clientId === playerId);
}

export function nextActiveIndex(state, fromIndex) {
  if (activePlayers(state).length <= 0) return -1;
  for (let offset = 1; offset <= state.players.length; offset++) {
    const index = (fromIndex + offset) % state.players.length;
    if (!state.players[index]?.eliminated) return index;
  }
  return -1;
}

export function firstActiveIndex(state) {
  return state.players.findIndex(player => !player.eliminated);
}

export function cloneState(state) {
  return {
    ...state,
    settings: { ...state.settings },
    players: state.players.map(player => ({ ...player })),
    activeSequence: [...state.activeSequence],
    ownerDraft: [...state.ownerDraft],
    appendTargetLength: Number(state.appendTargetLength || 0),
    copyProgress: Object.fromEntries(Object.entries(state.copyProgress || {}).map(([id, progress]) => [id, { ...progress }])),
    roundResults: state.roundResults.map(result => ({ ...result })),
    timer: state.timer ? { ...state.timer } : null,
    playback: state.playback ? { ...state.playback, sequence: [...(state.playback.sequence || [])] } : null,
    network: state.network ? { ...state.network } : null,
  };
}

export function serializeStateForNetwork(state) {
  const copy = cloneState(state);
  if (copy.timer) {
    const now = performance.now();
    copy.timer = {
      durationMs: copy.timer.durationMs,
      remainingMs: Math.max(0, copy.timer.endsAt - now),
    };
  }
  if (copy.playback) {
    const now = performance.now();
    copy.playback = {
      ...copy.playback,
      sequence: [...(copy.playback.sequence || [])],
      remainingMs: Math.max(0, (copy.playback.startedAt + copy.playback.totalMs) - now),
    };
    delete copy.playback.startedAt;
  }
  return copy;
}

export function hydrateNetworkState(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const copy = cloneState({ ...createInitialState(), ...snapshot });
  if (snapshot.timer && Number.isFinite(Number(snapshot.timer.remainingMs))) {
    const now = performance.now();
    copy.timer = {
      startedAt: now,
      durationMs: Number(snapshot.timer.durationMs) || Number(snapshot.timer.remainingMs),
      endsAt: now + Number(snapshot.timer.remainingMs),
    };
  }
  if (snapshot.playback && Number.isFinite(Number(snapshot.playback.remainingMs))) {
    const now = performance.now();
    const totalMs = Number(snapshot.playback.totalMs) || Number(snapshot.playback.remainingMs);
    const remainingMs = Math.max(0, Number(snapshot.playback.remainingMs));
    copy.playback = {
      ...snapshot.playback,
      sequence: Array.isArray(snapshot.playback.sequence) ? [...snapshot.playback.sequence] : [],
      totalMs,
      remainingMs,
      startedAt: now - Math.max(0, totalMs - remainingMs),
    };
  }
  return copy;
}
