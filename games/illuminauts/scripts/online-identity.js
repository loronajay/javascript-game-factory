function createFallbackIdentity() {
  return {
    playerId: `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    displayName: 'Astronaut',
  };
}

export async function getLocalIdentity({
  profileModulePromise = import('../../../js/platform/identity/factory-profile.mjs')
} = {}) {
  try {
    const { loadFactoryProfile, sanitizeFactoryProfileName } = await profileModulePromise;
    const profile = loadFactoryProfile();
    return {
      playerId: profile?.playerId || createFallbackIdentity().playerId,
      displayName: (sanitizeFactoryProfileName(profile?.profileName || '') || 'Astronaut').slice(0, 12),
    };
  } catch {
    return createFallbackIdentity();
  }
}
