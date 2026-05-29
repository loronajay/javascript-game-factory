import {
  clearPlatformStorage,
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import type { StorageLike } from "../storage/storage.mjs";
import { buildDefaultFriendCode, normalizeProfileFields, normalizeProfileMusicPlaylist } from "../profile/profile.mjs";
import type {
  LadderPlacement,
  FriendPreview,
  ProfileLink,
  MusicTrack,
  ProfilePresence,
  ProfileBackgroundStyle,
} from "../profile/profile.mjs";

export const FACTORY_PROFILE_VERSION = 1;
export const FACTORY_PROFILE_STORAGE_KEY = getPlatformStorageKey("factoryProfile");
export const FACTORY_PROFILE_NAME_MAX_LENGTH = 12;

export interface FactoryProfile {
  version: number;
  playerId: string;
  profileName: string;
  friendCode: string;
  realName: string;
  bio: string;
  tagline: string;
  avatarAssetId: string;
  avatarUrl: string;
  backgroundImageUrl: string;
  backgroundStyle: ProfileBackgroundStyle;
  presence: ProfilePresence;
  favoriteGameSlug: string;
  ladderPlacements: LadderPlacement[];
  friendsPreview: FriendPreview[];
  mainSqueeze: FriendPreview | null;
  badgeIds: string[];
  favorites: string[];
  friends: string[];
  recentPartners: string[];
  links: ProfileLink[];
  preferences: Record<string, unknown>;
  profileMusicPlaylist: MusicTrack[];
}

export interface NormalizeFactoryProfileOptions {
  storageKey?: string;
  playerIdGenerator?: () => string;
  seedProfileName?: string;
  profileName?: string;
}

type MaybeStorage = StorageLike | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeCachedUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createFallbackPlayerId(): string {
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultPlayerIdGenerator(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return createFallbackPlayerId();
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const item = typeof entry === "string" ? entry.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function getStorageKey(options: NormalizeFactoryProfileOptions): string {
  return typeof options?.storageKey === "string" && options.storageKey.trim()
    ? options.storageKey
    : FACTORY_PROFILE_STORAGE_KEY;
}

function getPlayerIdGenerator(options: NormalizeFactoryProfileOptions): () => string {
  return typeof options?.playerIdGenerator === "function"
    ? options.playerIdGenerator
    : defaultPlayerIdGenerator;
}

function getDefaultStorage(): MaybeStorage {
  return getDefaultPlatformStorage();
}

function parseStoredProfile(raw: string | null): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function sanitizeFactoryProfileName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, FACTORY_PROFILE_NAME_MAX_LENGTH);
}

export function normalizeFactoryProfile(
  profile: unknown = {},
  options: NormalizeFactoryProfileOptions = {},
): FactoryProfile {
  const source: Record<string, any> = isPlainObject(profile) ? profile : {};
  const playerIdGenerator = getPlayerIdGenerator(options);
  const seededProfileName = sanitizeFactoryProfileName(options.seedProfileName || "");
  const playerId = typeof source.playerId === "string" ? source.playerId.trim() : "";
  const resolvedPlayerId = playerId || playerIdGenerator();
  const profileName = sanitizeFactoryProfileName(source.profileName || "") || seededProfileName;
  const profileFields = normalizeProfileFields(source);

  return {
    version: FACTORY_PROFILE_VERSION,
    playerId: resolvedPlayerId,
    profileName,
    friendCode: profileFields.friendCode || buildDefaultFriendCode(resolvedPlayerId),
    realName: profileFields.realName,
    bio: profileFields.bio,
    tagline: profileFields.tagline,
    avatarAssetId: profileFields.avatarAssetId,
    avatarUrl: sanitizeCachedUrl(source.avatarUrl),
    backgroundImageUrl: profileFields.backgroundImageUrl,
    backgroundStyle: profileFields.backgroundStyle,
    presence: profileFields.presence,
    favoriteGameSlug: profileFields.favoriteGameSlug,
    ladderPlacements: profileFields.ladderPlacements,
    friendsPreview: profileFields.friendsPreview,
    mainSqueeze: profileFields.mainSqueeze,
    badgeIds: profileFields.badgeIds,
    favorites: normalizeStringList(source.favorites),
    friends: normalizeStringList(source.friends),
    recentPartners: normalizeStringList(source.recentPartners),
    links: profileFields.links,
    preferences: isPlainObject(source.preferences) ? { ...source.preferences } : {},
    profileMusicPlaylist: normalizeProfileMusicPlaylist(source.profileMusicPlaylist),
  };
}

export function createDefaultFactoryProfile(options: NormalizeFactoryProfileOptions = {}): FactoryProfile {
  return normalizeFactoryProfile({}, options);
}

export function saveFactoryProfile(
  profile: unknown,
  storage: MaybeStorage = getDefaultStorage(),
  options: NormalizeFactoryProfileOptions = {},
): FactoryProfile {
  const normalized = normalizeFactoryProfile(profile, options);

  // Storage failures should not block the game shell or launcher.
  writeStorageText(storage, getStorageKey(options), JSON.stringify(normalized));

  return normalized;
}

export function bindFactoryProfileToSession(
  playerId: string,
  storage: MaybeStorage = getDefaultStorage(),
  options: NormalizeFactoryProfileOptions = {},
): FactoryProfile | null {
  const normalizedPlayerId = typeof playerId === "string" ? playerId.trim() : "";
  if (!normalizedPlayerId) return null;

  const current = loadFactoryProfile(storage, options);
  const isSamePlayer = current.playerId === normalizedPlayerId;

  if (!isSamePlayer) {
    clearPlatformStorage(storage);
  }

  const nextProfile = isSamePlayer
    ? {
        ...current,
        playerId: normalizedPlayerId,
        ...(typeof options.profileName === "string" && options.profileName.trim()
          ? { profileName: options.profileName }
          : {}),
      }
    : {
        playerId: normalizedPlayerId,
        ...(typeof options.profileName === "string" && options.profileName.trim()
          ? { profileName: options.profileName }
          : {}),
      };

  return saveFactoryProfile(nextProfile, storage, options);
}

export function loadFactoryProfile(
  storage: MaybeStorage = getDefaultStorage(),
  options: NormalizeFactoryProfileOptions = {},
): FactoryProfile {
  const key = getStorageKey(options);
  const raw = readStorageText(storage, key);

  const normalized = normalizeFactoryProfile(parseStoredProfile(raw), options);
  const serialized = JSON.stringify(normalized);

  if (serialized !== raw) {
    // Storage failures should not block reads.
    writeStorageText(storage, key, serialized);
  }

  return normalized;
}
