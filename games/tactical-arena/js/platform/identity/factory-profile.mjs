const FACTORY_PROFILE_STORAGE_KEY = "javascript-game-factory.factoryProfile";
const FACTORY_PROFILE_NAME_MAX_LENGTH = 12;
const FACTORY_PROFILE_VERSION = 1;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function readStorageText(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorageText(storage, key, value) {
  try {
    storage?.setItem?.(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function removeStorageText(storage, key) {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

function getDefaultStorage(root = globalThis.window) {
  const storage = root?.localStorage;
  return storage
    && typeof storage.getItem === "function"
    && typeof storage.setItem === "function"
    && typeof storage.removeItem === "function"
    ? storage
    : null;
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

function getStorageKey(options = {}) {
  return typeof options.storageKey === "string" && options.storageKey.trim()
    ? options.storageKey
    : FACTORY_PROFILE_STORAGE_KEY;
}

function getPlayerIdGenerator(options = {}) {
  return typeof options.playerIdGenerator === "function"
    ? options.playerIdGenerator
    : defaultPlayerIdGenerator;
}

function parseStoredProfile(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = sanitizeSingleLine(entry, 120);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildDefaultFriendCode(playerId, attempt = 0) {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 80);
  if (!normalizedPlayerId) return "";
  const source = `${normalizedPlayerId}#${Math.max(0, Math.floor(Number(attempt) || 0))}`;
  const left = hashString(`${source}:left`).toString(36).toUpperCase();
  const right = hashString(`${source}:right`).toString(36).toUpperCase();
  return `${left}${right}`.replace(/[^A-Z0-9]/g, "").padStart(8, "0").slice(0, 8);
}

export { FACTORY_PROFILE_NAME_MAX_LENGTH, FACTORY_PROFILE_STORAGE_KEY, FACTORY_PROFILE_VERSION };

export function sanitizeFactoryProfileName(value) {
  return sanitizeSingleLine(value, FACTORY_PROFILE_NAME_MAX_LENGTH);
}

export function normalizeFactoryProfile(profile = {}, options = {}) {
  const source = isPlainObject(profile) ? profile : {};
  const playerId = sanitizeSingleLine(source.playerId, 120) || getPlayerIdGenerator(options)();
  const seededProfileName = sanitizeFactoryProfileName(options.seedProfileName || "");
  const profileName = sanitizeFactoryProfileName(source.profileName || "") || seededProfileName;
  const friendCode = sanitizeSingleLine(source.friendCode, 16).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  return {
    version: FACTORY_PROFILE_VERSION,
    playerId,
    profileName,
    friendCode: friendCode || buildDefaultFriendCode(playerId),
    realName: sanitizeSingleLine(source.realName, 48),
    bio: typeof source.bio === "string" ? source.bio.replace(/\r\n?/g, "\n").trim().slice(0, 280) : "",
    tagline: sanitizeSingleLine(source.tagline, 80),
    avatarAssetId: sanitizeSingleLine(source.avatarAssetId, 120),
    avatarUrl: sanitizeSingleLine(source.avatarUrl, 280),
    backgroundImageUrl: sanitizeSingleLine(source.backgroundImageUrl, 280),
    backgroundStyle: sanitizeSingleLine(source.backgroundStyle, 32),
    presence: sanitizeSingleLine(source.presence, 24).toLowerCase() || "offline",
    favoriteGameSlug: sanitizeSingleLine(source.favoriteGameSlug, 80),
    ladderPlacements: Array.isArray(source.ladderPlacements) ? source.ladderPlacements.slice() : [],
    friendsPreview: Array.isArray(source.friendsPreview) ? source.friendsPreview.slice() : [],
    mainSqueeze: isPlainObject(source.mainSqueeze) ? { ...source.mainSqueeze } : null,
    badgeIds: normalizeStringList(source.badgeIds),
    favorites: normalizeStringList(source.favorites),
    friends: normalizeStringList(source.friends),
    recentPartners: normalizeStringList(source.recentPartners),
    links: Array.isArray(source.links) ? source.links.slice() : [],
    preferences: isPlainObject(source.preferences) ? { ...source.preferences } : {},
    profileMusicPlaylist: Array.isArray(source.profileMusicPlaylist) ? source.profileMusicPlaylist.slice(0, 5) : [],
  };
}

export function createDefaultFactoryProfile(options = {}) {
  return normalizeFactoryProfile({}, options);
}

export function saveFactoryProfile(profile, storage = getDefaultStorage(), options = {}) {
  const normalized = normalizeFactoryProfile(profile, options);
  writeStorageText(storage, getStorageKey(options), JSON.stringify(normalized));
  return normalized;
}

export function loadFactoryProfile(storage = getDefaultStorage(), options = {}) {
  const key = getStorageKey(options);
  const raw = readStorageText(storage, key);
  const normalized = normalizeFactoryProfile(parseStoredProfile(raw), options);
  const serialized = JSON.stringify(normalized);
  if (serialized !== raw) writeStorageText(storage, key, serialized);
  return normalized;
}

export function bindFactoryProfileToSession(playerId, storage = getDefaultStorage(), options = {}) {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 120);
  if (!normalizedPlayerId) return null;
  const current = loadFactoryProfile(storage, options);
  if (current.playerId !== normalizedPlayerId) removeStorageText(storage, getStorageKey(options));
  return saveFactoryProfile({
    ...(current.playerId === normalizedPlayerId ? current : {}),
    playerId: normalizedPlayerId,
    ...(typeof options.profileName === "string" && options.profileName.trim()
      ? { profileName: options.profileName }
      : {}),
  }, storage, options);
}
