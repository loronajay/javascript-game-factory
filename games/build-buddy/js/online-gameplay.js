import {
  advanceSession,
  buildRunSummary,
  createOnlineRunSession,
  getCurrentRoles,
  recordStageClear,
  recordStageFailure,
} from './session.js';

export const ONLINE_GAMEPLAY_PROTOCOL_VERSION = 1;

const BUILDER_TOOL_TYPES = new Set([
  'platform',
  'springYellow',
  'springGreen',
  'springBlue',
  'checkpoint',
]);

function clone(value) {
  return structuredClone(value);
}

function boundedText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength).trim() || fallback;
}

function normalizeTick(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function normalizeCoordinate(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === 'true' || value === 'yes';
}

function normalizeOutcome(value) {
  return value === 'clear' ? 'clear' : 'fail';
}

function normalizeAction(value) {
  return value === 'delete' ? 'delete' : 'place';
}

function rejectMessage(state, reason, message = {}) {
  return {
    ...state,
    rejectedMessages: [
      ...state.rejectedMessages,
      {
        reason,
        messageType: message.messageType ?? null,
        senderId: message.senderId ?? '',
      },
    ],
  };
}

function resultDetailsFromValue(value = {}) {
  return {
    ...value,
    reason: value.reason ?? value.failReason,
    elapsedMs: value.elapsedMs ?? value.timeClearedMs,
  };
}

function buildStageResultValue(state, result) {
  return {
    protocolVersion: ONLINE_GAMEPLAY_PROTOCOL_VERSION,
    runId: state.runId,
    authorityPlayerId: state.authorityPlayerId,
    packId: result.packId,
    stageId: result.stageId,
    stageIndex: result.stageIndex,
    outcome: result.outcome,
    failReason: result.failReason,
    runnerPlayerId: result.runnerPlayerId,
    builderPlayerId: result.builderPlayerId,
    elapsedMs: result.timeClearedMs,
    timeLimitMs: result.timeLimitMs,
    runnerDeaths: result.runnerDeaths,
    runnerRepositions: result.runnerRepositions,
    toolUseCount: result.toolUseCount,
  };
}

function recordResultOnCurrentStage(state, outcome, reason, details = {}) {
  const recorded = outcome === 'clear'
    ? recordStageClear(state.session, details)
    : recordStageFailure(state.session, reason ?? details.reason ?? details.failReason, details);
  const result = recorded.stageResults.find((entry) => entry.stageIndex === recorded.stageIndex) ?? null;
  const advanced = advanceSession(recorded);
  return { recorded, advanced, result };
}

function createPostResultMessage(state) {
  if (state.session.isComplete) {
    return {
      messageType: 'run_complete',
      value: {
        protocolVersion: ONLINE_GAMEPLAY_PROTOCOL_VERSION,
        runId: state.runId,
        authorityPlayerId: state.authorityPlayerId,
        summary: buildRunSummary(state.session),
      },
    };
  }
  return createStageStartMessage(state);
}

export function createOnlineGameplayState({
  packId,
  stageSequence,
  players,
  localPlayerId,
  authorityPlayerId,
  runId = `run_${Date.now().toString(36)}`,
} = {}) {
  const session = createOnlineRunSession({ packId, stageSequence, players });
  const authority = boundedText(authorityPlayerId, session.players[0]?.id ?? '', 64);
  const local = boundedText(localPlayerId, '', 64);
  return {
    runId: boundedText(runId, 'run', 80),
    localPlayerId: local,
    authorityPlayerId: authority,
    isHost: !!local && local === authority,
    session,
    stageStarted: false,
    connectionStatus: 'connected',
    disconnectedPlayerId: '',
    stageResult: null,
    runSummary: null,
    lastStateSync: null,
    outboundMessages: [],
    rejectedMessages: [],
  };
}

export function createStageStartMessage(state, { seed = 0, startAt = null } = {}) {
  return {
    messageType: 'stage_start',
    value: {
      protocolVersion: ONLINE_GAMEPLAY_PROTOCOL_VERSION,
      runId: state.runId,
      packId: state.session.packId,
      stageId: state.session.currentStageId,
      stageIndex: state.session.stageIndex,
      roles: getCurrentRoles(state.session),
      seed: normalizeTick(seed),
      startAt,
      authorityPlayerId: state.authorityPlayerId,
    },
  };
}

export function createRunnerInputMessage(input = {}) {
  return {
    messageType: 'runner_input',
    value: {
      tick: normalizeTick(input.tick),
      left: normalizeBoolean(input.left),
      right: normalizeBoolean(input.right),
      up: normalizeBoolean(input.up),
      down: normalizeBoolean(input.down),
      jump: normalizeBoolean(input.jump),
      reposition: normalizeBoolean(input.reposition),
    },
  };
}

export function createBuilderCommandMessage(command = {}) {
  const tick = normalizeTick(command.tick);
  const action = normalizeAction(command.action);
  const gridX = normalizeCoordinate(command.gridX);
  const gridY = normalizeCoordinate(command.gridY);
  const toolType = action === 'place' && BUILDER_TOOL_TYPES.has(command.toolType) ? command.toolType : null;
  const fallbackCommandId = `cmd_${tick}_${action}_${gridX}_${gridY}`;
  return {
    messageType: 'builder_command',
    value: {
      tick,
      commandId: boundedText(command.commandId, fallbackCommandId, 80),
      action,
      toolType,
      gridX,
      gridY,
    },
  };
}

export function createStateSyncMessage(snapshot = {}) {
  const runner = snapshot.runner && typeof snapshot.runner === 'object'
    ? {
      x: Number(snapshot.runner.x) || 0,
      y: Number(snapshot.runner.y) || 0,
      vx: Number(snapshot.runner.vx) || 0,
      vy: Number(snapshot.runner.vy) || 0,
      dead: snapshot.runner.dead === true,
    }
    : null;
  const tools = Array.isArray(snapshot.tools)
    ? snapshot.tools.map((tool) => ({
      id: boundedText(tool?.id, 'tool', 80),
      toolType: boundedText(tool?.toolType, 'platform', 32),
      x: Number(tool?.x) || 0,
      y: Number(tool?.y) || 0,
      active: tool?.active !== false,
    }))
    : [];
  return {
    messageType: 'state_sync',
    value: {
      tick: normalizeTick(snapshot.tick),
      runner,
      tools,
      timerMs: Number.isFinite(Number(snapshot.timerMs)) ? Math.max(0, Number(snapshot.timerMs)) : 0,
      stageStatus: boundedText(snapshot.stageStatus, 'playing', 32),
    },
  };
}

export function recordAuthoritativeStageResult(state, { outcome = 'fail', reason = 'failure', details = {} } = {}) {
  if (!state.isHost) return rejectMessage(state, 'local_client_is_not_authority', { messageType: 'stage_result' });

  const normalizedOutcome = normalizeOutcome(outcome);
  const { advanced, result } = recordResultOnCurrentStage(state, normalizedOutcome, reason, details);
  const next = {
    ...state,
    session: advanced,
    stageResult: result,
    runSummary: advanced.isComplete ? buildRunSummary(advanced) : null,
  };
  const outboundMessages = result
    ? [
      { messageType: 'stage_result', value: buildStageResultValue(state, result) },
      createPostResultMessage(next),
    ]
    : [];
  return {
    ...next,
    outboundMessages: [...next.outboundMessages, ...outboundMessages],
  };
}

export function receiveStageResultMessage(state, message = {}) {
  if (message.senderId !== state.authorityPlayerId) return rejectMessage(state, 'sender_is_not_authority', message);

  const value = message.value ?? {};
  if (value.stageId !== state.session.currentStageId || Number(value.stageIndex) !== state.session.stageIndex) {
    return rejectMessage(state, 'stage_result_does_not_match_current_stage', message);
  }

  const normalizedOutcome = normalizeOutcome(value.outcome);
  const { advanced, result } = recordResultOnCurrentStage(
    state,
    normalizedOutcome,
    value.reason ?? value.failReason,
    resultDetailsFromValue(value),
  );
  return {
    ...state,
    session: advanced,
    stageResult: result,
    runSummary: advanced.isComplete ? buildRunSummary(advanced) : null,
  };
}

export function receiveStageStartMessage(state, message = {}) {
  if (message.senderId !== state.authorityPlayerId) return rejectMessage(state, 'sender_is_not_authority', message);

  const value = message.value ?? {};
  if (value.stageId !== state.session.currentStageId || Number(value.stageIndex) !== state.session.stageIndex) {
    return rejectMessage(state, 'stage_start_does_not_match_current_stage', message);
  }

  return {
    ...state,
    runId: boundedText(value.runId, state.runId, 80),
    stageStarted: true,
    stageStartAt: value.startAt ?? null,
  };
}

export function receiveStateSyncMessage(state, message = {}) {
  if (message.senderId !== state.authorityPlayerId) return rejectMessage(state, 'sender_is_not_authority', message);
  return {
    ...state,
    lastStateSync: clone(message.value ?? {}),
  };
}

export function receiveRunCompleteMessage(state, message = {}) {
  if (message.senderId !== state.authorityPlayerId) return rejectMessage(state, 'sender_is_not_authority', message);
  const summary = message.value?.summary && typeof message.value.summary === 'object'
    ? clone(message.value.summary)
    : buildRunSummary({ ...state.session, isComplete: true });
  return {
    ...state,
    session: {
      ...state.session,
      isComplete: true,
    },
    runSummary: summary,
  };
}

export function markOnlineGameplayDisconnected(state, playerId = '') {
  return {
    ...state,
    connectionStatus: 'disconnected',
    disconnectedPlayerId: boundedText(playerId, '', 64),
  };
}
