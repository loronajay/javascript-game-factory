import {
  FLEET_DEFS, resolveIncomingShot, isFleetDestroyed, recordShotResult, isCellShot,
} from './board.js';
import {
  renderFleetBoard, renderTargetBoard, renderBattleStatus, renderFleetStatus,
  renderOpponentFleetStatus, renderEmoteBubbles, showAnnouncement,
} from './renderer.js';
import { transitionToMatchEnded } from './match-flow.js';
import { createAudioController, getResolutionSoundId, LAUNCH_SOUND_ID } from './audio.js';
import { SHOT_ANIMATION_MS } from './presentation.js';
import { EMOTE_ASSET_PATHS, EMOTE_COOLDOWN_MS, EMOTE_DISPLAY_MS } from './emojis.js';

let pendingShotTimer = null;
let pendingShotTimerResult = null; // stored so handleIncomingShot can flush it early
let incomingShotTimer = null;
let emoteTimers = { mine: null, theirs: null };
let lastEmoteSentAt = 0;
const audio = createAudioController();

function clearPendingShotTimer() {
  if (pendingShotTimer !== null) {
    clearTimeout(pendingShotTimer);
    pendingShotTimer = null;
  }
  pendingShotTimerResult = null;
}

function clearIncomingShotTimer() {
  if (incomingShotTimer !== null) {
    clearTimeout(incomingShotTimer);
    incomingShotTimer = null;
  }
}

function clearEmoteTimers() {
  for (const side of ['mine', 'theirs']) {
    if (emoteTimers[side] !== null) {
      clearTimeout(emoteTimers[side]);
      emoteTimers[side] = null;
    }
  }
}

export function clearBattleTimers() {
  clearPendingShotTimer();
  clearIncomingShotTimer();
  clearEmoteTimers();
}

export function showBattleEmote(gs, side, emoteType) {
  if (!EMOTE_ASSET_PATHS[emoteType]) return;
  gs.activeEmotes = { ...gs.activeEmotes, [side]: emoteType };
  renderEmoteBubbles(gs);

  if (emoteTimers[side] !== null) clearTimeout(emoteTimers[side]);
  emoteTimers[side] = setTimeout(() => {
    emoteTimers[side] = null;
    gs.activeEmotes = { ...gs.activeEmotes, [side]: null };
    renderEmoteBubbles(gs);
  }, EMOTE_DISPLAY_MS);
}

export function trySendBattleEmote(gs, net, type) {
  if (gs.phase !== 'battle' || !net) return;
  const now = Date.now();
  if (now - lastEmoteSentAt < EMOTE_COOLDOWN_MS) return;
  lastEmoteSentAt = now;
  net.sendEmote(type);
  showBattleEmote(gs, 'mine', type);
}

export function handleTargetClick(gs, net, col, row) {
  if (gs.turn !== 'mine') return;
  if (isCellShot(gs.myTarget, col, row)) return;
  clearPendingShotTimer();
  gs.turn = 'awaiting_result';
  gs.pendingShot = { col, row, startedAt: Date.now() };
  audio.play(LAUNCH_SOUND_ID);
  net.sendShot(col, row);
  renderBattleStatus(gs);
  renderTargetBoard(gs);
}

function applyShotResult(gs, { clearAll }, { col, row, hit, sunk, shipId, fleetDestroyed }) {
  pendingShotTimer = null;
  gs.myTarget = recordShotResult(gs.myTarget, col, row, hit, sunk, shipId);
  gs.lastShotInfo = { hit, sunk, shipId };
  gs.pendingShot = null;
  audio.play(getResolutionSoundId(hit));

  const def = FLEET_DEFS.find(d => d.id === shipId);
  if (sunk && def) showAnnouncement(`💀 You sunk their ${def.name}!`);
  else if (hit)    showAnnouncement('💥 Direct hit!');
  else             showAnnouncement('💦 Splash! Missed.');

  renderTargetBoard(gs);
  renderOpponentFleetStatus(gs);

  if (fleetDestroyed) {
    transitionToMatchEnded(gs, 'win', { clearAll });
  } else if (gs.turn === 'awaiting_result') {
    // Only advance turn if still waiting — if an incoming shot arrived during the
    // animation delay, handleIncomingShot already set turn to 'mine'; don't stomp it.
    gs.turn = 'theirs';
    renderBattleStatus(gs);
  }
}

export function handleIncomingShot(gs, net, col, row, { clearAll }) {
  // If our own shot result is still animating, flush it now so turn state is
  // correct before processing the opponent's shot.
  if (pendingShotTimer !== null && pendingShotTimerResult !== null) {
    const flushedResult = pendingShotTimerResult;
    clearPendingShotTimer();
    applyShotResult(gs, { clearAll }, flushedResult);
  }

  const { valid, board, hit, shipId, sunk } = resolveIncomingShot(gs.myFleet, col, row);
  if (!valid) return;

  clearIncomingShotTimer();
  gs.incomingShot = { col, row };
  audio.play(LAUNCH_SOUND_ID);

  renderFleetBoard(gs);
  renderBattleStatus(gs);

  incomingShotTimer = setTimeout(() => {
    incomingShotTimer = null;
    gs.myFleet = board;
    gs.incomingShot = null;
    const fleetDestroyed = isFleetDestroyed(gs.myFleet);
    audio.play(getResolutionSoundId(hit));

    net.sendShotResult(col, row, hit, sunk, shipId, fleetDestroyed);

    renderFleetBoard(gs);
    renderFleetStatus(gs);

    if (fleetDestroyed) {
      transitionToMatchEnded(gs, 'loss', { clearAll });
    } else {
      gs.turn = 'mine';
      renderBattleStatus(gs);
      renderTargetBoard(gs);
    }
  }, SHOT_ANIMATION_MS);
}

export function handleShotResult(gs, result, { clearAll }) {
  const pendingShot = gs.pendingShot;
  if (!pendingShot) {
    applyShotResult(gs, { clearAll }, result);
    return;
  }

  const elapsed = Date.now() - pendingShot.startedAt;
  const remaining = Math.max(0, SHOT_ANIMATION_MS - elapsed);
  clearPendingShotTimer();
  pendingShotTimerResult = result;
  pendingShotTimer = setTimeout(() => {
    pendingShotTimerResult = null;
    applyShotResult(gs, { clearAll }, result);
  }, remaining);
}
