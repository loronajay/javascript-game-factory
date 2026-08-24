// The one place this cabinet touches `localStorage`.
//
// Browser storage throws far more often than it looks: private windows, blocked
// site data, quota, and a `localStorage` that exists but denies access on read.
// Every path here is guarded and degrades to in-memory, because losing a
// leaderboard is annoying and crashing the game over it is unacceptable.
//
// Taking the storage object as an argument is what makes the stores testable
// under `node`, where there is no `localStorage` at all.

/** A drop-in stand-in used when the real thing is unavailable or throws. */
export function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * The best storage available.
 *
 * Probed with a real write, not a feature check: Safari in private mode presents
 * a `localStorage` that exists and then throws on `setItem`.
 */
export function resolveStorage(candidate) {
  try {
    const storage = candidate ?? globalThis.localStorage;
    if (!storage) return createMemoryStorage();
    const probe = "__mini_hoops_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

export function readString(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Read and parse JSON, falling back on anything unparseable or of the wrong shape. */
export function readJSON(storage, key, fallback) {
  const raw = readString(storage, key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    // Guard the shape, not just the parse: storage is user-writable, and a
    // string where an object was expected would otherwise reach the renderer.
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(storage, key, value) {
  try {
    return writeString(storage, key, JSON.stringify(value));
  } catch {
    return false;
  }
}
