function fallbackIdentity() {
  const stored = localStorage.getItem('echo-duel-name') || '';
  return {
    playerId: localStorage.getItem('echo-duel-player-id') || ensureFallbackId(),
    displayName: stored.trim().slice(0, 18) || 'Player',
  };
}

function ensureFallbackId() {
  const existing = localStorage.getItem('echo-duel-player-id');
  if (existing) return existing;
  const id = `echo_${Math.random().toString(16).slice(2, 10)}`;
  localStorage.setItem('echo-duel-player-id', id);
  return id;
}

export async function loadArcadeIdentity() {
  try {
    const [profileMod, matchMod] = await Promise.all([
      import('../../../js/platform/identity/factory-profile.mjs'),
      import('../../../js/platform/identity/match-identity.mjs'),
    ]);
    const profile = profileMod.loadFactoryProfile?.();
    const payload = matchMod.createOnlineIdentityPayload
      ? matchMod.createOnlineIdentityPayload(profile)
      : matchMod.createMatchIdentity?.(profile);
    if (payload?.displayName || payload?.effectiveMatchName) {
      return {
        playerId: payload.playerId || '',
        displayName: payload.displayName || payload.effectiveMatchName || 'Player',
      };
    }
  } catch {
    // Standalone/local fallback.
  }
  return fallbackIdentity();
}
