import { findFishingLure, findFishingRod, STARTER_ROD_ID, WORM_ID } from "./farm-catalog/fish.mjs";
/** Shared by every fishing destination, scoped to this farmer on this browser. */
export function createFishingEquipmentStore(playerId, storage = () => localStorage) {
    const key = `farm.fishing-equipment.v1:${playerId}`;
    return {
        load() {
            try {
                const value = JSON.parse(storage().getItem(key) ?? "null");
                return {
                    rodId: findFishingRod(value?.rodId) ? value.rodId : STARTER_ROD_ID,
                    baitId: value?.baitId === WORM_ID || findFishingLure(value?.baitId) ? value.baitId : WORM_ID,
                };
            }
            catch {
                return { rodId: STARTER_ROD_ID, baitId: WORM_ID };
            }
        },
        save(equipment) {
            try {
                storage().setItem(key, JSON.stringify(equipment));
            }
            catch { /* Fishing still works when storage is unavailable. */ }
        },
    };
}
