import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import { buildDefaultFriendCode, normalizeProfileFields } from "../profile/profile.mjs";

export const FACTORY_PROFILE_VERSION = 1;
export const FACTORY_PROFILE_STORAGE_KEY = getPlatformStorageKey("factoryProfile");
export const FACTORY_PROFILE_NAME_MAX_LENGTH = 12;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeCachedUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createFallbackPlayerId() {
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultPlayerIdGenerator() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return createFallbackPlayerId();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    const item = typeof entry === "string" ? entry.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function getStorageKey(options) {
  return typeof options?.storageKey === "string" && options.storageKey.trim()
    ? options.storageKey
    : FACTORY_PROFILE_STORAGE_KEY;
}

function getPlayerIdGenerator(options) {
  return typeof options?.playerIdGenerator === "function"
    ? options.playerIdGenerator
    : defaultPlayerIdGenerator;
}

function getDefaultStorage() {
  return getDefaultPlatformStorage();
}

function parseStoredProfile(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function sanitizeFactoryProfileName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, FACTORY_PROFILE_NAME_MAX_LENGTH);
}

export function normalizeFactoryProfile(profile = {}, options = {}) {
  const source = isPlainObject(profile) ? profile : {};
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
  };
}

export function createDefaultFactoryProfile(options = {}) {
  return normalizeFactoryProfile({}, options);
}

export function saveFactoryProfile(profile, storage = getDefaultStorage(), options = {}) {
  const normalized = normalizeFactoryProfile(profile, options);

  // Storage failures should not block the game shell or launcher.
  writeStorageText(storage, getStorageKey(options), JSON.stringify(normalized));

  return normalized;
}

export function loadFactoryProfile(storage = getDefaultStorage(), options = {}) {
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
