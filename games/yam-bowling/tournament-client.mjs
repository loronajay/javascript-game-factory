const GAME_SLUG = "yam-bowling";

export function createTournamentClient({
  platformApi,
  loadout,
  voucherClient,
  onSnapshotApplied = () => {},
} = {}) {
  let state = null;

  async function sync() {
    const next = await platformApi?.fetchGameTournament?.(GAME_SLUG);
    if (!next?.event) return false;
    state = next;
    return true;
  }

  async function claimRound({ eventId, roundIndex, bowlerSlug } = {}) {
    const result = await platformApi?.claimGameTournamentRound?.(GAME_SLUG, {
      eventId,
      roundIndex,
      bowlerSlug,
    });
    if (!result?.ok || !result.tournament) return { ok: false, error: result?.error || "claim_failed" };
    state = result.tournament;
    if (result.progress) {
      loadout?.applyServerEntitlements?.(result.progress.entitlements || []);
      voucherClient?.applyProgress?.(result.progress);
      onSnapshotApplied(result.progress);
    }
    return result;
  }

  return {
    claimRound,
    getState: () => state,
    isReady: () => Boolean(state?.event),
    sync,
  };
}
