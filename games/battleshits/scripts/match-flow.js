import {
  buildBoardGrid, showScreen,
  renderFleetBoard, renderTargetBoard, renderBattleStatus, renderFleetStatus,
  renderOpponentFleetStatus, renderEmoteBubbles, renderPlacementBoard, renderShipRoster,
} from './renderer.js';
import { selectShip, handlePlacementClick, handlePlacementHover } from './placement.js';
import { FLEET_DEFS, isShipSunk, createFleetBoard, createTargetBoard } from './board.js';
import { getEndedScreenCopy } from './presentation.js';
import { publishBattleshitsMatchActivity } from '../../../js/platform/activity/activity.mjs';
import { createPlatformApiClient } from '../../../js/platform/api/platform-api.mjs';
import { createAuthApiClient } from '../../../js/platform/api/auth-api.mjs';

function determineTurnOrder(gs) {
  const alphaFirst = (gs.seed % 2) === 0;
  return (alphaFirst && gs.mySide === 'alpha') || (!alphaFirst && gs.mySide === 'beta')
    ? 'mine'
    : 'theirs';
}

export function buildMatchStats(myTarget, myFleet) {
  const shots = myTarget.filter(c => c !== null).length;
  const hits = myTarget.filter(c => c && (c.result === 'hit' || c.result === 'sunk')).length;
  const sunkIds = new Set(myTarget.filter(c => c?.result === 'sunk' && c.shipId).map(c => c.shipId));
  const shipsSunk = sunkIds.size;
  const shipsLost = FLEET_DEFS.filter(def => isShipSunk(myFleet, def.id)).length;
  return { shots, hits, shipsSunk, shipsLost };
}

function pct(hits, shots) {
  if (shots === 0) return '—';
  return `${Math.round((hits / shots) * 100)}%`;
}

// deps: { clearAll, handleTargetClick }
export function transitionToBattle(gs, { clearAll, handleTargetClick }) {
  clearAll();
  gs.phase = 'battle';
  gs.turn = determineTurnOrder(gs);
  gs.pendingShot = null;
  gs.activeEmotes = { mine: null, theirs: null };

  showScreen('battle');

  const fleetContainer  = document.getElementById('fleet-board-battle');
  const targetContainer = document.getElementById('target-board-battle');

  buildBoardGrid(fleetContainer, null, null);
  buildBoardGrid(targetContainer, handleTargetClick, null);

  renderFleetBoard(gs);
  renderTargetBoard(gs);
  renderBattleStatus(gs);
  renderFleetStatus(gs);
  renderOpponentFleetStatus(gs);
  renderEmoteBubbles(gs);
}

// deps: { clearAll }
export function transitionToMatchEnded(gs, result, { clearAll }) {
  clearAll();
  gs.phase = 'match_ended';
  gs.matchResult = result;

  if (gs.isSoloMode) {
    transitionToSoloEnded(gs, result);
  } else {
    transitionToOnlineEnded(gs, result);
  }
}

function transitionToSoloEnded(gs, result) {
  const titleEl   = document.getElementById('ended-title');
  const messageEl = document.getElementById('ended-message');
  const statsEl   = document.getElementById('ended-match-stats');
  const statusEl  = document.getElementById('rematch-status');
  const oppEl     = document.getElementById('ended-opponent-profile');

  const endedCopy = getEndedScreenCopy(result);
  if (titleEl)   titleEl.textContent   = endedCopy.title;
  if (messageEl) messageEl.textContent = endedCopy.message;
  if (statusEl)  statusEl.textContent  = '';
  if (oppEl)     oppEl.innerHTML       = '';

  const diffLabel = gs.botDifficulty
    ? gs.botDifficulty.charAt(0).toUpperCase() + gs.botDifficulty.slice(1)
    : '—';

  const player  = buildMatchStats(gs.myTarget, gs.myFleet);
  const botShots    = (gs.botTarget ?? []).filter(c => c !== null).length;
  const botHits     = (gs.botTarget ?? []).filter(c => c && (c.result === 'hit' || c.result === 'sunk')).length;
  const botSunkIds  = new Set((gs.botTarget ?? []).filter(c => c?.result === 'sunk' && c.shipId).map(c => c.shipId));
  const totalTurns  = player.shots + botShots;

  if (statsEl) {
    statsEl.innerHTML = `
      <dl class="ended-stats">
        <div class="ended-stat"><dt>Difficulty</dt><dd>${diffLabel}</dd></div>
        <div class="ended-stat"><dt>Total Turns</dt><dd>${totalTurns}</dd></div>
      </dl>
      <p class="ended-stats-heading">Your stats</p>
      <dl class="ended-stats">
        <div class="ended-stat"><dt>Shots</dt><dd>${player.shots}</dd></div>
        <div class="ended-stat"><dt>Hits</dt><dd>${player.hits}</dd></div>
        <div class="ended-stat"><dt>Accuracy</dt><dd>${pct(player.hits, player.shots)}</dd></div>
        <div class="ended-stat"><dt>Sunk</dt><dd>${player.shipsSunk}</dd></div>
      </dl>
      <p class="ended-stats-heading">Bot stats</p>
      <dl class="ended-stats">
        <div class="ended-stat"><dt>Shots</dt><dd>${botShots}</dd></div>
        <div class="ended-stat"><dt>Hits</dt><dd>${botHits}</dd></div>
        <div class="ended-stat"><dt>Accuracy</dt><dd>${pct(botHits, botShots)}</dd></div>
        <div class="ended-stat"><dt>Sunk</dt><dd>${botSunkIds.size}</dd></div>
      </dl>
    `;
  }

  // Show Change Difficulty button; hide rematch-status (not needed in solo)
  document.getElementById('btn-change-difficulty')?.classList.remove('hidden');

  showScreen('ended');
}

function transitionToOnlineEnded(gs, result) {
  publishBattleshitsMatchActivity({
    result,
    myProfile: gs.myProfile,
    opponentProfile: gs.opponentProfile,
    matchmakingMode: gs.matchmakingMode,
    roomCode: gs.roomCode,
    sessionId: `battleshits:${gs.roomCode || gs.matchmakingMode || 'match'}:${gs.seed ?? 0}`,
  });

  const titleEl      = document.getElementById('ended-title');
  const messageEl    = document.getElementById('ended-message');
  const statsEl      = document.getElementById('ended-match-stats');
  const statusEl     = document.getElementById('rematch-status');
  const oppProfileEl = document.getElementById('ended-opponent-profile');

  const endedCopy = getEndedScreenCopy(result);
  if (titleEl)   titleEl.textContent   = endedCopy.title;
  if (messageEl) messageEl.textContent = endedCopy.message;
  if (statusEl)  statusEl.textContent  = '';
  if (oppProfileEl) oppProfileEl.innerHTML = '';

  document.getElementById('btn-change-difficulty')?.classList.add('hidden');

  if (statsEl) {
    const { shots, hits, shipsSunk, shipsLost } = buildMatchStats(gs.myTarget, gs.myFleet);
    statsEl.innerHTML = `
      <dl class="ended-stats">
        <div class="ended-stat"><dt>Shots Fired</dt><dd>${shots}</dd></div>
        <div class="ended-stat"><dt>Direct Hits</dt><dd>${hits}</dd></div>
        <div class="ended-stat"><dt>Ships Sunk</dt><dd>${shipsSunk}</dd></div>
        <div class="ended-stat"><dt>Ships Lost</dt><dd>${shipsLost}</dd></div>
      </dl>
    `;
  }

  showScreen('ended');

  const oppPlayerId = gs.opponentProfile?.playerId;
  if (oppPlayerId && oppProfileEl) {
    const apiClient = createPlatformApiClient();
    const authClient = createAuthApiClient();
    Promise.all([
      apiClient.loadPlayerProfile(oppPlayerId),
      authClient.getSession(),
    ]).then(([oppProfile, session]) => {
      if (!oppProfile?.hasAccount) return;
      const profileUrl = `../../player/index.html?id=${encodeURIComponent(oppPlayerId)}`;
      const isSignedIn = Boolean(session?.ok && session?.playerId);
      const addFriendBtn = isSignedIn
        ? `<a class="ended-profile-action" href="${profileUrl}">Add Friend &rsaquo;</a>`
        : '';
      oppProfileEl.innerHTML = `
        <div class="ended-profile-chip">
          <span class="ended-profile-label">Opponent:</span>
          <a class="ended-profile-name" href="${profileUrl}">${oppProfile.profileName || oppPlayerId}</a>
          ${addFriendBtn}
        </div>
      `;
    }).catch(() => {});
  }
}
