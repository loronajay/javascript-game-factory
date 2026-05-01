import { getOppositeMatchSide } from './online.js';
import { showScreen } from './renderer.js';
import { loadFactoryProfile } from '../../../js/platform/identity/factory-profile.mjs';
import { createOnlineIdentityPayload } from '../../../js/platform/identity/match-identity.mjs';

const PUBLIC_MATCH_RETRY_MS = 2500;

let publicMatchRetryTimer = null;

export function clearPublicMatchRetry() {
  if (publicMatchRetryTimer !== null) {
    clearTimeout(publicMatchRetryTimer);
    publicMatchRetryTimer = null;
  }
}

export function schedulePublicMatchRetry(gs, net) {
  clearPublicMatchRetry();
  if (gs.matchmakingMode !== 'public' || gs.phase !== 'matchmaking' || !net) return;

  publicMatchRetryTimer = setTimeout(() => {
    publicMatchRetryTimer = null;
    if (gs.matchmakingMode !== 'public' || gs.phase !== 'matchmaking' || !net) return;

    gs.mySide = getOppositeMatchSide(gs.mySide);
    const statusEl = document.getElementById('matchmaking-status');
    if (statusEl) statusEl.textContent = `Still searching... retrying as ${gs.mySide}.`;
    net.findMatch(gs.mySide);
  }, PUBLIC_MATCH_RETRY_MS);
}

function loadIdentity() {
  const profile = loadFactoryProfile();
  return createOnlineIdentityPayload(profile);
}

export function startPublicMatch(gs, net) {
  gs.mySide  = Math.random() < 0.5 ? 'alpha' : 'beta';
  gs.matchmakingMode = 'public';
  gs.myProfile = loadIdentity();
  gs.pendingNetAction = () => net.findMatch(gs.mySide);

  net.setIdentity(gs.myProfile);
  net.connect();

  showScreen('matchmaking');
  gs.phase = 'matchmaking';
}

export function startPrivateCreate(gs, net) {
  gs.mySide  = 'alpha';
  gs.matchmakingMode = 'private_create';
  gs.myProfile = loadIdentity();
  gs.pendingNetAction = () => net.createRoom(gs.mySide);

  net.setIdentity(gs.myProfile);
  net.connect();

  gs.phase = 'matchmaking';
}

export function startPrivateJoin(gs, net, code) {
  gs.mySide  = 'beta';
  gs.matchmakingMode = 'private_join';
  gs.myProfile = loadIdentity();
  gs.pendingNetAction = () => net.joinRoom(gs.mySide, code);

  net.setIdentity(gs.myProfile);
  net.connect();

  showScreen('matchmaking');
  gs.phase = 'matchmaking';
}
