export const PLATFORM_STORAGE_KEYS = Object.freeze({
  factoryProfile: "javascript-game-factory.factoryProfile",
  profileMetrics: "javascript-game-factory.profileMetrics",
  profileRelationships: "javascript-game-factory.profileRelationships",
  profileRelationshipLedger: "javascript-game-factory.profileRelationshipLedger",
  activityFeed: "javascript-game-factory.activityFeed",
  thoughtFeed: "javascript-game-factory.thoughtFeed",
  thoughtComments: "javascript-game-factory.thoughtComments",
  loversLostLegacyOnlineName: "lovers-lost.onlineIdentity.displayName",
  loversLostPbBoy:  "lovers-lost.pb.boy",
  loversLostPbGirl: "lovers-lost.pb.girl",
  echoDuelPbSolo:   "echo-duel.pb.solo",
} as const);

export type PlatformStorageKeyName = keyof typeof PLATFORM_STORAGE_KEYS;

/** Minimal Web Storage surface this module relies on (Storage is structurally compatible). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type MaybeStorage = StorageLike | null | undefined;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStorageLike(value: unknown): value is StorageLike {
  return !!value
    && typeof (value as StorageLike).getItem === "function"
    && typeof (value as StorageLike).setItem === "function"
    && typeof (value as StorageLike).removeItem === "function";
}

export function getPlatformStorageKey(name: string): string {
  return Object.prototype.hasOwnProperty.call(PLATFORM_STORAGE_KEYS, name)
    ? PLATFORM_STORAGE_KEYS[name as PlatformStorageKeyName]
    : "";
}

export function getDefaultPlatformStorage(root = globalThis.window): StorageLike | null {
  const storage = root?.localStorage;
  return isStorageLike(storage) ? storage : null;
}

export function readStorageText(storage: MaybeStorage, key: string): string | null {
  if (!isNonEmptyString(key)) return null;

  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorageText(storage: MaybeStorage, key: string, value: unknown): boolean {
  if (!isNonEmptyString(key)) return false;

  try {
    storage?.setItem?.(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorageText(storage: MaybeStorage, key: string): boolean {
  if (!isNonEmptyString(key)) return false;

  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
}

export function clearPlatformStorage(
  storage: MaybeStorage,
  keys: string[] = Object.values(PLATFORM_STORAGE_KEYS),
): number {
  if (!Array.isArray(keys)) return 0;

  let clearedCount = 0;
  const seen = new Set<string>();
  keys.forEach((key) => {
    if (!isNonEmptyString(key) || seen.has(key)) return;
    seen.add(key);
    if (removeStorageText(storage, key)) {
      clearedCount += 1;
    }
  });
  return clearedCount;
}
