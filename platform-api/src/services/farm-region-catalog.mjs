/** Stable world identities. Planned places are not travel unlocks or purchasable property. */
export const FARM_REGIONS = Object.freeze([
    Object.freeze({ id: "mainland", title: "The Mainland", climate: "temperate", available: true, harborId: "mainland-harbor" }),
    Object.freeze({ id: "orchard-isle", title: "Orchard Isle", climate: "warm-coastal", available: false, harborId: "orchard-harbor" }),
]);
export function findFarmRegion(id) { return FARM_REGIONS.find((region) => region.id === id); }
/** Existing farms are all mainland farms; an unknown template never grants island access. */
export const FARM_PROPERTY_REGIONS = Object.freeze({ meadow: "mainland", "lot.smallholding": "mainland", "lot.estate": "mainland" });
export function farmRegionForProperty(propertyId) { return FARM_PROPERTY_REGIONS[propertyId ?? "meadow"] ?? "mainland"; }
/** Missing restrictions mean a general-purpose crop. Unknown regions are never valid. */
export function cropCanGrowInRegion(rule, regionId) {
    return Boolean(rule && findFarmRegion(regionId) && (!rule.regions || rule.regions.includes(String(regionId))));
}
