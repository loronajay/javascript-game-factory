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
    return await apiClient.savePlayerProfile(playerId, { ...profile, profileName });
  } catch {
    return null;
  }
}
