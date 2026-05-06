function fallbackIdentity() {
  const storedName = localStorage.getItem("circuit-siege-name") || "";
  const storedPlayerId = localStorage.getItem("circuit-siege-player-id") || "";
  const playerId = storedPlayerId || `circuit_${Math.random().toString(16).slice(2, 10)}`;
  localStorage.setItem("circuit-siege-player-id", playerId);

  return {
    playerId,
    displayName: storedName.trim().slice(0, 18) || "Player"
  };
}

export async function loadCircuitSiegeIdentity() {
  try {
    const [profileMod, matchMod] = await Promise.all([
      import("../../../js/platform/identity/factory-profile.mjs"),
      import("../../../js/platform/identity/match-identity.mjs")
    ]);

    const profile = profileMod.loadFactoryProfile?.();
    const payload = matchMod.createOnlineIdentityPayload?.(profile);
    if (payload?.displayName) {
      return {
        playerId: payload.playerId || "",
        displayName: payload.displayName
      };
    }
  } catch {
    // Fall through to standalone fallback identity.
  }

  return fallbackIdentity();
}
