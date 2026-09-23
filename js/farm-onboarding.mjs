// First-farm onboarding is a persisted state transition, separate from the
// pets panel's repeatable adoption actions. This keeps the one-time starter
// grant and required dog name atomic and makes reloads idempotent.
import { addPet, cleanPetName, normalizeFarmLayout } from "./farm-layout.mjs";
export function markFarmIntroSeen(layout) {
    if (layout.onboarding.introSeen)
        return layout;
    return normalizeFarmLayout({ ...layout, onboarding: { ...layout.onboarding, introSeen: true } });
}
export function completeFarmOnboarding(layout, name, random = Math.random) {
    if (layout.onboarding.status !== "needs_name")
        return Object.freeze({ ok: false, reason: "already_complete", layout });
    const cleaned = cleanPetName(name);
    if (!cleaned)
        return Object.freeze({ ok: false, reason: "invalid_name", layout });
    const adopted = addPet(layout, "pet.corgi", cleaned, random);
    if (!adopted.valid)
        return Object.freeze({ ok: false, reason: "already_complete", layout });
    const completed = normalizeFarmLayout({ ...adopted.layout, onboarding: { status: "complete", introSeen: true } });
    return Object.freeze({ ok: true, reason: "", layout: completed });
}
