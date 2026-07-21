import {
  buildCampaignSkinChoiceClaim,
  buildCampaignUnitChoiceClaim,
  buildTutorialSkinChoiceClaim,
  enqueueGameProgressClaim,
} from "../platform/gameProgressClient.js";
import {
  BROTHERS_MISSION_ID,
  CAMPAIGN_PROGRESS_KEY,
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  GARGOYLE_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  MINER_MISSION_ID,
  MONK_MISSION_ID,
  NECROMANCER_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  PALADIN_MISSION_ID,
  RONIN_MISSION_ID,
  SHOWDOWN_FAT_TYPES,
  SHOWDOWN_MISSION_ID,
  SNIPER_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  VIRUS_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  VOIDWOOD_SKIN_REWARDS,
  VOID_CASTLE_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  WITCH_DOCTOR_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
} from "../campaign/campaignConstants.js";

export const TUTORIAL_PROGRESS_KEY = "tacticalArenaTutorialProgressV2";
export const TUTORIAL_PROGRESS_SEAL_KEY = "tacticalArenaTutorialProgressSealV1";
export const TUTORIAL_PROGRESS_BACKUP_KEY = "tacticalArenaTutorialProgressBackupV1";
export const LEGACY_TUTORIAL_PROGRESS_KEY = "tacticalArenaTutorialProgress";
export const TUTORIAL_JUGGERNAUT_REWARD_UNIT = "juggernaut";
export const STARTER_UNIT_TYPES = Object.freeze(["swordsman", "archer", "mystic", "magician"]);
export const VALOR_RESOURCE = Object.freeze({
  id: "valor",
  name: "Valor",
  shortName: "Valor",
});
export const STARTING_VALOR_BALANCE = 0;
export const TUTORIAL_VALOR_REWARD = 500;

export const TUTORIAL_REWARD_SKIN_CHOICES = Object.freeze([
  Object.freeze({ type: "juggernaut", slug: "bio-mech" }),
  Object.freeze({ type: "swordsman", slug: "medieval" }),
  Object.freeze({ type: "archer", slug: "desert-warrior" }),
  Object.freeze({ type: "mystic", slug: "enlightened" }),
  Object.freeze({ type: "magician", slug: "summer-vibes" }),
]);

// Campaign skin-reward packs. Most packs grant one final choice forever. The
// Wandering Party grants one choice per campaign-progress run, so a progress reset
// lets players replay the campaign for another unowned wandering skin.
export const WANDERING_SKIN_PACK_ID = "wandering";
// Has-Been Heroes (campaign mission 12) grants the Mystic one of two curated looks
// after a friendly duel in town. Same one-final-pick rule as every campaign pack.
export const HASBEEN_MYSTIC_SKIN_PACK_ID = "hasbeen-mystic";
export const BROTHERS_UNIT_PACK_ID = "brothers";
export const OUT_OF_RETIREMENT_SKIN_REWARDS = Object.freeze([
  Object.freeze({ type: "angel", slug: "summer-vibes" }),
  Object.freeze({ type: "paladin", slug: "summer-vibes" }),
]);
export const CAMPAIGN_UNIT_PACKS = Object.freeze({
  [BROTHERS_UNIT_PACK_ID]: Object.freeze(["big-brother", "little-brother"]),
});
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
const RESET_REPLAYABLE_CAMPAIGN_SKIN_PACK_IDS = Object.freeze(new Set([WANDERING_SKIN_PACK_ID]));
const NECROMANCER_COMPANION_SKIN_SLUGS = Object.freeze(new Set([
  "arcane",
  "blood-moon",
  "fuck-cancer",
  "summer-vibes",
  "trick-or-treat",
  "void-dweller",
]));
const PROGRESS_SEAL_VERSION = 1;
const PROGRESS_SEAL_SECRET = "tactical-arena-progress-v1";
const CAMPAIGN_REWARD_RECOVERY = Object.freeze({
  [CLOD_MISSION_ID]: Object.freeze({ valorReward: 55, rewardUnits: Object.freeze(["clod"]) }),
  [NECROMANCER_MISSION_ID]: Object.freeze({ valorReward: 60, rewardUnits: Object.freeze(["necromancer"]) }),
  [WITCH_DOCTOR_MISSION_ID]: Object.freeze({ valorReward: 65, rewardUnits: Object.freeze(["witch-doctor"]) }),
  [FATHER_TIME_MISSION_ID]: Object.freeze({ valorReward: 70, rewardUnits: Object.freeze(["father-time"]) }),
  [VIRUS_MISSION_ID]: Object.freeze({ valorReward: 75, rewardUnits: Object.freeze(["virus"]) }),
  [PALADIN_MISSION_ID]: Object.freeze({ valorReward: 80, rewardUnits: Object.freeze(["paladin"]) }),
  [MONK_MISSION_ID]: Object.freeze({ valorReward: 90, rewardUnits: Object.freeze(["monk"]) }),
  [BROTHERS_MISSION_ID]: Object.freeze({ valorReward: 105 }),
  [GARGOYLE_MISSION_ID]: Object.freeze({ valorReward: 120, rewardUnits: Object.freeze(["gargoyle"]) }),
  [SNIPER_MISSION_ID]: Object.freeze({ valorReward: 135, rewardUnits: Object.freeze(["sniper"]) }),
  [WANDERING_PARTY_MISSION_ID]: Object.freeze({ valorReward: 150 }),
  [MINER_MISSION_ID]: Object.freeze({ valorReward: 165, rewardUnits: Object.freeze(["miner"]) }),
  [HASBEEN_HEROES_MISSION_ID]: Object.freeze({ valorReward: 180 }),
  [RONIN_MISSION_ID]: Object.freeze({ valorReward: 195, rewardUnits: Object.freeze(["ronin"]) }),
  [WRONG_PLACE_MISSION_ID]: Object.freeze({ valorReward: 210, rewardUnits: Object.freeze(["riot-cop"]) }),
  [OUT_OF_RETIREMENT_MISSION_ID]: Object.freeze({
    valorReward: 230,
    rewardUnits: Object.freeze(["angel"]),
    rewardSkins: OUT_OF_RETIREMENT_SKIN_REWARDS,
  }),
  [VOIDWOOD_MISSION_ID]: Object.freeze({
    valorReward: 250,
    rewardUnits: Object.freeze(["treant"]),
    rewardSkins: VOIDWOOD_SKIN_REWARDS,
  }),
  [SPIRIT_WOODS_MISSION_ID]: Object.freeze({ valorReward: 270, rewardUnits: Object.freeze(["mother-nature"]) }),
  [SHOWDOWN_MISSION_ID]: Object.freeze({ valorReward: 295, rewardUnits: SHOWDOWN_FAT_TYPES }),
  [NOT_MY_KING_MISSION_ID]: Object.freeze({ valorReward: 320, rewardUnits: Object.freeze(["king"]) }),
  [VOID_CASTLE_MISSION_ID]: Object.freeze({ valorReward: 350, rewardUnits: Object.freeze(["nemesis"]) }),
  [FINAL_BATTLE_MISSION_ID]: Object.freeze({ valorReward: 405, rewardUnits: Object.freeze(["blacksword"]) }),
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

function companionSkinsFor(skin) {
  if (skin?.type !== "necromancer" || !NECROMANCER_COMPANION_SKIN_SLUGS.has(skin.slug)) return [];
  return [Object.freeze({ type: "ghoul", slug: skin.slug })];
}

function withCompanionSkinUnlocks(values) {
  const out = [];
  for (const skin of Array.isArray(values) ? values : []) {
    out.push(skin, ...companionSkinsFor(skin));
  }
  return dedupeSkins(out);
}

function sameSkin(left, right) {
  return Boolean(left && right && left.type === right.type && left.slug === right.slug);
}

function progressOwnsSkin(progress, skin) {
  return progress.unlockedSkins.some((owned) => sameSkin(owned, skin));
}

function normalizeValorBalance(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : STARTING_VALOR_BALANCE;
}

function skinFromEntitlementId(value) {
  const parts = typeof value === "string" ? value.trim().split(":") : [];
  if (parts.length !== 3 || parts[0] !== "skin" || !parts[1] || !parts[2]) return null;
  return Object.freeze({ type: parts[1], slug: parts[2] });
}

function unitFromEntitlementId(value) {
  const parts = typeof value === "string" ? value.trim().split(":") : [];
  if (parts.length !== 2 || parts[0] !== "unit" || !parts[1]) return null;
  return parts[1];
}

function entitlementsFromServerSnapshot(snapshot) {
  const skins = [];
  const units = [];
  const entitlements = Array.isArray(snapshot?.entitlements) ? snapshot.entitlements : [];
  for (const entitlement of entitlements) {
    const entitlementId = typeof entitlement?.entitlementId === "string" ? entitlement.entitlementId : "";
    const skin = skinFromEntitlementId(entitlementId);
    if (skin) {
      skins.push(skin);
      continue;
    }
    const unit = unitFromEntitlementId(entitlementId);
    if (unit) units.push(unit);
  }
  return Object.freeze({
    skins: dedupeSkins(skins),
    units: uniqueStrings(units),
  });
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

function normalizeCampaignRewardUnits(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;
  for (const [packId, choices] of Object.entries(CAMPAIGN_UNIT_PACKS)) {
    const chosen = value[packId];
    if (typeof chosen === "string" && choices.includes(chosen)) out[packId] = chosen;
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
    valorBalance: STARTING_VALOR_BALANCE,
    tutorialValorGranted: false,
    campaignValorRewards: [],
    unlockedUnits: [...STARTER_UNIT_TYPES],
    campaignRewardUnits: {},
    campaignRewardSkins: {},
    campaignGrantedSkins: [],
    purchasedSkins: [],
    serverEntitlementUnits: [],
    serverEntitlementSkins: [],
    unlockedSkins: [],
  };
}

function sealHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function serializedProgress(progress) {
  return JSON.stringify(normalizeUnlockProgress(progress));
}

function progressSeal(serialized) {
  return `v${PROGRESS_SEAL_VERSION}:${serialized.length}:${sealHash(`${PROGRESS_SEAL_SECRET}|${serialized}`)}`;
}

function backupEnvelope(serialized) {
  return JSON.stringify({
    version: PROGRESS_SEAL_VERSION,
    progress: JSON.parse(serialized),
    seal: progressSeal(serialized),
  });
}

function parseProgress(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readStorageText(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function completedCampaignMissionIds(storage) {
  const value = parseProgress(readStorageText(storage, CAMPAIGN_PROGRESS_KEY));
  return uniqueStrings(value?.completedMissions);
}

function writeSealedProgress(storage, progress) {
  const serialized = serializedProgress(progress);
  try {
    storage?.setItem?.(TUTORIAL_PROGRESS_KEY, serialized);
    storage?.setItem?.(TUTORIAL_PROGRESS_SEAL_KEY, progressSeal(serialized));
    storage?.setItem?.(TUTORIAL_PROGRESS_BACKUP_KEY, backupEnvelope(serialized));
  } catch {
    // Storage failures should not block menu or tutorial flow.
  }
  return JSON.parse(serialized);
}

function readSealedBackupProgress(storage) {
  const envelope = parseProgress(readStorageText(storage, TUTORIAL_PROGRESS_BACKUP_KEY));
  if (!envelope || envelope.version !== PROGRESS_SEAL_VERSION || !envelope.progress || typeof envelope.seal !== "string") {
    return null;
  }
  const serialized = JSON.stringify(envelope.progress);
  return envelope.seal === progressSeal(serialized) ? normalizeUnlockProgress(envelope.progress) : null;
}

export function normalizeUnlockProgress(value = {}) {
  const completedTutorials = uniqueStrings(value.completedTutorials);
  const allTutorialsComplete = Boolean(value.allTutorialsComplete);
  const selectedRewardSkin = normalizeRewardSkin(value.selectedRewardSkin);
  const rewardGranted = Boolean(value.rewardGranted && selectedRewardSkin);
  const unlockedUnits = new Set([...STARTER_UNIT_TYPES, ...uniqueStrings(value.unlockedUnits)]);
  if (allTutorialsComplete) unlockedUnits.add(TUTORIAL_JUGGERNAUT_REWARD_UNIT);
  const valorBalance = normalizeValorBalance(value.valorBalance);
  const tutorialValorGranted = Boolean(value.tutorialValorGranted);
  const campaignValorRewards = uniqueStrings(value.campaignValorRewards);
  const campaignRewardUnits = normalizeCampaignRewardUnits(value.campaignRewardUnits);
  for (const type of Object.values(campaignRewardUnits)) unlockedUnits.add(type);
  const campaignRewardSkins = normalizeCampaignRewardSkins(value.campaignRewardSkins);
  const campaignGrantedSkins = dedupeSkins(value.campaignGrantedSkins);
  const purchasedSkins = dedupeSkins(value.purchasedSkins);
  const serverEntitlementUnits = uniqueStrings(value.serverEntitlementUnits);
  for (const type of serverEntitlementUnits) unlockedUnits.add(type);
  const serverEntitlementSkins = dedupeSkins(value.serverEntitlementSkins);
  // unlockedSkins is fully derived from the granted rewards (tutorial + campaign packs),
  // so it stays consistent no matter what an older/partial payload carried.
  const unlockedSkins = [];
  if (rewardGranted && selectedRewardSkin) unlockedSkins.push(selectedRewardSkin);
  for (const skin of Object.values(campaignRewardSkins)) unlockedSkins.push(skin);
  unlockedSkins.push(...campaignGrantedSkins);
  unlockedSkins.push(...withCompanionSkinUnlocks(purchasedSkins));
  unlockedSkins.push(...withCompanionSkinUnlocks(serverEntitlementSkins));
  return {
    completedTutorials,
    rewardChoices: [...TUTORIAL_REWARD_SKIN_CHOICES],
    selectedRewardSkin: rewardGranted ? selectedRewardSkin : null,
    rewardGranted,
    allTutorialsComplete,
    valorBalance,
    tutorialValorGranted,
    campaignValorRewards,
    unlockedUnits: [...unlockedUnits],
    campaignRewardUnits,
    campaignRewardSkins,
    campaignGrantedSkins,
    purchasedSkins,
    serverEntitlementUnits,
    serverEntitlementSkins,
    unlockedSkins: dedupeSkins(unlockedSkins),
  };
}

function repairUnlockProgressFromCampaignProgress(storage, progress) {
  const completed = completedCampaignMissionIds(storage);
  if (!completed.length) return progress;

  const unlockedUnits = new Set(progress.unlockedUnits);
  const campaignValorRewards = new Set(progress.campaignValorRewards);
  const campaignGrantedSkins = [...progress.campaignGrantedSkins];
  const campaignGrantedSkinKeys = new Set(campaignGrantedSkins.map((skin) => `${skin.type}:${skin.slug}`));
  let valorBalance = progress.valorBalance;
  let changed = false;

  for (const missionId of completed) {
    const recovery = CAMPAIGN_REWARD_RECOVERY[missionId];
    if (!recovery) continue;
    for (const type of recovery.rewardUnits ?? []) {
      if (unlockedUnits.has(type)) continue;
      unlockedUnits.add(type);
      changed = true;
    }
    for (const skin of recovery.rewardSkins ?? []) {
      const key = `${skin.type}:${skin.slug}`;
      if (campaignGrantedSkinKeys.has(key)) continue;
      campaignGrantedSkinKeys.add(key);
      campaignGrantedSkins.push(skin);
      changed = true;
    }
    if (recovery.valorReward > 0 && !campaignValorRewards.has(missionId)) {
      campaignValorRewards.add(missionId);
      valorBalance += recovery.valorReward;
      changed = true;
    }
  }

  return changed
    ? normalizeUnlockProgress({
      ...progress,
      valorBalance,
      campaignValorRewards: [...campaignValorRewards],
      unlockedUnits: [...unlockedUnits],
      campaignGrantedSkins,
    })
    : progress;
}

function finalizeReadUnlockProgress(storage, progress) {
  const repaired = repairUnlockProgressFromCampaignProgress(storage, progress);
  return repaired === progress ? progress : writeSealedProgress(storage, repaired);
}

export function readUnlockProgress(storage = defaultStorage()) {
  const fallback = () => readSealedBackupProgress(storage) ?? progressFallback();
  const raw = readStorageText(storage, TUTORIAL_PROGRESS_KEY);
  if (!raw) return finalizeReadUnlockProgress(storage, fallback());
  const parsed = parseProgress(raw);
  if (!parsed) return finalizeReadUnlockProgress(storage, fallback());

  const serialized = serializedProgress(parsed);
  const expectedSeal = progressSeal(serialized);
  const storedSeal = readStorageText(storage, TUTORIAL_PROGRESS_SEAL_KEY);

  if (storedSeal === expectedSeal) return finalizeReadUnlockProgress(storage, JSON.parse(serialized));
  if (storedSeal === progressSeal(raw)) return finalizeReadUnlockProgress(storage, writeSealedProgress(storage, parsed));

  const backup = readSealedBackupProgress(storage);
  if (backup) return finalizeReadUnlockProgress(storage, writeSealedProgress(storage, backup));

  if (!storedSeal) return finalizeReadUnlockProgress(storage, writeSealedProgress(storage, parsed));
  return progressFallback();
}

export function writeUnlockProgress(storage, progress) {
  return writeSealedProgress(storage, progress);
}

export function resetUnlockProgress(storage = defaultStorage()) {
  const current = readUnlockProgress(storage);
  const campaignRewardSkins = { ...current.campaignRewardSkins };
  const campaignGrantedSkins = [...current.campaignGrantedSkins];
  for (const packId of RESET_REPLAYABLE_CAMPAIGN_SKIN_PACK_IDS) {
    const chosen = campaignRewardSkins[packId];
    if (!chosen) continue;
    campaignGrantedSkins.push(chosen);
    delete campaignRewardSkins[packId];
  }
  const preservedOwnedSkins = {
    selectedRewardSkin: current.selectedRewardSkin,
    rewardGranted: current.rewardGranted,
    campaignRewardSkins,
    campaignGrantedSkins,
    purchasedSkins: current.purchasedSkins,
    serverEntitlementUnits: current.serverEntitlementUnits,
    serverEntitlementSkins: current.serverEntitlementSkins,
  };
  const resetProgress = writeUnlockProgress(storage, {
    ...progressFallback(),
    ...preservedOwnedSkins,
  });
  try {
    storage?.removeItem?.(LEGACY_TUTORIAL_PROGRESS_KEY);
  } catch {
    // Best-effort profile reset.
  }
  return resetProgress;
}

export function isProgressUnitUnlocked(type, storage = defaultStorage()) {
  return readUnlockProgress(storage).unlockedUnits.includes(type);
}

export function isProgressSkinUnlocked(type, slug, storage = defaultStorage()) {
  if (!slug) return true;
  return readUnlockProgress(storage).unlockedSkins.some((skin) => skin.type === type && skin.slug === slug);
}

export function mergeServerEntitlementsIntoUnlockProgress(storage = defaultStorage(), snapshot = {}) {
  const progress = readUnlockProgress(storage);
  const entitlements = entitlementsFromServerSnapshot(snapshot);
  const serverValorBalance = normalizeValorBalance(snapshot?.valorBalance);
  const valorBalance = Math.max(progress.valorBalance, serverValorBalance);
  if (!entitlements.skins.length && !entitlements.units.length && valorBalance === progress.valorBalance) return progress;
  return writeUnlockProgress(storage, {
    ...progress,
    valorBalance,
    serverEntitlementUnits: [...progress.serverEntitlementUnits, ...entitlements.units],
    serverEntitlementSkins: [...progress.serverEntitlementSkins, ...entitlements.skins],
  });
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
  enqueueGameProgressClaim(storage, buildTutorialSkinChoiceClaim({ choice: selectedRewardSkin }));
  return { accepted: true, progress: next };
}

export function getCampaignSkinRewardChoices(packId) {
  return CAMPAIGN_SKIN_PACKS[packId] ?? null;
}

export function getCampaignUnitRewardChoices(packId) {
  return CAMPAIGN_UNIT_PACKS[packId] ?? null;
}

export function getCampaignSkinReward(storage = defaultStorage(), packId) {
  return readUnlockProgress(storage).campaignRewardSkins[packId] ?? null;
}

export function getAvailableCampaignSkinRewardChoices(storage = defaultStorage(), packId) {
  const choices = CAMPAIGN_SKIN_PACKS[packId];
  if (!choices) return null;
  const progress = readUnlockProgress(storage);
  if (progress.campaignRewardSkins[packId]) return [];
  if (RESET_REPLAYABLE_CAMPAIGN_SKIN_PACK_IDS.has(packId)) {
    return choices.filter((choice) => !progressOwnsSkin(progress, choice));
  }
  return [...choices];
}

export function isCampaignSkinRewardGranted(storage = defaultStorage(), packId) {
  const choices = CAMPAIGN_SKIN_PACKS[packId];
  if (!choices) return false;
  const progress = readUnlockProgress(storage);
  if (progress.campaignRewardSkins[packId]) return true;
  if (RESET_REPLAYABLE_CAMPAIGN_SKIN_PACK_IDS.has(packId)) {
    return getAvailableCampaignSkinRewardChoices(storage, packId).length === 0;
  }
  return false;
}

export function getCampaignUnitReward(storage = defaultStorage(), packId) {
  return readUnlockProgress(storage).campaignRewardUnits[packId] ?? null;
}

export function isCampaignUnitRewardGranted(storage = defaultStorage(), packId) {
  const progress = readUnlockProgress(storage);
  if (progress.campaignRewardUnits[packId]) return true;
  const choices = CAMPAIGN_UNIT_PACKS[packId] ?? [];
  return choices.some((type) => progress.unlockedUnits.includes(type));
}

// Grant one skin from a campaign pack. Wandering can be earned again only after
// progress reset clears its run marker; all packs reject a second pick in the same run.
export function selectCampaignRewardSkin(storage = defaultStorage(), packId, choice, options = {}) {
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
  if (RESET_REPLAYABLE_CAMPAIGN_SKIN_PACK_IDS.has(packId) && progressOwnsSkin(progress, selected)) {
    return { accepted: false, errorCode: "CAMPAIGN_REWARD_ALREADY_OWNED", progress };
  }
  const next = writeUnlockProgress(storage, {
    ...progress,
    campaignRewardSkins: { ...progress.campaignRewardSkins, [packId]: { type: selected.type, slug: selected.slug } },
  });
  enqueueGameProgressClaim(storage, buildCampaignSkinChoiceClaim({
    packId,
    choice: selected,
    missionId: options.missionId,
    stars: options.stars,
  }));
  return { accepted: true, progress: next };
}

export function selectCampaignRewardUnit(storage = defaultStorage(), packId, choice, options = {}) {
  const progress = readUnlockProgress(storage);
  const choices = CAMPAIGN_UNIT_PACKS[packId];
  if (!choices) {
    return { accepted: false, errorCode: "INVALID_UNIT_PACK", progress };
  }
  if (isCampaignUnitRewardGranted(storage, packId)) {
    return { accepted: false, errorCode: "CAMPAIGN_REWARD_ALREADY_GRANTED", progress };
  }
  const selected = typeof choice === "string" && choices.includes(choice) ? choice : null;
  if (!selected) {
    return { accepted: false, errorCode: "INVALID_CAMPAIGN_REWARD", progress };
  }
  const next = writeUnlockProgress(storage, {
    ...progress,
    campaignRewardUnits: { ...progress.campaignRewardUnits, [packId]: selected },
  });
  enqueueGameProgressClaim(storage, buildCampaignUnitChoiceClaim({
    packId,
    choice: selected,
    missionId: options.missionId,
    stars: options.stars,
  }));
  return { accepted: true, progress: next };
}

export function grantPremiumSkinPurchase(storage = defaultStorage(), choice) {
  const progress = readUnlockProgress(storage);
  const selected = choice && typeof choice.type === "string" && typeof choice.slug === "string"
    ? { type: choice.type, slug: choice.slug }
    : null;
  if (!selected || selected.type === "ghoul") {
    return { accepted: false, errorCode: "INVALID_PREMIUM_SKIN", progress };
  }
  if (progress.purchasedSkins.some((skin) => skin.type === selected.type && skin.slug === selected.slug)) {
    return { accepted: false, errorCode: "PREMIUM_SKIN_ALREADY_OWNED", progress };
  }
  const next = writeUnlockProgress(storage, {
    ...progress,
    purchasedSkins: [...progress.purchasedSkins, selected],
  });
  return { accepted: true, progress: next };
}
