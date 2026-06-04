export const SESSION_MODES = Object.freeze({
  LOCAL_RUN: 'local_run',
  ONLINE_RUN: 'online_run',
  PRACTICE: 'practice',
  DEBUG: 'debug',
});

const DEFAULT_PLAYERS = Object.freeze([
  Object.freeze({ id: 'player_a', displayName: 'Player A' }),
  Object.freeze({ id: 'player_b', displayName: 'Player B' }),
]);

function clone(value) {
  return structuredClone(value);
}

function normalizePlayers(players = DEFAULT_PLAYERS) {
  const normalized = Array.isArray(players) ? players.slice(0, 2) : [];
  while (normalized.length < 2) normalized.push(DEFAULT_PLAYERS[normalized.length]);
  return normalized.map((player, index) => ({
    id: typeof player?.id === 'string' && player.id ? player.id : DEFAULT_PLAYERS[index].id,
    displayName: typeof player?.displayName === 'string' && player.displayName
      ? player.displayName
      : DEFAULT_PLAYERS[index].displayName,
  }));
}

function normalizeStageSequence(stageSequence, fallbackStageId = null) {
  const stages = Array.isArray(stageSequence)
    ? stageSequence.filter((stageId) => typeof stageId === 'string' && stageId)
    : [];
  if (stages.length > 0) return stages;
  return fallbackStageId ? [fallbackStageId] : [];
}

function createSession({
  mode,
  packId,
  stageSequence,
  stageId = null,
  players,
  stageIndex = 0,
  isCanonRun = false,
  progressionWritesEnabled = false,
}) {
  const sequence = normalizeStageSequence(stageSequence, stageId);
  const boundedIndex = Math.max(0, Math.min(Math.floor(Number(stageIndex) || 0), Math.max(0, sequence.length - 1)));
  return {
    mode,
    packId,
    stageSequence: sequence,
    stageIndex: boundedIndex,
    currentStageId: sequence[boundedIndex] ?? null,
    players: normalizePlayers(players),
    stageResults: [],
    isCanonRun,
    progressionWritesEnabled,
    isComplete: sequence.length === 0,
  };
}

export function createLocalRunSession({ packId, stageSequence, players } = {}) {
  return createSession({
    mode: SESSION_MODES.LOCAL_RUN,
    packId,
    stageSequence,
    players,
    isCanonRun: true,
    progressionWritesEnabled: true,
  });
}

export function createOnlineRunSession({ packId, stageSequence, players } = {}) {
  return createSession({
    mode: SESSION_MODES.ONLINE_RUN,
    packId,
    stageSequence,
    players,
    isCanonRun: true,
    progressionWritesEnabled: true,
  });
}

export function createPracticeSession({ packId, stageId, players } = {}) {
  return createSession({
    mode: SESSION_MODES.PRACTICE,
    packId,
    stageId,
    players,
    isCanonRun: false,
    progressionWritesEnabled: false,
  });
}

export function createDebugSession({ packId, stageId, stageSequence, players } = {}) {
  return createSession({
    mode: SESSION_MODES.DEBUG,
    packId,
    stageId,
    stageSequence,
    players,
    isCanonRun: false,
    progressionWritesEnabled: false,
  });
}

export function getCurrentRoles(session) {
  const players = normalizePlayers(session?.players);
  const stageIndex = Math.max(0, Math.floor(Number(session?.stageIndex) || 0));
  const runnerIndex = stageIndex % 2;
  const builderIndex = runnerIndex === 0 ? 1 : 0;
  return {
    runnerPlayerId: players[runnerIndex].id,
    builderPlayerId: players[builderIndex].id,
  };
}

function normalizeFailureReason(reason) {
  if (reason === 'timer' || reason === 'timeout') return 'time_up';
  return typeof reason === 'string' && reason ? reason : 'failure';
}

function buildStageResult(session, outcome, details = {}) {
  return {
    packId: session.packId,
    stageId: session.currentStageId,
    stageIndex: session.stageIndex,
    roles: getCurrentRoles(session),
    outcome,
    reason: outcome === 'failure' ? normalizeFailureReason(details.reason) : null,
    elapsedMs: Number.isFinite(Number(details.elapsedMs)) ? Number(details.elapsedMs) : null,
    deaths: Number.isFinite(Number(details.deaths)) ? Math.max(0, Math.floor(Number(details.deaths))) : 0,
    toolsPlaced: Number.isFinite(Number(details.toolsPlaced)) ? Math.max(0, Math.floor(Number(details.toolsPlaced))) : 0,
  };
}

function recordStageResult(session, outcome, details = {}) {
  if (!session || session.isComplete || !session.currentStageId) return clone(session);
  const next = clone(session);
  const existingIndex = next.stageResults.findIndex((result) => result.stageIndex === next.stageIndex);
  const result = buildStageResult(next, outcome, details);
  if (existingIndex >= 0) next.stageResults[existingIndex] = result;
  else next.stageResults.push(result);
  return next;
}

export function recordStageClear(session, details = {}) {
  return recordStageResult(session, 'clear', details);
}

export function recordStageFailure(session, reason = 'failure', details = {}) {
  return recordStageResult(session, 'failure', { ...details, reason });
}

export function advanceSession(session) {
  const next = clone(session);
  if (!next || next.isComplete) return next;

  const finalStageIndex = Math.max(0, next.stageSequence.length - 1);
  if (next.stageIndex >= finalStageIndex) {
    next.isComplete = true;
    next.currentStageId = next.stageSequence[next.stageIndex] ?? null;
    return next;
  }

  next.stageIndex += 1;
  next.currentStageId = next.stageSequence[next.stageIndex] ?? null;
  return next;
}

export function shouldUnlockStage(session, stageId) {
  if (!session?.progressionWritesEnabled || !session?.isCanonRun) return false;
  return session.stageResults.some((result) => result.stageId === stageId && result.outcome === 'clear');
}

export function buildRunSummary(session) {
  const results = Array.isArray(session?.stageResults) ? clone(session.stageResults) : [];
  const clearedStages = results.filter((result) => result.outcome === 'clear').length;
  const failedStages = results.filter((result) => result.outcome === 'failure').length;
  return {
    mode: session?.mode ?? null,
    packId: session?.packId ?? null,
    totalStages: Array.isArray(session?.stageSequence) ? session.stageSequence.length : 0,
    completedStages: results.length,
    clearedStages,
    failedStages,
    isComplete: !!session?.isComplete,
    results,
  };
}
