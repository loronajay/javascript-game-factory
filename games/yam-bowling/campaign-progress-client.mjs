const GAME_SLUG = "yam-bowling";
const CLAIM_KIND = "circuit-clear";

function failed(error = "claim_failed") {
  return { ok: false, firstClear: false, error, achievement: null, unlockedBowlerSlug: null };
}

export function createCampaignProgressClient({ campaignStore, platformApi, onSnapshotApplied = () => {} }) {
  let ready = false;

  async function sync() {
    const snapshot = await platformApi.fetchGameProgress(GAME_SLUG).catch(() => null);
    if (!snapshot || typeof snapshot !== "object") return false;
    campaignStore.applyServerSnapshot(snapshot);
    onSnapshotApplied(snapshot);
    ready = true;
    return true;
  }

  async function claimCircuitClear(matchId) {
    if (!ready || typeof matchId !== "string" || !matchId) return failed("progress_not_ready");
    const before = new Set(campaignStore.getUnlockedBowlerSlugs());
    const result = await platformApi.recordGameProgressClaim(GAME_SLUG, {
      claimId: `${CLAIM_KIND}:${matchId}`,
      kind: CLAIM_KIND,
      sourceId: matchId,
      payload: { matchId },
    }).catch(() => null);
    if (!result?.ok || !result.progress) return failed(result?.error);

    campaignStore.applyServerSnapshot(result.progress);
    onSnapshotApplied(result.progress);
    const match = campaignStore.getSnapshot().earnedAchievementIds
      .map((achievementId) => ({ achievementId }))
      .at(-1);
    const unlockedBowlerSlug = campaignStore.getUnlockedBowlerSlugs()
      .find((slug) => !before.has(slug)) || null;
    return {
      ok: true,
      firstClear: Boolean(unlockedBowlerSlug),
      alreadyProcessed: Boolean(result.alreadyProcessed),
      achievementId: match?.achievementId || null,
      unlockedBowlerSlug,
    };
  }

  return { claimCircuitClear, isReady: () => ready, sync };
}
