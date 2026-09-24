import { FARM_DECOR_CATALOG } from "./decor.mjs";
import { GROUND_CATALOG, DEFAULT_GROUND_ID, findGround } from "./ground.mjs";

export type FarmInventory = Readonly<{
  owns: (id: string) => boolean;
  grant: (id: string) => boolean;
  resolveGroundId: (id: string) => string;
}>;

export type FarmInventoryOptions = Readonly<{ ownedIds?: readonly string[] }>;

export function createFarmInventory(options: FarmInventoryOptions = {}): FarmInventory {
  const definitions = [...GROUND_CATALOG, ...FARM_DECOR_CATALOG];
  const known = new Set(definitions.filter((row) => row.unlock.type !== "achievement").map((row) => row.id));
  const starter = new Set(definitions.filter((row) => row.unlock.type === "starter").map((row) => row.id));
  const granted = new Set((options.ownedIds ?? []).filter((id) => known.has(id)));
  const owns = (id: string): boolean => known.has(id) && (starter.has(id) || granted.has(id));
  return Object.freeze({
    owns,
    grant(id) {
      if (!known.has(id)) return false;
      granted.add(id);
      return true;
    },
    resolveGroundId: (id) => owns(id) && findGround(id) ? id : DEFAULT_GROUND_ID,
  });
}
