// Campaign + tutorial progress sync, in both directions.
//
// Valor and entitlements were already server-backed; *play* progress — which missions
// are cleared, how many stars each one scored, which tutorials are done — was not. It
// lived only in localStorage, so signing into the same account on a second device
// (notably the packaged Android app) showed a campaign at zero stars and no tutorials
// done, and any reward that hangs off that progress went with it.
//
// Two halves:
//   - push: a one-time backfill of the progress this device already has, expressed as
//     ordinary idempotent claims. Deliberately no Valor claims — the payout has already
//     been made locally and the balance is reconciled separately, so re-claiming it
//     would pay a second time.
//   - pull: fold the server's campaign rows and completed-tutorial list back into local
//     state. Both merges are unions that only ever move progress forward.

import {
  buildCampaignProgressClaim,
  buildCampaignSkinChoiceClaim,
  buildCampaignUnitChoiceClaim,
  buildTutorialCompleteClaim,
  buildTutorialSkinChoiceClaim,
  buildTutorialUnitRewardClaim,
  enqueueGameProgressClaim,
} from "./gameProgressClient.js";
import { readCampaignProgress, writeCampaignProgress } from "../campaign/campaignProgress.js";
import { TUTORIAL_JUGGERNAUT_REWARD_UNIT, readUnlockProgress, writeUnlockProgress } from "../progression/unlocks.js";
import { TUTORIAL_IDS } from "../tutorials/tutorialContent.js";

export const PLAY_PROGRESS_BACKFILL_FLAG = "tacticalArenaPlayProgressBackfilledV1";

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampStars(value) {
  const stars = Math.floor(Number(value));
  if (!Number.isFinite(stars)) return 0;
  return Math.max(0, Math.min(3, stars));
}

// Everything this device believes it has earned, as claims the server already knows how
// to process. Every claim id is deterministic, so a claim the server has already seen is
// a no-op — which is what makes running this safe even if the local flag is lost.
export function buildPlayProgressBackfillClaims(storage) {
  const campaign = readCampaignProgress(storage);
  const progress = readUnlockProgress(storage);
  const claims = [];

  for (const missionId of campaign.completedMissions) {
    claims.push(buildCampaignProgressClaim({ missionId, stars: campaign.missionStars[missionId] ?? 0 }));
  }
  for (const tutorialId of progress.completedTutorials) {
    claims.push(buildTutorialCompleteClaim({ tutorialId }));
  }

  // Reward PICKS have no other record. Mission rewards that are handed out automatically
  // are re-derived from campaign progress by unlocks.js, but a pick the player made — a
  // campaign reward pack, or the tutorial reward skin — exists only as this local field,
  // so it has to be asserted explicitly or it is lost with the device.
  for (const [packId, choice] of Object.entries(progress.campaignRewardSkins || {})) {
    claims.push(buildCampaignSkinChoiceClaim({ packId, choice }));
  }
  for (const [packId, choice] of Object.entries(progress.campaignRewardUnits || {})) {
    claims.push(buildCampaignUnitChoiceClaim({ packId, choice }));
  }
  if (progress.rewardGranted && progress.selectedRewardSkin) {
    claims.push(buildTutorialSkinChoiceClaim({ choice: progress.selectedRewardSkin }));
  }
  if (progress.allTutorialsComplete) {
    claims.push(buildTutorialUnitRewardClaim({ type: TUTORIAL_JUGGERNAUT_REWARD_UNIT }));
  }

  return claims.filter(Boolean);
}

// Queues the backfill once per device. The claims flush on the next sync pass like any
// other pending claim, so this works offline and survives a failed flush.
export function backfillLocalPlayProgress(storage) {
  if (!storage) return { queued: 0, alreadyBackfilled: false };
  let alreadyBackfilled = false;
  try {
    alreadyBackfilled = Boolean(storage.getItem(PLAY_PROGRESS_BACKFILL_FLAG));
  } catch {
    alreadyBackfilled = false;
  }
  if (alreadyBackfilled) return { queued: 0, alreadyBackfilled: true };

  let queued = 0;
  for (const claim of buildPlayProgressBackfillClaims(storage)) {
    if (enqueueGameProgressClaim(storage, claim).accepted) queued += 1;
  }
  try {
    storage.setItem(PLAY_PROGRESS_BACKFILL_FLAG, "1");
  } catch {
    // Best-effort: without the flag the backfill re-queues next boot, which is harmless
    // because every claim id is idempotent server-side.
  }
  return { queued, alreadyBackfilled: false };
}

// Fold the server's campaign rows into local campaign progress. A union that takes the
// better star count per mission, so neither side can walk the other backwards.
export function mergeServerCampaignProgress(storage, snapshot) {
  const rows = Array.isArray(snapshot?.campaignProgress) ? snapshot.campaignProgress : [];
  const current = readCampaignProgress(storage);
  if (!rows.length) return current;

  const completedMissions = new Set(current.completedMissions);
  const missionStars = { ...current.missionStars };
  let changed = false;
  for (const row of rows) {
    const missionId = cleanId(row?.missionId);
    if (!missionId) continue;
    const stars = clampStars(row?.stars);
    if (!completedMissions.has(missionId)) {
      completedMissions.add(missionId);
      changed = true;
    }
    if (stars > (missionStars[missionId] ?? 0)) {
      missionStars[missionId] = stars;
      changed = true;
    }
  }
  if (!changed) return current;

  // writeCampaignProgress normalizes: unknown mission ids are dropped and every
  // completed mission is floored at one star.
  return writeCampaignProgress(storage, { ...current, completedMissions: [...completedMissions], missionStars });
}

// Fold the server's completed-tutorial list into local unlock progress.
export function mergeServerTutorialProgress(storage, snapshot) {
  const serverIds = Array.isArray(snapshot?.completedTutorials) ? snapshot.completedTutorials : [];
  const progress = readUnlockProgress(storage);
  if (!serverIds.length) return progress;

  const completed = new Set(progress.completedTutorials);
  let changed = false;
  for (const value of serverIds) {
    const tutorialId = cleanId(value);
    if (!tutorialId || !TUTORIAL_IDS.includes(tutorialId) || completed.has(tutorialId)) continue;
    completed.add(tutorialId);
    changed = true;
  }
  if (!changed) return progress;

  const completedTutorials = TUTORIAL_IDS.filter((id) => completed.has(id));
  return writeUnlockProgress(storage, {
    ...progress,
    completedTutorials,
    // The server saying every tutorial is done is a legitimate source for this flag (it
    // is what grants the Juggernaut in normalize) — unlike a local flag, which the
    // authoritative entitlement merge deliberately distrusts.
    allTutorialsComplete: progress.allTutorialsComplete || TUTORIAL_IDS.every((id) => completed.has(id)),
  });
}

export function applyServerPlayProgress(storage, snapshot) {
  if (!snapshot) return { campaignProgress: null, unlockProgress: null };
  return {
    campaignProgress: mergeServerCampaignProgress(storage, snapshot),
    unlockProgress: mergeServerTutorialProgress(storage, snapshot),
  };
}
