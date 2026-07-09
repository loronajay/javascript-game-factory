export const TUTORIAL_PROGRESS_KEY = "tacticalArenaTutorialProgressV2";
export const LEGACY_TUTORIAL_PROGRESS_KEY = "tacticalArenaTutorialProgress";
export const TUTORIAL_JUGGERNAUT_REWARD_UNIT = "juggernaut";
export const STARTER_UNIT_TYPES = Object.freeze(["swordsman", "archer", "mystic", "magician"]);

export const TUTORIAL_REWARD_SKIN_CHOICES = Object.freeze([
  Object.freeze({ type: "juggernaut", slug: "bio-mech" }),
  Object.freeze({ type: "swordsman", slug: "medieval" }),
  Object.freeze({ type: "archer", slug: "desert-warrior" }),
  Object.freeze({ type: "mystic", slug: "enlightened" }),
  Object.freeze({ type: "magician", slug: "summer-vibes" }),
]);

function defaultStorage() {
  return globalThis.localStorage;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function normalizeRewardSkin(value) {
  if (!value || typeof value !== "object") return null;
  return TUTORIAL_REWARD_SKIN_CHOICES.find((skin) => skin.type === value.type && skin.slug === value.slug) ?? null;
}

function normalizeUnlockedSkins(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const skin = normalizeRewardSkin(value);
    if (!skin) continue;
    const key = `${skin.type}:${skin.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skin);
  }
  return out;
}

function progressFallback() {
  return {
    completedTutorials: [],
    rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
    selectedRewardSkin: null,
    rewardGranted: false,
    allTutorialsComplete: false,
    unlockedUnits: [...STARTER_UNIT_TYPES],
    unlockedSkins: [],
  };
}

export function normalizeUnlockProgress(value = {}) {
  const completedTutorials = uniqueStrings(value.completedTutorials);
  const allTutorialsComplete = Boolean(value.allTutorialsComplete);
  const selectedRewardSkin = normalizeRewardSkin(value.selectedRewardSkin);
  const rewardGranted = Boolean(value.rewardGranted && selectedRewardSkin);
  const unlockedUnits = new Set([...STARTER_UNIT_TYPES, ...uniqueStrings(value.unlockedUnits)]);
  if (allTutorialsComplete) unlockedUnits.add(TUTORIAL_JUGGERNAUT_REWARD_UNIT);
  const unlockedSkins = normalizeUnlockedSkins(value.unlockedSkins);
  if (rewardGranted && selectedRewardSkin) unlockedSkins.push(selectedRewardSkin);
  return {
    completedTutorials,
    rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
    selectedRewardSkin: rewardGranted ? selectedRewardSkin : null,
    rewardGranted,
    allTutorialsComplete,
    unlockedUnits: [...unlockedUnits],
    unlockedSkins: normalizeUnlockedSkins(unlockedSkins),
  };
}

export function readUnlockProgress(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(TUTORIAL_PROGRESS_KEY);
    if (!raw) return progressFallback();
    return normalizeUnlockProgress(JSON.parse(raw));
  } catch {
    return progressFallback();
  }
}

export function writeUnlockProgress(storage, progress) {
  const normalized = normalizeUnlockProgress(progress);
  try {
    storage?.setItem?.(TUTORIAL_PROGRESS_KEY, JSON.stringify(normalized));
  } catch {
    // Storage failures should not block menu or tutorial flow.
  }
  return normalized;
}

export function resetUnlockProgress(storage = defaultStorage()) {
  try {
    storage?.removeItem?.(TUTORIAL_PROGRESS_KEY);
    storage?.removeItem?.(LEGACY_TUTORIAL_PROGRESS_KEY);
  } catch {
    // Best-effort profile reset.
  }
  return progressFallback();
}

export function isProgressUnitUnlocked(type, storage = defaultStorage()) {
  return readUnlockProgress(storage).unlockedUnits.includes(type);
}

export function isProgressSkinUnlocked(type, slug, storage = defaultStorage()) {
  if (!slug) return true;
  return readUnlockProgress(storage).unlockedSkins.some((skin) => skin.type === type && skin.slug === slug);
}

export function selectTutorialRewardSkin(storage = defaultStorage(), choice) {
  const progress = readUnlockProgress(storage);
  if (!progress.allTutorialsComplete) {
    return { accepted: false, errorCode: "TUTORIAL_REWARD_LOCKED", progress };
  }
  if (progress.rewardGranted) {
    return { accepted: false, errorCode: "TUTORIAL_REWARD_ALREADY_GRANTED", progress };
  }
  const selectedRewardSkin = normalizeRewardSkin(choice);
  if (!selectedRewardSkin) {
    return { accepted: false, errorCode: "INVALID_TUTORIAL_REWARD", progress };
  }
  const next = writeUnlockProgress(storage, {
    ...progress,
    selectedRewardSkin,
    rewardGranted: true,
    unlockedSkins: [...progress.unlockedSkins, selectedRewardSkin],
  });
  return { accepted: true, progress: next };
}
