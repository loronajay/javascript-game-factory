function ensureFallbackId() {
  const existing = localStorage.getItem("bird-duty-player-id");
  if (existing) return existing;
  const id = `bird_${Math.random().toString(16).slice(2, 10)}`;
  localStorage.setItem("bird-duty-player-id", id);
  return id;
}

function fallbackIdentity() {
  return {
    playerId: localStorage.getItem("bird-duty-player-id") || ensureFallbackId(),
    displayName: "Player",
  };
}

export async function loadArcadeIdentity() {
  try {
    const [profileMod, matchMod] = await Promise.all([
      import("../../../js/platform/identity/factory-profile.mjs"),
      import("../../../js/platform/identity/match-identity.mjs"),
    ]);
    const profile = profileMod.loadFactoryProfile?.();
    const payload = matchMod.createOnlineIdentityPayload
      ? matchMod.createOnlineIdentityPayload(profile)
      : matchMod.createMatchIdentity?.(profile);
    if (payload?.displayName || payload?.effectiveMatchName) {
      return {
        playerId: payload.playerId || "",
        displayName: payload.displayName || payload.effectiveMatchName || "Player",
      };
    }
  } catch {
    // Standalone fallback for direct file/local server play.
  }
  return fallbackIdentity();
}
