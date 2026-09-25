import { createLayoutStore } from "../../../js/arcade-room-store.mjs";
import { createDefaultFarmLayout, farmCacheKey, normalizeFarmLayout } from "../../../js/farm-layout.mjs";
import { playablePets } from "./pets.js";

const FARM_LAYOUT_SPEC = Object.freeze({
  slug: "farm",
  cacheKey: farmCacheKey,
  normalize: normalizeFarmLayout,
  createDefault: createDefaultFarmLayout,
});

/** Read the canonical owner farm. Barnyard Dash deliberately has no write path. */
export async function loadFarmPets() {
  try {
    const store = createLayoutStore(FARM_LAYOUT_SPEC);
    const loaded = await Promise.race([
      store.load(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("farm load timed out")), 2500)),
    ]);
    return { pets: playablePets(loaded.layout), source: loaded.source };
  } catch {
    return { pets: playablePets(null), source: "fallback" };
  }
}
