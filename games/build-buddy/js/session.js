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
  if (reason === 'timer' || reason === 'timeout' || reason === 'time_up') return 'timer';
  return typeof reason === 'string' && reason ? reason : 'softlock';
}

function normalizeCount(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function normalizeMs(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : null;
}

function cloneObject(value) {
  return value && typeof value === 'object' ? clone(value) : {};
}

function checkpointUnusedRewardMs(outcome, checkpointUsedForRespawn, explicitReward) {
  if (outcome !== 'clear') return 0;
  if (checkpointUsedForRespawn) return 0;
  return Number.isFinite(Number(explicitReward)) ? Math.max(0, Number(explicitReward)) : 10000;
}

function finalStageTimeMs(outcome, timeClearedMs, rewardMs) {
  if (outcome !== 'clear' || timeClearedMs == null) return null;
  return Math.max(0, timeClearedMs - rewardMs);
}

function buildStageResult(session, outcome, details = {}) {
  const roles = getCurrentRoles(session);
  const timeClearedMs = outcome === 'clear'
    ? normalizeMs(details.timeClearedMs ?? details.elapsedMs)
    : null;
  const usedCheckpoint = details.checkpointUsedForRespawn === true;
  const rewardMs = checkpointUnusedRewardMs(outcome, usedCheckpoint, details.checkpointUnusedRewardMs);
  return {
    packId: session.packId,
    stageId: session.currentStageId,
    stageIndex: session.stageIndex,
    runnerPlayerId: roles.runnerPlayerId,
    builderPlayerId: roles.builderPlayerId,
    outcome,
    failReason: outcome === 'fail' ? normalizeFailureReason(details.reason) : null,
    timeLimitMs: normalizeMs(details.timeLimitMs),
    timeClearedMs,
    checkpointUnusedRewardMs: rewardMs,
    finalStageTimeMs: finalStageTimeMs(outcome, timeClearedMs, rewardMs),
    runnerDeaths: normalizeCount(details.runnerDeaths ?? details.deaths),
    runnerRepositions: normalizeCount(details.runnerRepositions),
    toolUseCount: normalizeCount(details.toolUseCount ?? details.toolsPlaced),
    checkpointPlaced: details.checkpointPlaced === true,
    checkpointActivated: details.checkpointActivated === true,
    checkpointUsedForRespawn: usedCheckpoint,
    builderRuleId: typeof details.builderRuleId === 'string' && details.builderRuleId ? details.builderRuleId : 'standard',
    builderRuleLabel: typeof details.builderRuleLabel === 'string' && details.builderRuleLabel ? details.builderRuleLabel : 'Standard build rules',
    totalActiveToolCap: Number.isFinite(Number(details.totalActiveToolCap)) ? Math.max(0, Math.floor(Number(details.totalActiveToolCap))) : null,
    activeCapsSnapshot: cloneObject(details.activeCapsSnapshot),
    enabledToolsSnapshot: cloneObject(details.enabledToolsSnapshot),
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
  return recordStageResult(session, 'fail', { ...details, reason });
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
  const failedStages = results.filter((result) => result.outcome === 'fail').length;
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
