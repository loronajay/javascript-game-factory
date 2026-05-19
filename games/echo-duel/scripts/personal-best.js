import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from '../../../js/platform/storage/storage.mjs';

const PB_KEY = getPlatformStorageKey('echoDuelPbSolo');

function load() {
  const storage = getDefaultPlatformStorage();
  const raw = readStorageText(storage, PB_KEY);
  if (!raw) return { highScore: null };
  try {
    const p = JSON.parse(raw);
    return { highScore: typeof p.highScore === 'number' ? p.highScore : null };
  } catch {
    return { highScore: null };
  }
}

function save(pb) {
  const storage = getDefaultPlatformStorage();
  writeStorageText(storage, PB_KEY, JSON.stringify(pb));
}

export function updateSoloPb(score) {
  const prevPb = load();
  const isNew = prevPb.highScore === null || score > prevPb.highScore;
  const pb = { highScore: isNew ? score : prevPb.highScore };
  if (isNew) save(pb);
  return { isNew, pb, prevPb };
}

export function loadSoloPb() {
  return load();
}
