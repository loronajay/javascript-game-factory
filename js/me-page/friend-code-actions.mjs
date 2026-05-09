import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { sanitizeProfileFriendCode } from "../platform/profile/profile.mjs";
import { createFriendshipBetweenPlayers } from "../platform/relationships/relationships.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";

export async function addFriendByCode(friendCode, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options.apiClient || createPlatformApiClient();
  const currentProfile = loadFactoryProfile(storage);
  const normalizedFriendCode = sanitizeProfileFriendCode(friendCode);

  if (!normalizedFriendCode) {
    return { ok: false, message: "Enter a friend code first." };
  }

  if (!currentProfile?.playerId) {
    return { ok: false, message: "Your player profile is not ready yet." };
  }

  if (currentProfile.friendCode === normalizedFriendCode) {
    return { ok: false, message: "That is your friend code." };
  }

  if (typeof apiClient?.loadPlayerProfileByFriendCode !== "function") {
    return { ok: false, message: "Friend-code lookup is unavailable right now." };
  }

  const targetProfile = await apiClient.loadPlayerProfileByFriendCode(normalizedFriendCode);
  if (!targetProfile?.playerId) {
    return { ok: false, message: "No player matched that friend code." };
  }

  if (targetProfile.playerId === currentProfile.playerId) {
    return { ok: false, message: "That is your friend code." };
  }

  const result = await createFriendshipBetweenPlayers(currentProfile.playerId, targetProfile.playerId, {
    storage,
    apiClient,
  });

  const label = targetProfile.profileName || targetProfile.playerId || "that player";
  return {
    ok: true,
    message: result.awarded ? `Friend linked with ${label}.` : `${label} is already linked.`,
    targetProfile,
    relationshipResult: result,
  };
}
