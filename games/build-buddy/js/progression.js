export const BUILD_BUDDY_PROGRESS_STORAGE_KEY = 'buildBuddy.progression.v1';

const DEFAULT_PROGRESS = Object.freeze({
  version: 1,
  packs: Object.freeze({
    pack_01: Object.freeze({
      unlockedStageIds: Object.freeze(['pack_01_stage_01']),
    }),
  }),
});

function clone(value) {
  return structuredClone(value);
}

function normalizeProgression(value) {
  const next = clone(DEFAULT_PROGRESS);
  const packs = value && typeof value === 'object' && value.packs && typeof value.packs === 'object'
    ? value.packs
    : {};

  for (const [packId, pack] of Object.entries(packs)) {
    if (!pack || typeof pack !== 'object') continue;
    const unlocked = Array.isArray(pack.unlockedStageIds)
      ? pack.unlockedStageIds.filter((stageId) => typeof stageId === 'string' && stageId)
      : [];
    next.packs[packId] = {
      unlockedStageIds: [...new Set([...(next.packs[packId]?.unlockedStageIds ?? []), ...unlocked])],
    };
  }

  return next;
}

export function createMemoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
  };
}

export function loadProgression(storage = globalThis.localStorage) {
  if (!storage) return normalizeProgression(null);
  try {
    const raw = storage.getItem(BUILD_BUDDY_PROGRESS_STORAGE_KEY);
    if (!raw) return normalizeProgression(null);
    return normalizeProgression(JSON.parse(raw));
  } catch {
    return normalizeProgression(null);
  }
}

export function saveProgression(storage = globalThis.localStorage, progression) {
  if (!storage) return;
  storage.setItem(BUILD_BUDDY_PROGRESS_STORAGE_KEY, JSON.stringify(normalizeProgression(progression)));
}

export function getUnlockedStageIds(progression, packId) {
  return [...(normalizeProgression(progression).packs[packId]?.unlockedStageIds ?? [])];
}

export function isStageUnlocked(progression, packId, stageId) {
  return getUnlockedStageIds(progression, packId).includes(stageId);
}

export function recordCanonStageClear(progression, { packId, stageId, nextStageId, isCanonRun } = {}) {
  const next = normalizeProgression(progression);
  if (!isCanonRun || !packId || !stageId) return next;

  const pack = next.packs[packId] ?? { unlockedStageIds: [] };
  const stageIdsToUnlock = [stageId];
  if (typeof nextStageId === 'string' && nextStageId) stageIdsToUnlock.push(nextStageId);

  next.packs[packId] = {
    unlockedStageIds: [...new Set([...pack.unlockedStageIds, ...stageIdsToUnlock])],
  };
  return next;
}
