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

export function applyCheatCode(storage = globalThis.localStorage, code = "") {
  if (normalizedCode(code) !== UNLOCK_EVERYTHING_CHEAT_CODE) {
    return { accepted: false, errorCode: "INVALID_CHEAT_CODE" };
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
