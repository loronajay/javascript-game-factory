import { findFishingLure, findFishingRod, STARTER_ROD_ID, WORM_ID } from "./farm-catalog/fish.mjs";

export type FishingEquipment = { rodId: string; baitId: string };
type EquipmentStorage = Pick<Storage, "getItem" | "setItem">;

/** Shared by every fishing destination, scoped to this farmer on this browser. */
export function createFishingEquipmentStore(playerId: string, storage: () => EquipmentStorage = () => localStorage) {
  const key = `farm.fishing-equipment.v1:${playerId}`;
  return {
    load(): FishingEquipment {
      try {
        const value = JSON.parse(storage().getItem(key) ?? "null");
        return {
          rodId: findFishingRod(value?.rodId) ? value.rodId : STARTER_ROD_ID,
          baitId: value?.baitId === WORM_ID || findFishingLure(value?.baitId) ? value.baitId : WORM_ID,
        };
      } catch { return { rodId: STARTER_ROD_ID, baitId: WORM_ID }; }
    },
    save(equipment: FishingEquipment): void {
      try { storage().setItem(key, JSON.stringify(equipment)); } catch { /* Fishing still works when storage is unavailable. */ }
    },
  };
}
