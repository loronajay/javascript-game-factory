export const FACTORY_PROFILE_VERSION = 1;
export const FACTORY_PROFILE_STORAGE_KEY = "javascript-game-factory.factoryProfile";
export const FACTORY_PROFILE_NAME_MAX_LENGTH = 12;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
  const storage = globalThis.window?.localStorage;
  return storage && typeof storage.getItem === "function" ? storage : null;
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
  const profileName = sanitizeFactoryProfileName(source.profileName || "") || seededProfileName;

  return {
    version: FACTORY_PROFILE_VERSION,
    playerId: playerId || playerIdGenerator(),
    profileName,
    favorites: normalizeStringList(source.favorites),
    friends: normalizeStringList(source.friends),
    recentPartners: normalizeStringList(source.recentPartners),
    preferences: isPlainObject(source.preferences) ? { ...source.preferences } : {},
  };
}

export function createDefaultFactoryProfile(options = {}) {
  return normalizeFactoryProfile({}, options);
}

export function saveFactoryProfile(profile, storage = getDefaultStorage(), options = {}) {
  const normalized = normalizeFactoryProfile(profile, options);

  try {
    storage?.setItem?.(getStorageKey(options), JSON.stringify(normalized));
  } catch {
    // Storage failures should not block the game shell or launcher.
  }

  return normalized;
}

export function loadFactoryProfile(storage = getDefaultStorage(), options = {}) {
  const key = getStorageKey(options);
  let raw = null;

  try {
    raw = storage?.getItem?.(key) ?? null;
  } catch {
    raw = null;
  }

  const normalized = normalizeFactoryProfile(parseStoredProfile(raw), options);
  const serialized = JSON.stringify(normalized);

  if (serialized !== raw) {
    try {
      storage?.setItem?.(key, serialized);
    } catch {
      // Storage failures should not block reads.
    }
  }

  return normalized;
}
