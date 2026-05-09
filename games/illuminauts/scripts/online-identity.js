import { loadFactoryProfile, sanitizeFactoryProfileName } from '../../../js/platform/identity/factory-profile.mjs';

export function getLocalIdentity() {
  try {
    const profile = loadFactoryProfile();
    return {
      playerId: profile?.playerId || `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      displayName: (sanitizeFactoryProfileName(profile?.profileName || '') || 'Astronaut').slice(0, 12),
    };
  } catch {
    return {
      playerId: `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      displayName: 'Astronaut',
    };
  }
}
