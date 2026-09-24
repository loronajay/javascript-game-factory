// One-time rewards are explicit rather than derived from achievement points.
// Points describe trophy prestige; tickets describe the economy and may be
// balanced independently. Completeness is pinned against the achievement
// catalog in the reward tests.
export const LOVERS_LOST_ACHIEVEMENT_TICKET_REWARDS = Object.freeze({
    ll_found_again: 50,
    ll_his_side: 50,
    ll_her_side: 50,
    ll_both_sides: 100,
    ll_side_by_side: 50,
    ll_long_distance: 100,
    ll_in_sync: 250,
    ll_clean_start: 50,
    ll_four_moves: 50,
    ll_sharp_timing: 100,
    ll_clockwork: 250,
    ll_untouchable: 100,
    ll_perfect_run: 5500,
    ll_perfect_pair: 500,
    ll_sparks_fly: 50,
    ll_burning_bright: 100,
    ll_written_stars: 250,
    ll_dont_keep_waiting: 50,
    ll_heart_racing: 250,
    ll_no_time_to_lose: 500,
    ll_seconds_to_spare: 100,
    ll_mirror_image: 250,
    ll_lovers_never_die: 1000,
});
const ZERO_REPEATABLE = Object.freeze({ completion: 0, perfects: 0, noMiss: 0, sub60: 0, allPerfect: 0, total: 0 });
function completedOwnedLane(run) {
    if (run.mode === "local" || run.disconnected)
        return null;
    return run.ownedLanes
        .map((side) => run.lanes[side])
        .find((lane) => lane.active && lane.finished && lane.obstaclesFaced > 0) ?? null;
}
export function calculateLoversLostTicketReward({ run, unlockedIds = [] }) {
    const lane = completedOwnedLane(run);
    const repeatable = lane ? (() => {
        const completion = 5;
        const perfects = Math.min(5, Math.floor(lane.perfects / 20));
        const noMiss = lane.misses === 0 ? 3 : 0;
        const sub60 = lane.finishFrame !== null && lane.finishFrame <= 60 * 60 ? 2 : 0;
        const allPerfect = lane.misses === 0 && lane.goods === 0 && lane.perfects === lane.obstaclesFaced ? 5 : 0;
        return { completion, perfects, noMiss, sub60, allPerfect, total: completion + perfects + noMiss + sub60 + allPerfect };
    })() : { ...ZERO_REPEATABLE };
    const achievements = (run.disconnected ? [] : [...new Set(unlockedIds)])
        .map((id) => ({ id, amount: Number(LOVERS_LOST_ACHIEVEMENT_TICKET_REWARDS[id]) || 0 }))
        .filter((entry) => entry.amount > 0);
    const achievementTotal = achievements.reduce((total, entry) => total + entry.amount, 0);
    return {
        repeatable,
        achievements,
        achievementTotal,
        total: repeatable.total + achievementTotal,
    };
}
