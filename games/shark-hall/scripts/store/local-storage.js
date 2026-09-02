// The only file in the cabinet that touches localStorage.
//
// One adapter, so everything else talks about settings rather than about
// serialization and quota errors. `tests/modules.test.js` enforces it.
//
// IT NEVER THROWS. Storage is absent in private windows on some browsers, is
// blocked outright by some settings, and throws on write when a quota is full.
// A cabinet that cannot remember a preference must still play, so every path
// here degrades to a default rather than propagating.

const NAMESPACE = "shark-hall";

function storage() {
  try {
    const store = globalThis.localStorage;
    // Touching it is the only reliable test: the object can exist and still
    // throw on access when site data is blocked.
    if (!store) return null;
    const probe = `${NAMESPACE}:probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function readJson(key, fallback = null) {
  const store = storage();
  if (!store) return fallback;
  try {
    const raw = store.getItem(`${NAMESPACE}:${key}`);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
