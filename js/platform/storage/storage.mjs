export const PLATFORM_STORAGE_KEYS = Object.freeze({
  factoryProfile: "javascript-game-factory.factoryProfile",
  activityFeed: "javascript-game-factory.activityFeed",
  thoughtFeed: "javascript-game-factory.thoughtFeed",
  loversLostLegacyOnlineName: "lovers-lost.onlineIdentity.displayName",
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStorageLike(value) {
  return !!value
    && typeof value.getItem === "function"
    && typeof value.setItem === "function"
    && typeof value.removeItem === "function";
}

export function getPlatformStorageKey(name) {
  return Object.prototype.hasOwnProperty.call(PLATFORM_STORAGE_KEYS, name)
    ? PLATFORM_STORAGE_KEYS[name]
    : "";
}

export function getDefaultPlatformStorage(root = globalThis.window) {
  const storage = root?.localStorage;
  return isStorageLike(storage) ? storage : null;
}

export function readStorageText(storage, key) {
  if (!isNonEmptyString(key)) return null;

  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorageText(storage, key, value) {
  if (!isNonEmptyString(key)) return false;

  try {
    storage?.setItem?.(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorageText(storage, key) {
  if (!isNonEmptyString(key)) return false;

  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}
