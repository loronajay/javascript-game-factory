function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function syncRankedPilotProfile({ apiClient, loadProfile } = {}) {
  if (!apiClient?.isConfigured || typeof apiClient.savePlayerProfile !== "function" || typeof loadProfile !== "function") {
    return null;
  }

  let profile = null;
  try {
    profile = loadProfile();
  } catch {
    return null;
  }

  const playerId = cleanText(profile?.playerId);
  const profileName = cleanText(profile?.profileName);
  if (!playerId || !profileName) return null;

  try {
    // Ranked only needs the canonical display name. Sending the whole origin-local
    // profile is destructive after a domain move because the new origin starts with
    // blank avatar/music/background fields.
    return await apiClient.savePlayerProfile(playerId, { profileName });
  } catch {
    return null;
  }
}
