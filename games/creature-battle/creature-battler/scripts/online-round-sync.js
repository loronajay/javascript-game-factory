// online-round-sync.js — deterministic, round-addressed lockstep helpers.
// This module owns protocol bookkeeping only; battle-round.js owns playback and UI.

const CB_ONLINE_SIDES = new Set(['alpha', 'beta']);
const CB_BATTLE_SIDES = new Set(['player', 'opponent']);
const CB_ACTION_SLOTS = new Set(['top', 'middle', 'bottom']);
const CB_COMMAND_TYPES = new Set(['attack', 'art', 'skill', 'defend']);

function _canonicalOnlineValue(value, sideMap = null) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sideMap?.[value] ?? value;
  if (Array.isArray(value)) return value.map(item => _canonicalOnlineValue(item, sideMap));
  if (typeof value !== 'object') return undefined;

  const result = {};
  Object.keys(value).sort().forEach(key => {
    // runtimeId is intentionally random on each client and has no gameplay meaning.
    if (key === 'runtimeId') return;
    const normalized = _canonicalOnlineValue(value[key], sideMap);
    if (normalized !== undefined) result[key] = normalized;
  });
  return result;
}

function _canonicalOnlineString(value, sideMap = null) {
  return JSON.stringify(_canonicalOnlineValue(value, sideMap));
}

function _isValidOnlineAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
  if (action.actorSide !== 'player' || !CB_ACTION_SLOTS.has(action.actorSlot)) return false;
  if (!CB_COMMAND_TYPES.has(action.commandType)) return false;
  if (action.targetSide != null && !CB_BATTLE_SIDES.has(action.targetSide)) return false;
  if (action.targetSlot != null && !CB_ACTION_SLOTS.has(action.targetSlot)) return false;
  if (action.moveId != null && typeof action.moveId !== 'string') return false;
  if (action.speed != null && !Number.isFinite(action.speed)) return false;
  return true;
}

function _isValidActionList(actions) {
  if (!Array.isArray(actions) || actions.length > 3) return false;
  if (!actions.every(_isValidOnlineAction)) return false;
  return new Set(actions.map(action => action.actorSlot)).size === actions.length;
}

function decorateOnlineActions(actions, networkSide, fromRemote) {
  if (!CB_ONLINE_SIDES.has(networkSide) || !_isValidActionList(actions)) return null;
  return actions.map(action => ({
    ...action,
    actorSide: fromRemote ? 'opponent' : 'player',
    targetSide: fromRemote
      ? (action.targetSide === 'player' ? 'opponent' : action.targetSide === 'opponent' ? 'player' : null)
      : action.targetSide,
    networkSide,
  }));
}

function hashOnlineBattleState(battleState, isCoordinator, rngState = null) {
  const localSideMap = isCoordinator
    ? { player: 'alpha', opponent: 'beta' }
    : { player: 'beta', opponent: 'alpha' };
  const alphaLocalKey = isCoordinator ? 'player' : 'opponent';
  const betaLocalKey = isCoordinator ? 'opponent' : 'player';
  const normalized = {
    round: battleState?.round ?? null,
    arenaFile: battleState?.arenaFile ?? null,
    rngState,
    alpha: battleState?.[alphaLocalKey] ?? null,
    beta: battleState?.[betaLocalKey] ?? null,
    battleStats: {
      alpha: battleState?.battleStats?.[alphaLocalKey] ?? null,
      beta: battleState?.battleStats?.[betaLocalKey] ?? null,
    },
  };
  const text = _canonicalOnlineString(normalized, localSideMap);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createCbRoundSynchronizer() {
  const records = new Map();
  let activeRound = 1;

  function _record(round) {
    if (!records.has(round)) {
      records.set(round, {
        localActions: null,
        remoteActions: null,
        actionsResolved: false,
        localReadyHash: null,
        remoteReadyHash: null,
        barrierResolved: false,
      });
    }
    return records.get(round);
  }

  function _prune(round) {
    for (const key of records.keys()) {
      if (key < round - 1) records.delete(key);
    }
  }

  function _actionResult(round) {
    const record = _record(round);
    if (!record.localActions || !record.remoteActions) return { status: 'waiting' };
    if (record.actionsResolved) return { status: 'duplicate' };
    record.actionsResolved = true;
    return {
      status: 'ready',
      localActions: record.localActions,
      remoteActions: record.remoteActions,
    };
  }

  function _barrierResult(round) {
    const record = _record(round);
    if (!record.localReadyHash || !record.remoteReadyHash) return { status: 'waiting' };
    if (record.barrierResolved) return { status: 'duplicate' };
    record.barrierResolved = true;
    if (record.localReadyHash !== record.remoteReadyHash) {
      return {
        status: 'mismatch',
        localHash: record.localReadyHash,
        remoteHash: record.remoteReadyHash,
      };
    }
    return { status: 'ready', stateHash: record.localReadyHash };
  }

  return {
    reset(round = 1) {
      records.clear();
      activeRound = round;
    },

    beginRound(round) {
      if (!Number.isInteger(round) || round < 1) return { status: 'invalid' };
      activeRound = round;
      _prune(round);
      return _actionResult(round);
    },

    submitLocalActions(round, actions) {
      if (round !== activeRound || !_isValidActionList(actions)) return { status: 'invalid' };
      const record = _record(round);
      const fingerprint = _canonicalOnlineString(actions);
      if (record.localActions) {
        return _canonicalOnlineString(record.localActions) === fingerprint
          ? { status: 'duplicate' }
          : { status: 'conflict' };
      }
      record.localActions = actions.map(action => ({ ...action }));
      return _actionResult(round);
    },

    receiveRemoteActions(packet, currentRound = activeRound) {
      const round = packet?.round;
      const actions = packet?.actions;
      if (!Number.isInteger(round) || round < 1 || !_isValidActionList(actions)) return { status: 'invalid' };
      if (round < currentRound) return { status: 'stale' };
      if (round > currentRound + 1) return { status: 'invalid' };
      const record = _record(round);
      const fingerprint = _canonicalOnlineString(actions);
      if (record.remoteActions) {
        return _canonicalOnlineString(record.remoteActions) === fingerprint
          ? { status: 'duplicate' }
          : { status: 'conflict' };
      }
      record.remoteActions = actions.map(action => ({ ...action }));
      if (round !== activeRound) return { status: 'buffered' };
      return _actionResult(round);
    },

    markLocalReady(round, stateHash) {
      if (!Number.isInteger(round) || round < 1 || typeof stateHash !== 'string' || !stateHash) {
        return { status: 'invalid' };
      }
      const record = _record(round);
      if (record.localReadyHash) {
        return record.localReadyHash === stateHash ? { status: 'duplicate' } : { status: 'conflict' };
      }
      record.localReadyHash = stateHash;
      return _barrierResult(round);
    },

    receiveRemoteReady(packet, currentRound) {
      const round = packet?.round;
      const stateHash = packet?.stateHash;
      if (!Number.isInteger(round) || round < 1 || typeof stateHash !== 'string' || !stateHash) {
        return { status: 'invalid' };
      }
      if (Number.isInteger(currentRound) && round < currentRound) return { status: 'stale' };
      if (Number.isInteger(currentRound) && round > currentRound + 1) return { status: 'invalid' };
      const record = _record(round);
      if (record.remoteReadyHash) {
        return record.remoteReadyHash === stateHash ? { status: 'duplicate' } : { status: 'conflict' };
      }
      record.remoteReadyHash = stateHash;
      return _barrierResult(round);
    },
  };
}
