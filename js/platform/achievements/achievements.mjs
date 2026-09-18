// Platform achievements — the cabinet-facing entry point.
//
// A game integrates in two lines:
//
//   const achievements = createAchievementReporter();          // once, at boot
//   achievements.reportRun("lovers-lost", runResult);          // after each run
//
// `reportRun` files the run with the platform (signed-in accounts only), and
// shows the platform toast for whatever the server says was newly earned.
// It never throws and never blocks: a signed-out player, a dead network or a
// refused run all resolve to null and show nothing. The game keeps no unlock
// state of its own — the collection lives on the account and is read back
// through the profile's achievements page.
import { createAchievementsApi } from "./achievements-api.mjs";
import { createAchievementToaster } from "./unlock-toast.mjs";
export { createAchievementsApi } from "./achievements-api.mjs";
export { createUnlockQueue, unlockKey } from "./unlock-queue.mjs";
export { createAchievementToaster, ACHIEVEMENT_TOAST_LAYER_ID } from "./unlock-toast.mjs";
export function createAchievementReporter(options = {}) {
    const api = options.api ?? createAchievementsApi();
    const toaster = options.toaster ?? createAchievementToaster();
    return {
        canReport() {
            return api.canSubmit();
        },
        async reportRun(gameSlug, run) {
            try {
                const response = await api.submitRun(gameSlug, run);
                if (response && Array.isArray(response.unlocked) && response.unlocked.length > 0) {
                    toaster.show(gameSlug, response.progress?.title || gameSlug, response.unlocked);
                }
                return response;
            }
            catch {
                return null;
            }
        },
    };
}
