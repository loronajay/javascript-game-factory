import { sanitizeFactoryProfileName } from '../../../js/platform/identity/factory-profile.mjs';
import { createMatchIdentity } from '../../../js/platform/identity/match-identity.mjs';

const ONLINE_NAME_MAX_LEN = 12;

function sanitizeOnlinePlayerId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeOnlineDisplayName(value) {
  return sanitizeFactoryProfileName(value).slice(0, ONLINE_NAME_MAX_LEN);
}

function isValidOnlineDisplayName(value) {
  return sanitizeOnlineDisplayName(value).length > 0;
}

function buildOnlineIdentity(factoryProfile, runOverrideName = '') {
  const identity = createMatchIdentity(factoryProfile, runOverrideName);
  return {
    playerId: identity.playerId,
    profileName: identity.profileName,
    runOverrideName: identity.runOverrideName,
    displayName: identity.effectiveMatchName,
  };
}

function deriveOnlineRunOverrideName(factoryProfile, value) {
  const displayName = sanitizeOnlineDisplayName(value);
  const canonicalName = sanitizeOnlineDisplayName(factoryProfile?.profileName || '');
  if (!displayName || displayName === canonicalName) return '';
  return displayName;
}

function formatOnlinePlayerLabel(side, identity) {
  const sideLabel = side === 'girl' ? 'Girl' : 'Boy';
  const name = sanitizeOnlineDisplayName(identity?.displayName || '');
  return name ? `${name} (${sideLabel})` : sideLabel;
}

function attachOnlineResultIdentities(runSummary, localSide, localIdentity, remoteSide, remoteIdentity) {
  if (!runSummary) return runSummary;
  const summary = { ...runSummary };
  if (localSide === 'boy') summary.boyIdentity = {
    playerId: sanitizeOnlinePlayerId(localIdentity?.playerId || ''),
    displayName: sanitizeOnlineDisplayName(localIdentity?.displayName || ''),
  };
  if (localSide === 'girl') summary.girlIdentity = {
    playerId: sanitizeOnlinePlayerId(localIdentity?.playerId || ''),
    displayName: sanitizeOnlineDisplayName(localIdentity?.displayName || ''),
  };
  if (remoteSide === 'boy') summary.boyIdentity = {
    playerId: sanitizeOnlinePlayerId(remoteIdentity?.playerId || ''),
    displayName: sanitizeOnlineDisplayName(remoteIdentity?.displayName || ''),
  };
  if (remoteSide === 'girl') summary.girlIdentity = {
    playerId: sanitizeOnlinePlayerId(remoteIdentity?.playerId || ''),
    displayName: sanitizeOnlineDisplayName(remoteIdentity?.displayName || ''),
  };
  return summary;
}

export {
  ONLINE_NAME_MAX_LEN,
  sanitizeOnlinePlayerId,
  sanitizeOnlineDisplayName,
  isValidOnlineDisplayName,
  buildOnlineIdentity,
  deriveOnlineRunOverrideName,
  formatOnlinePlayerLabel,
  attachOnlineResultIdentities,
};
