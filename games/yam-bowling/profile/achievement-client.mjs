const GAME_SLUG = "yam-bowling";
const CLAIM_KIND = "match-achievement";
const CAREER_CLAIM_KIND = "career-match";

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
    const career = achievementCore?.summarizeCareerMatch?.(context) || null;
    if (career && context.progressId) {
      const careerResult = await platformApi?.recordGameProgressClaim?.(GAME_SLUG, {
        claimId: `${CAREER_CLAIM_KIND}:${context.progressId}`,
        kind: CAREER_CLAIM_KIND,
        sourceId: context.progressId,
        payload: career,
      }).catch?.(() => null);
      if (careerResult?.ok && careerResult.progress) {
        loadout?.applyServerEntitlements?.(careerResult.progress.entitlements || []);
        onSnapshotApplied(careerResult.progress);
        if (!careerResult.alreadyProcessed && Array.isArray(careerResult.entitlementIds)) {
          earned.push(...careerResult.entitlementIds
            .filter((id) => id.startsWith("badge:"))
            .map((id) => id.slice("badge:".length)));
        }
      }
    }
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
      if (!result.alreadyProcessed && !earned.includes(achievementId)) earned.push(achievementId);
    }
    if (earned.length) onEarned(earned);
    return earned;
  }

  return { handleFinishedMatch };
}
