import { normalizeProfileRelationshipsRecord } from "../relationships/relationships.mjs";
import type { ProfileRelationshipsRecord } from "../relationships/relationships-normalize.mjs";

// Friend-preview rows are API-shaped passthrough objects merged from several loose
// sources; they stay `any`. The structured inputs (relationships record, API client)
// are typed.
type FriendRow = Record<string, any>;

interface EnrichmentApiClient {
  loadPlayerProfile?: (playerId: string) => Promise<FriendRow | null>;
}

function sanitizePlayerId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasAvatarSignal(profile: FriendRow | null | undefined): boolean {
  return !!sanitizePlayerId(profile?.avatarAssetId) || !!sanitizePlayerId(profile?.avatarUrl);
}

function buildFetchedPreview(
  fetchedFriend: FriendRow,
  normalizedRelationships: ProfileRelationshipsRecord,
  fallback: FriendRow = {},
): FriendRow {
  const playerId = sanitizePlayerId(fetchedFriend?.playerId || fallback?.playerId);
  return {
    ...fallback,
    playerId,
    profileName: fetchedFriend?.profileName || fallback?.profileName || "Arcade Pilot",
    presence: fetchedFriend?.presence || fallback?.presence || "offline",
    friendPoints: normalizedRelationships.friendPointsByPlayerId[playerId] || fallback?.friendPoints || 0,
    avatarAssetId: fetchedFriend?.avatarAssetId || fallback?.avatarAssetId || "",
    avatarUrl: fetchedFriend?.avatarUrl || fallback?.avatarUrl || "",
  };
}

export async function enrichProfileFriendPreviewsFromApi(
  profile: FriendRow | null | undefined,
  relationshipsRecord: FriendRow | null | undefined,
  apiClient: EnrichmentApiClient | null | undefined,
): Promise<FriendRow | null | undefined> {
  const loadPlayerProfile = apiClient?.loadPlayerProfile;
  if (!loadPlayerProfile) return profile;

  const normalizedRelationships: ProfileRelationshipsRecord = normalizeProfileRelationshipsRecord(
    relationshipsRecord?.playerId ? relationshipsRecord : { playerId: profile?.playerId || "" },
  );
  const existingPreview: FriendRow[] = Array.isArray(profile?.friendsPreview) ? profile!.friendsPreview : [];
  const previewById = new Map<string, FriendRow>(
    existingPreview
      .map((friend): [string, FriendRow] => [sanitizePlayerId(friend?.playerId), friend])
      .filter(([playerId]) => !!playerId),
  );
  const candidateIds = new Set<string>(normalizedRelationships.friendPlayerIds);
  const mainSqueezeId = sanitizePlayerId(profile?.mainSqueeze?.playerId || normalizedRelationships.mainSqueezePlayerId);
  if (mainSqueezeId) {
    candidateIds.add(mainSqueezeId);
  }
  if (candidateIds.size === 0) return profile;

  const staleIds = Array.from(candidateIds)
    .filter(Boolean)
    .filter((playerId) => {
      const previewFriend = previewById.get(playerId);
      if (previewFriend) {
        return !hasAvatarSignal(previewFriend);
      }
      if (playerId === mainSqueezeId) {
        return !hasAvatarSignal(profile?.mainSqueeze);
      }
      return true;
    })
    .slice(0, 8);
  if (staleIds.length === 0) return profile;

  const fetchedProfiles = await Promise.all(staleIds.map((playerId) => loadPlayerProfile(playerId).catch(() => null)));
  const fetchedById = new Map<string, FriendRow>(
    fetchedProfiles
      .filter((entry): entry is FriendRow => !!sanitizePlayerId(entry?.playerId))
      .map((entry): [string, FriendRow] => [sanitizePlayerId(entry.playerId), entry]),
  );
  if (fetchedById.size === 0) return profile;

  const mergedPreview = existingPreview.map((friend) => {
    const playerId = sanitizePlayerId(friend?.playerId);
    const fetchedFriend = fetchedById.get(playerId);
    return fetchedFriend ? buildFetchedPreview(fetchedFriend, normalizedRelationships, friend) : friend;
  });

  const appendedPreview = Array.from(fetchedById.values())
    .filter((friend) => !previewById.has(friend.playerId) && friend.playerId !== mainSqueezeId)
    .map((friend) => buildFetchedPreview(friend, normalizedRelationships));

  const nextMainSqueeze = mainSqueezeId
    ? (() => {
        const fetchedMainSqueeze = fetchedById.get(mainSqueezeId);
        if (!fetchedMainSqueeze) return profile?.mainSqueeze || null;
        return buildFetchedPreview(fetchedMainSqueeze, normalizedRelationships, profile?.mainSqueeze || { playerId: mainSqueezeId });
      })()
    : (profile?.mainSqueeze || null);

  return {
    ...profile,
    friendsPreview: [...mergedPreview, ...appendedPreview],
    mainSqueeze: nextMainSqueeze,
  };
}
