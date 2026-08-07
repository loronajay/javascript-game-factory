// The two stereo settings worth remembering between visits.
//
// Volume and repeat mode are things the player decided about the *stereo*, not
// about a folder or a run, so they outlive both. The folder itself is not here:
// a directory handle is not a string and lives in IndexedDB, which `library.js`
// owns.
//
// Every path is defensive because storage can be unavailable (private windows,
// blocked third-party storage, a quota that is already full) and losing a
// volume setting must never cost the player the cabinet.

import { DEFAULT_VOLUME, LOOP_ALL, LOOP_MODES } from "./playlist.js";

const KEY = "speed-demon:radio";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself throws when storage is blocked
  }
}

/** Whatever was saved, sanitised, with defaults for anything missing or bad. */
export function loadRadioPreferences() {
  const fallback = { loop: LOOP_ALL, volume: DEFAULT_VOLUME };
  const store = storage();
  if (!store) {
    return fallback;
  }
  try {
    const saved = JSON.parse(store.getItem(KEY) ?? "null");
    if (!saved || typeof saved !== "object") {
      return fallback;
    }
    return {
      loop: LOOP_MODES.includes(saved.loop) ? saved.loop : fallback.loop,
      volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : fallback.volume,
    };
  } catch {
    return fallback;
  }
}

/** Takes a whole radio state and stores only the two fields that survive. */
export function saveRadioPreferences(radio) {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(KEY, JSON.stringify({ loop: radio.loop, volume: radio.volume }));
  } catch {
    // Full or blocked. The setting still applies for this session.
  }
}
