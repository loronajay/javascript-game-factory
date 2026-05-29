import {
  loadFactoryProfile,
  saveFactoryProfile,
} from "../platform/identity/factory-profile.mjs";
import {
  loadProfileRelationshipsRecord,
  saveProfileRelationshipsRecord,
} from "../platform/relationships/relationships.mjs";
import {
  loadProfileMetricsRecord,
  saveProfileMetricsRecord,
} from "../platform/metrics/metrics.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import type { PlatformApiClient } from "../platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import type { StorageLike } from "../platform/storage/storage.mjs";

type MaybeStorage = StorageLike | null;

export interface ProfileFieldsInput {
  profileName?: string;
  realName?: string;
  bio?: string;
  tagline?: string;
  avatarAssetId?: string;
  avatarUrl?: string;
  backgroundImageUrl?: string;
  backgroundStyle?: string;
  favoriteGameSlug?: string;
  links?: any[];
  profileMusicPlaylist?: any[];
  discoverable?: boolean;
  mainSqueezeMode?: string;
  mainSqueezePlayerId?: string;
  friendRailMode?: string;
  manualFriendSlotPlayerIds?: string[];
  [key: string]: unknown;
}

interface HydrateResult {
  profile: any;
  relationshipsRecord: any;
  metricsRecord: any;
  usedApi: boolean;
  error?: string;
}

function hasOwn(source: any, key: string): boolean {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}

function hasRelationshipField(fields: ProfileFieldsInput = {}): boolean {
  return [
    "mainSqueezeMode",
    "mainSqueezePlayerId",
    "friendRailMode",
    "manualFriendSlotPlayerIds",
  ].some((key) => hasOwn(fields, key));
}

export function saveArcadeProfileName(storage: MaybeStorage, profileName: string, options: any = {}) {
  return saveArcadeProfileDetails(storage, { profileName }, options);
}

export function saveArcadeProfileDetails(storage: MaybeStorage, fields: ProfileFieldsInput = {}, options: any = {}) {
  const current = loadFactoryProfile(storage, options);
  const updatedPreferences: Record<string, unknown> = { ...(current.preferences || {}) };
  if (typeof fields.discoverable === "boolean") {
    updatedPreferences.discoverable = fields.discoverable;
  }
  const savedProfile = saveFactoryProfile({
    ...current,
    profileName: fields.profileName ?? current.profileName,
    realName: fields.realName ?? current.realName,
    bio: fields.bio ?? current.bio,
    tagline: fields.tagline ?? current.tagline,
    avatarAssetId: fields.avatarAssetId ?? current.avatarAssetId,
    avatarUrl: fields.avatarUrl ?? current.avatarUrl,
    backgroundImageUrl: fields.backgroundImageUrl ?? current.backgroundImageUrl,
    backgroundStyle: fields.backgroundStyle ?? current.backgroundStyle ?? 'blend',
    favoriteGameSlug: fields.favoriteGameSlug ?? current.favoriteGameSlug,
    links: fields.links ?? current.links,
    profileMusicPlaylist: fields.profileMusicPlaylist ?? current.profileMusicPlaylist,
    preferences: updatedPreferences,
  }, storage, options);

  if (hasRelationshipField(fields)) {
    const currentRelationships = loadProfileRelationshipsRecord(savedProfile.playerId, storage);
    saveProfileRelationshipsRecord({
      ...currentRelationships,
      playerId: savedProfile.playerId,
      mainSqueezeMode: fields.mainSqueezeMode ?? currentRelationships.mainSqueezeMode,
      mainSqueezePlayerId: fields.mainSqueezePlayerId ?? currentRelationships.mainSqueezePlayerId,
      friendRailMode: fields.friendRailMode ?? currentRelationships.friendRailMode,
      manualFriendSlotPlayerIds: fields.manualFriendSlotPlayerIds ?? currentRelationships.manualFriendSlotPlayerIds,
    }, storage);
  }

  return savedProfile;
}

export async function hydrateArcadeProfileFromApi(
  storage: MaybeStorage = getDefaultPlatformStorage(),
  apiClient: PlatformApiClient = createPlatformApiClient(),
  options: any = {},
): Promise<HydrateResult> {
  const currentProfile = loadFactoryProfile(storage, options);
  const currentRelationships = loadProfileRelationshipsRecord(currentProfile.playerId, storage);
  const currentMetrics = loadProfileMetricsRecord(currentProfile.playerId, storage);
  const playerId = currentProfile.playerId;
  const canLoad = playerId
    && apiClient
    && typeof apiClient.loadPlayerProfile === "function"
    && typeof apiClient.loadPlayerRelationships === "function"
    && typeof apiClient.loadPlayerMetrics === "function";

  if (!canLoad) {
    return {
      profile: currentProfile,
      relationshipsRecord: currentRelationships,
      metricsRecord: currentMetrics,
      usedApi: false,
    };
  }

  const [profileResult, relationshipsResult, metricsResult] = await Promise.all([
    apiClient.loadPlayerProfile(playerId).catch(() => null),
    apiClient.loadPlayerRelationships(playerId).catch(() => null),
    apiClient.loadPlayerMetrics(playerId).catch(() => null),
  ]);
  const profileMissingFriendCode = profileResult?.playerId === playerId && !profileResult.friendCode;
  const seededProfileResult = (!profileResult?.playerId || profileMissingFriendCode) && typeof apiClient.savePlayerProfile === "function"
    ? await apiClient.savePlayerProfile(playerId, currentProfile).catch(() => null)
    : null;
  const resolvedProfileResult = seededProfileResult?.playerId === playerId
    ? seededProfileResult
    : (profileResult?.playerId === playerId ? profileResult : null);

  if (!resolvedProfileResult?.playerId) {
    return {
      profile: null,
      relationshipsRecord: null,
      metricsRecord: null,
      usedApi: false,
      error: "profile_load_failed",
    };
  }

  const profile = saveFactoryProfile({ ...resolvedProfileResult, playerId }, storage, options);
  const relationshipsRecord = relationshipsResult?.playerId === playerId
    ? (saveProfileRelationshipsRecord({
        ...relationshipsResult,
        playerId,
      }, storage) || currentRelationships)
    : currentRelationships;
  const metricsRecord = metricsResult?.playerId === playerId
    ? (saveProfileMetricsRecord({
        ...metricsResult,
        playerId,
      }, storage) || currentMetrics)
    : currentMetrics;

  return {
    profile,
    relationshipsRecord,
    metricsRecord,
    usedApi: true,
  };
}

export async function persistArcadeProfileDetails(storage: MaybeStorage, fields: ProfileFieldsInput = {}, options: any = {}) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const currentProfile = loadFactoryProfile(storage, options);
  const playerId = currentProfile.playerId;

  if (!playerId || !apiClient?.isConfigured) {
    return saveArcadeProfileDetails(storage, fields, options);
  }

  // Keep the local cache updated while the canonical API write is in flight.
  const localMerged = saveArcadeProfileDetails(storage, fields, options);
  const relFields = hasRelationshipField(fields) ? loadProfileRelationshipsRecord(playerId, storage) : null;

  const [profileResult, relResult] = await Promise.allSettled([
    apiClient.savePlayerProfile(playerId, localMerged),
    relFields ? apiClient.savePlayerRelationships(playerId, relFields) : Promise.resolve(null),
  ]);

  if (profileResult.status !== "fulfilled" || !profileResult.value?.playerId) {
    throw new Error("Profile save failed");
  }

  const saved = saveFactoryProfile(profileResult.value, storage, options);

  if (relResult?.status === "fulfilled" && relResult.value?.playerId) {
    saveProfileRelationshipsRecord({ ...relResult.value, playerId }, storage);
  }

  return saved;
}
