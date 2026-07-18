import { CAMPAIGN_MISSIONS } from "../campaign/campaignContent.js";
import { writeCampaignProgress } from "../campaign/campaignProgress.js";
import { UNIT_TYPES } from "../core/unitCatalog.js";
import { TUTORIAL_IDS } from "../tutorials/basics.js";
import { SKIN_MANIFEST } from "../ui/skinManifest.generated.js";
import {
  CAMPAIGN_SKIN_PACKS,
  TUTORIAL_REWARD_SKIN_CHOICES,
  writeUnlockProgress,
} from "./unlocks.js";

export const UNLOCK_EVERYTHING_CHEAT_CODE = "poop";

function normalizedCode(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isCheatCodeEnabled({ location = globalThis.location } = {}) {
  if (!location?.href) return false;
  try {
    const url = new URL(location.href);
    if (url.searchParams.get("taCheats") === "1") return true;
    return url.protocol === "file:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export function applyCheatCode(storage = globalThis.localStorage, code = "", options = {}) {
  if (normalizedCode(code) !== UNLOCK_EVERYTHING_CHEAT_CODE) {
    return { accepted: false, errorCode: "INVALID_CHEAT_CODE" };
  }
  if (!(options.enabled ?? isCheatCodeEnabled(options))) {
    return { accepted: false, errorCode: "CHEATS_DISABLED" };
  }

  const allSkins = SKIN_MANIFEST.map(({ type, slug }) => ({ type, slug }));
  const selectedRewardSkin = TUTORIAL_REWARD_SKIN_CHOICES[0] ?? null;
  const campaignRewardSkins = Object.fromEntries(
    Object.entries(CAMPAIGN_SKIN_PACKS)
      .filter(([, choices]) => choices.length > 0)
      .map(([packId, choices]) => [packId, { type: choices[0].type, slug: choices[0].slug }]),
  );

  const unlockProgress = writeUnlockProgress(storage, {
    completedTutorials: [...TUTORIAL_IDS],
    selectedRewardSkin,
    rewardGranted: Boolean(selectedRewardSkin),
    allTutorialsComplete: true,
    unlockedUnits: Object.keys(UNIT_TYPES),
    campaignRewardSkins,
    campaignGrantedSkins: allSkins,
  });

  const campaignProgress = writeCampaignProgress(storage, {
    completedMissions: CAMPAIGN_MISSIONS.map(({ id }) => id),
    missionStars: Object.fromEntries(CAMPAIGN_MISSIONS.map(({ id }) => [id, 3])),
    seenMapCutscenes: [],
    seenPostMatchCutscenes: [],
  });

  return { accepted: true, unlockProgress, campaignProgress };
}
