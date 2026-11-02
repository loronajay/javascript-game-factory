/** Stable world identities shared by travel, farms and regional crop rules. */
export const FARM_REGIONS = Object.freeze([
  Object.freeze({ id: "mainland", title: "The Mainland", climate: "temperate", available: true, harborId: "mainland-harbor" }),
  Object.freeze({ id: "orchard-isle", title: "Orchard Isle", climate: "warm-coastal", available: true, harborId: "orchard-harbor" }),
] as const);
export type FarmRegionId = typeof FARM_REGIONS[number]["id"];

export function findFarmRegion(id: unknown) { return FARM_REGIONS.find((region) => region.id === id); }

/** Existing farms are all mainland farms; an unknown template never grants island access. */
export const FARM_PROPERTY_REGIONS: Readonly<Record<string, FarmRegionId>> = Object.freeze({ meadow: "mainland", "lot.smallholding": "mainland", "lot.estate": "mainland", "lot.orchard": "orchard-isle" });
export function farmRegionForProperty(propertyId?: string): FarmRegionId { return FARM_PROPERTY_REGIONS[propertyId ?? "meadow"] ?? "mainland"; }

/** Missing restrictions mean a general-purpose crop. Unknown regions are never valid. */
export function cropCanGrowInRegion(rule: Readonly<{ regions?: readonly string[] }> | null | undefined, regionId: unknown): boolean {
  return Boolean(rule && findFarmRegion(regionId) && (!rule.regions || rule.regions.includes(String(regionId))));
}
