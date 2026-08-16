const GAME_SLUG = "yam-bowling";
const CLAIM_KIND = "match-achievement";

export function createAchievementClient({
  achievementCore,
  platformApi,
  loadout,
  onEarned = () => {},
  onSnapshotApplied = () => {},
} = {}) {
  async function handleFinishedMatch(context = {}) {
    const detected = achievementCore?.detectMatchAchievements?.(context) || [];
    const earned = [];
    for (const achievementId of detected) {
      const result = await platformApi?.recordGameProgressClaim?.(GAME_SLUG, {
        claimId: `${CLAIM_KIND}:${achievementId}`,
        kind: CLAIM_KIND,
        sourceId: achievementId,
        payload: { achievementId },
      }).catch?.(() => null);
      if (!result?.ok || !result.progress) continue;
      loadout?.applyServerEntitlements?.(result.progress.entitlements || []);
      onSnapshotApplied(result.progress);
      if (!result.alreadyProcessed) earned.push(achievementId);
    }
    if (earned.length) onEarned(earned);
    return earned;
  }

  return { handleFinishedMatch };
}
