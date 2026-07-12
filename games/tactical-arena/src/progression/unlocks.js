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

// Campaign skin-reward packs. A mission (currently only The Wandering Party) can grant
// ONE skin from a pack on its first clear; the choice is final and the pack can never be
// re-opened, so a player can't grind the mission for the rest of the pack. The chosen
// skin is folded into unlockedSkins the same way the tutorial reward skin is.
export const WANDERING_SKIN_PACK_ID = "wandering";
// Has-Been Heroes (campaign mission 12) grants the Mystic one of two curated looks
// after a friendly duel in town. Same one-final-pick rule as every campaign pack.
export const HASBEEN_MYSTIC_SKIN_PACK_ID = "hasbeen-mystic";
export const OUT_OF_RETIREMENT_SKIN_REWARDS = Object.freeze([
  Object.freeze({ type: "angel", slug: "summer-vibes" }),
  Object.freeze({ type: "paladin", slug: "summer-vibes" }),
]);
export const CAMPAIGN_SKIN_PACKS = Object.freeze({
  [WANDERING_SKIN_PACK_ID]: Object.freeze([
    Object.freeze({ type: "swordsman", slug: "wandering" }),
    Object.freeze({ type: "archer", slug: "wandering" }),
    Object.freeze({ type: "mystic", slug: "wandering" }),
    Object.freeze({ type: "magician", slug: "wandering" }),
  ]),
  [HASBEEN_MYSTIC_SKIN_PACK_ID]: Object.freeze([
    Object.freeze({ type: "mystic", slug: "sun-goddess" }),
    Object.freeze({ type: "mystic", slug: "lunar-goddess" }),
  ]),
});

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

function dedupeSkins(values) {
  const out = [];
  const seen = new Set();
  for (const skin of Array.isArray(values) ? values : []) {
    if (!skin || typeof skin !== "object" || typeof skin.type !== "string" || typeof skin.slug !== "string") continue;
    const key = `${skin.type}:${skin.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(Object.freeze({ type: skin.type, slug: skin.slug }));
  }
  return out;
}

// One granted skin per campaign pack, validated against that pack's choices. Stored as a
// { [packId]: {type, slug} } map so re-opening a pack can be rejected by presence alone.
function normalizeCampaignRewardSkins(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const [packId, choices] of Object.entries(CAMPAIGN_SKIN_PACKS)) {
    const chosen = value[packId];
    const match = chosen && typeof chosen === "object"
      ? choices.find((skin) => skin.type === chosen.type && skin.slug === chosen.slug) ?? null
      : null;
    if (match) out[packId] = Object.freeze({ type: match.type, slug: match.slug });
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
    campaignRewardSkins: {},
    campaignGrantedSkins: [],
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
  const campaignRewardSkins = normalizeCampaignRewardSkins(value.campaignRewardSkins);
  const campaignGrantedSkins = dedupeSkins(value.campaignGrantedSkins);
  // unlockedSkins is fully derived from the granted rewards (tutorial + campaign packs),
  // so it stays consistent no matter what an older/partial payload carried.
  const unlockedSkins = [];
  if (rewardGranted && selectedRewardSkin) unlockedSkins.push(selectedRewardSkin);
  for (const skin of Object.values(campaignRewardSkins)) unlockedSkins.push(skin);
  unlockedSkins.push(...campaignGrantedSkins);
  return {
    completedTutorials,
    rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
    selectedRewardSkin: rewardGranted ? selectedRewardSkin : null,
    rewardGranted,
    allTutorialsComplete,
    unlockedUnits: [...unlockedUnits],
    campaignRewardSkins,
    campaignGrantedSkins,
    unlockedSkins: dedupeSkins(unlockedSkins),
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

export function getCampaignSkinRewardChoices(packId) {
  return CAMPAIGN_SKIN_PACKS[packId] ?? null;
}

export function getCampaignSkinReward(storage = defaultStorage(), packId) {
  return readUnlockProgress(storage).campaignRewardSkins[packId] ?? null;
}

export function isCampaignSkinRewardGranted(storage = defaultStorage(), packId) {
  return Boolean(getCampaignSkinReward(storage, packId));
}

// Grant ONE skin from a campaign pack. Rejected if the pack is unknown, already granted
// (the choice is final — no grinding for the rest of the pack), or the choice is not one
// of the pack's skins.
export function selectCampaignRewardSkin(storage = defaultStorage(), packId, choice) {
  const progress = readUnlockProgress(storage);
  const choices = CAMPAIGN_SKIN_PACKS[packId];
  if (!choices) {
    return { accepted: false, errorCode: "INVALID_SKIN_PACK", progress };
  }
  if (progress.campaignRewardSkins[packId]) {
    return { accepted: false, errorCode: "CAMPAIGN_REWARD_ALREADY_GRANTED", progress };
  }
  const selected = choices.find((skin) => skin.type === choice?.type && skin.slug === choice?.slug) ?? null;
  if (!selected) {
    return { accepted: false, errorCode: "INVALID_CAMPAIGN_REWARD", progress };
  }
  const next = writeUnlockProgress(storage, {
    ...progress,
    campaignRewardSkins: { ...progress.campaignRewardSkins, [packId]: { type: selected.type, slug: selected.slug } },
  });
  return { accepted: true, progress: next };
}
