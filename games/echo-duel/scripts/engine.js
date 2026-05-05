import { INPUTS, PHASES, PLAYBACK_TIMING, timerSecondsForLength } from './config.js';
import { activePlayers, cloneState, findPlayerIndexById, firstActiveIndex, getOwner, nextActiveIndex } from './state.js';

function isValidInput(input) {
  return INPUTS.includes(String(input || '').toUpperCase());
}

function phaseTimer(length, now = performance.now(), settings) {
  const seconds = timerSecondsForLength(length, settings);
  return {
    startedAt: now,
    durationMs: seconds * 1000,
    endsAt: now + seconds * 1000,
  };
}


function advancePhaseMarker(next, phase, { newTurn = false } = {}) {
  next.phase = phase;
  next.phaseId = Number(next.phaseId || 0) + 1;
  if (newTurn) next.turnId = Number(next.turnId || 0) + 1;
  return next;
}

function appendTargetLengthFor(state) {
  const current = Number(state.activeSequence?.length || 0);
  const appendCount = Math.max(1, Number(state.settings?.patternAppendCount || 1));
  const maxLength = Math.max(current, Number(state.settings?.maxPatternLength || current));
  return Math.min(maxLength, current + appendCount);
}

function remainingAppendInputs(state) {
  return Math.max(0, Number(state.appendTargetLength || appendTargetLengthFor(state)) - Number(state.activeSequence?.length || 0));
}

function beginSignalPlayback(state, status = '') {
  const next = cloneState(state);
  const now = performance.now();
  const sequence = [...next.activeSequence].slice(0, Number(next.settings?.maxPatternLength || 10));
  const stepMs = Number(PLAYBACK_TIMING.stepMs || 450);
  const gapMs = Number(PLAYBACK_TIMING.gapMs || 120);
  const holdMs = Number(PLAYBACK_TIMING.holdMs || 700);
  const perInputMs = stepMs + gapMs;
  const totalMs = sequence.length * perInputMs + holdMs;
  advancePhaseMarker(next, PHASES.SIGNAL_PLAYBACK);
  next.activeSequence = sequence;
  next.timer = null;
  next.copyProgress = {};
  next.roundResults = [];
  next.playback = {
    id: `${next.turnId}:${next.phaseId}:${sequence.join('')}`,
    sequence,
    startedAt: now,
    createdAtEpochMs: Date.now(),
    stepMs,
    gapMs,
    holdMs,
    perInputMs,
    totalMs,
  };
  next.status = status || `Memorize the ${sequence.length}-input signal.`;
  return next;
}

function finishSignalPlayback(state) {
  const next = cloneState(state);
  next.playback = null;
  return beginChallengerCopy(next);
}

function setPlayerResult(players, playerId, result) {
  return players.map(player => player.id === playerId ? { ...player, lastResult: result } : player);
}

function clearPlayerResults(players) {
  return players.map(player => ({ ...player, lastResult: null }));
}

function awardLetter(state, playerIndex) {
  const next = cloneState(state);
  const player = next.players[playerIndex];
  if (!player || player.eliminated) return next;

  const nextLetter = next.settings.penaltyWord[player.letters.length] || '';
  player.letters += nextLetter;
  player.lastResult = 'fail';
  if (player.letters.length >= next.settings.penaltyWord.length) {
    player.eliminated = true;
    player.lastResult = 'eliminated';
  }
  return next;
}

function beginControl(state, ownerIndex, status = '') {
  const next = cloneState(state);
  const safeOwner = ownerIndex >= 0 ? ownerIndex : firstActiveIndex(next);
  advancePhaseMarker(next, PHASES.OWNER_CREATE_INITIAL, { newTurn: true });
  next.ownerIndex = safeOwner >= 0 ? safeOwner : 0;
  next.activeSequence = [];
  next.ownerDraft = [];
  next.ownerReplayIndex = 0;
  next.appendTargetLength = 0;
  next.copyProgress = {};
  next.roundResults = [];
  next.timer = null;
  next.playback = null;
  next.players = clearPlayerResults(next.players);
  next.status = status || `${getOwner(next)?.name || 'Owner'} has control. Create a 4-input pattern.`;
  return next;
}

function beginOwnerReplay(state) {
  const next = cloneState(state);
  advancePhaseMarker(next, PHASES.OWNER_REPLAY);
  next.ownerReplayIndex = 0;
  next.ownerDraft = [];
  next.appendTargetLength = 0;
  next.copyProgress = {};
  next.timer = phaseTimer(next.activeSequence.length, performance.now(), next.settings);
  next.playback = null;
  next.players = clearPlayerResults(next.players);
  next.status = `${getOwner(next)?.name || 'Owner'} must replay the ${next.activeSequence.length}-input sequence.`;
  return next;
}

function beginChallengerCopy(state) {
  const next = cloneState(state);
  advancePhaseMarker(next, PHASES.CHALLENGER_COPY);
  next.copyProgress = {};
  next.roundResults = [];
  next.players = clearPlayerResults(next.players);
  for (const player of next.players) {
    if (!player.eliminated && player.id !== getOwner(next)?.id) {
      next.copyProgress[player.id] = { index: 0, status: 'copying', finishedAt: null };
    }
  }
  next.timer = phaseTimer(next.activeSequence.length, performance.now(), next.settings);
  next.playback = null;
  const count = Object.keys(next.copyProgress).length;
  next.status = count > 1
    ? `${count} challengers copy the ${next.activeSequence.length}-input pattern.`
    : `Challenger copies the ${next.activeSequence.length}-input pattern.`;
  return next;
}

export function resolveCopyPhase(state) {
  return finishCopyPhase(state);
}

function finishCopyPhase(state) {
  let next = cloneState(state);
  const active = activePlayers(next);
  if (active.length <= 1) {
    advancePhaseMarker(next, PHASES.MATCH_OVER);
    next.winnerId = active[0]?.id || null;
    next.status = `${active[0]?.name || 'No one'} wins.`;
    next.timer = null;
    return next;
  }

  const owner = getOwner(next);
  const challengerIds = Object.keys(next.copyProgress || {});
  const successful = next.roundResults.filter(result => result.result === 'safe');
  const allChallengersSucceeded = challengerIds.length > 0 && successful.length === challengerIds.length;
  const reachedMax = next.activeSequence.length >= next.settings.maxPatternLength;

  if (!allChallengersSucceeded) {
    const ownerIndex = next.players.findIndex(player => player.id === owner?.id);
    return beginControl(
      next,
      ownerIndex >= 0 ? ownerIndex : next.ownerIndex,
      `${owner?.name || 'Owner'} keeps control. Not everyone copied it, so the signal resets.`
    );
  }

  if (reachedMax) {
    const fastest = [...successful].sort((a, b) => Number(a.finishedAt || 0) - Number(b.finishedAt || 0))[0];
    const winnerIndex = next.players.findIndex(player => player.id === fastest?.playerId);
    const safeIndex = winnerIndex >= 0 ? winnerIndex : nextActiveIndex(next, next.ownerIndex);
    return beginControl(next, safeIndex, `${next.players[safeIndex]?.name || 'Next player'} survived the 10-input chain and takes control.`);
  }

  next.status = `${owner?.name || 'Owner'} keeps control. Everyone copied it, so the signal can grow.`;
  return beginOwnerReplay(next);
}

function markChallengerResult(state, playerId, result) {
  let next = cloneState(state);
  const progress = next.copyProgress[playerId];
  if (!progress || progress.status !== 'copying') return next;

  progress.status = result;
  progress.finishedAt = performance.now();
  next.roundResults.push({ playerId, result, finishedAt: progress.finishedAt });

  const playerIndex = next.players.findIndex(player => player.id === playerId);
  if (result === 'fail') {
    next = awardLetter(next, playerIndex);
  } else {
    next.players = setPlayerResult(next.players, playerId, 'safe');
  }

  const active = activePlayers(next);
  if (active.length <= 1) {
    advancePhaseMarker(next, PHASES.MATCH_OVER);
    next.winnerId = active[0]?.id || null;
    next.status = `${active[0]?.name || 'No one'} wins.`;
    next.timer = null;
    return next;
  }

  const unresolved = Object.values(next.copyProgress).some(item => item.status === 'copying');
  if (!unresolved) return finishCopyPhase(next);

  const remaining = Object.values(next.copyProgress).filter(item => item.status === 'copying').length;
  next.status = `${remaining} challenger${remaining === 1 ? '' : 's'} still copying.`;
  return next;
}

function actorIndexForPhase(state, actorId) {
  if (actorId) return findPlayerIndexById(state, actorId);
  if (state.phase === PHASES.CHALLENGER_COPY) {
    const nextCopyingId = Object.entries(state.copyProgress || {}).find(([, progress]) => progress.status === 'copying')?.[0];
    return nextCopyingId ? findPlayerIndexById(state, nextCopyingId) : -1;
  }
  return state.ownerIndex;
}

export function handleInput(state, rawInput, actorId = null) {
  const input = String(rawInput || '').toUpperCase();
  if (!isValidInput(input)) return state;

  let next = cloneState(state);
  const actorIndex = actorIndexForPhase(next, actorId);
  const actor = next.players[actorIndex];
  const owner = getOwner(next);

  if (!actor || actor.eliminated) return state;

  if (next.phase === PHASES.OWNER_CREATE_INITIAL) {
    if (actor.id !== owner?.id && actor.clientId !== owner?.clientId) return state;
    next.ownerDraft.push(input);
    if (next.ownerDraft.length >= next.settings.startingPatternLength) {
      next.activeSequence = [...next.ownerDraft];
      next.ownerDraft = [];
      next.status = `${owner?.name || 'Owner'} set the starting pattern.`;
      return beginSignalPlayback(next, `${owner?.name || 'Owner'} set the starting signal. Memorize it.`);
    }
    next.status = `${owner?.name || 'Owner'} is creating the starting pattern.`;
    return next;
  }

  if (next.phase === PHASES.OWNER_REPLAY) {
    if (actor.id !== owner?.id && actor.clientId !== owner?.clientId) return state;
    const expected = next.activeSequence[next.ownerReplayIndex];
    if (input !== expected) {
      next.players = setPlayerResult(next.players, owner?.id, 'owner-fail');
      const passTo = nextActiveIndex(next, next.ownerIndex);
      return beginControl(next, passTo, `${owner?.name || 'Owner'} dropped their own pattern. Control passes.`);
    }

    next.ownerReplayIndex += 1;
    if (next.ownerReplayIndex >= next.activeSequence.length) {
      advancePhaseMarker(next, PHASES.OWNER_APPEND);
      next.appendTargetLength = appendTargetLengthFor(next);
      const needed = remainingAppendInputs(next);
      next.timer = phaseTimer(Math.max(1, needed), performance.now(), next.settings);
      next.status = `${owner?.name || 'Owner'} replayed it. Add ${needed} new input${needed === 1 ? '' : 's'}.`;
    } else {
      next.status = `${owner?.name || 'Owner'} replaying: ${next.ownerReplayIndex}/${next.activeSequence.length}.`;
    }
    return next;
  }

  if (next.phase === PHASES.OWNER_APPEND) {
    if (actor.id !== owner?.id && actor.clientId !== owner?.clientId) return state;
    if (!next.appendTargetLength || next.appendTargetLength <= next.activeSequence.length) {
      next.appendTargetLength = appendTargetLengthFor(next);
    }

    const maxLength = Number(next.settings?.maxPatternLength || next.appendTargetLength || next.activeSequence.length);
    next.appendTargetLength = Math.min(next.appendTargetLength, maxLength);
    if (next.activeSequence.length >= next.appendTargetLength || next.activeSequence.length >= maxLength) {
      next.status = `${owner?.name || 'Owner'} hit the ${maxLength}-input cap. Memorize it.`;
      next.appendTargetLength = 0;
      return beginSignalPlayback(next, `${owner?.name || 'Owner'} hit the ${maxLength}-input cap. Memorize it.`);
    }

    next.activeSequence.push(input);
    if (next.activeSequence.length > maxLength) {
      next.activeSequence = next.activeSequence.slice(0, maxLength);
    }

    const remaining = remainingAppendInputs(next);
    if (remaining > 0) {
      next.status = `${owner?.name || 'Owner'} adding inputs: ${next.activeSequence.length}/${next.appendTargetLength}.`;
      return next;
    }
    next.status = `${owner?.name || 'Owner'} extended the pattern to ${next.activeSequence.length}.`;
    next.appendTargetLength = 0;
    return beginSignalPlayback(next, `${owner?.name || 'Owner'} extended the signal to ${next.activeSequence.length}. Memorize it.`);
  }

  if (next.phase === PHASES.CHALLENGER_COPY) {
    if (actor.id === owner?.id || actor.clientId === owner?.clientId) return state;
    const progress = next.copyProgress[actor.id];
    if (!progress || progress.status !== 'copying') return state;

    const expected = next.activeSequence[progress.index];
    if (input !== expected) {
      return markChallengerResult(next, actor.id, 'fail');
    }

    progress.index += 1;
    if (progress.index >= next.activeSequence.length) {
      return markChallengerResult(next, actor.id, 'safe');
    }
    next.status = `${actor.name} copying: ${progress.index}/${next.activeSequence.length}.`;
    return next;
  }

  return next;
}

export function handleTimerExpired(state) {
  let next = cloneState(state);
  if (!next.timer) return next;

  if (next.phase === PHASES.OWNER_REPLAY || next.phase === PHASES.OWNER_APPEND) {
    const owner = getOwner(next);
    const passTo = nextActiveIndex(next, next.ownerIndex);
    return beginControl(next, passTo, `${owner?.name || 'Owner'} ran out of time. Control passes.`);
  }

  if (next.phase === PHASES.CHALLENGER_COPY) {
    const failingIds = Object.entries(next.copyProgress)
      .filter(([, progress]) => progress.status === 'copying')
      .map(([playerId]) => playerId);
    for (const playerId of failingIds) {
      next = markChallengerResult(next, playerId, 'fail');
      if (next.phase === PHASES.MATCH_OVER) return next;
    }
    return next;
  }

  return next;
}

export function tick(state, now = performance.now()) {
  if (state.phase === PHASES.SIGNAL_PLAYBACK && state.playback) {
    if (now >= state.playback.startedAt + state.playback.totalMs) return finishSignalPlayback(state);
    return state;
  }
  if (!state.timer) return state;
  if (now >= state.timer.endsAt) return handleTimerExpired(state);
  return state;
}

export function resetCurrentMatch(state) {
  const first = firstActiveIndex(state);
  return beginControl(state, first >= 0 ? first : 0, 'Match reset. Fresh control chain started.');
}
