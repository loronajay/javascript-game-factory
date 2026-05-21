import { sanitizeFactoryProfileName } from '../../../js/platform/identity/factory-profile.mjs';

const DISPLAY_NAME_MAX = 12;

export function buildOnlineIdentity(factoryProfile) {
  const name = sanitizeFactoryProfileName(factoryProfile?.profileName || '').slice(0, DISPLAY_NAME_MAX);
  return {
    playerId:    typeof factoryProfile?.playerId === 'string' ? factoryProfile.playerId : '',
    displayName: name || 'Player',
  };
}
