export const PLATFORM_STORAGE_KEYS = Object.freeze({
  factoryProfile: "javascript-game-factory.factoryProfile",
  profileMetrics: "javascript-game-factory.profileMetrics",
  profileRelationships: "javascript-game-factory.profileRelationships",
  profileRelationshipLedger: "javascript-game-factory.profileRelationshipLedger",
  activityFeed: "javascript-game-factory.activityFeed",
  thoughtFeed: "javascript-game-factory.thoughtFeed",
  thoughtComments: "javascript-game-factory.thoughtComments",
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

export function clearPlatformStorage(storage, keys = Object.values(PLATFORM_STORAGE_KEYS)) {
  if (!Array.isArray(keys)) return 0;

  let clearedCount = 0;
  const seen = new Set();
  keys.forEach((key) => {
    if (!isNonEmptyString(key) || seen.has(key)) return;
    seen.add(key);
    if (removeStorageText(storage, key)) {
      clearedCount += 1;
    }
  });
  return clearedCount;
}
