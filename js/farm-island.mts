import { findFarmRegion } from "./farm-regions.mjs";

/** URLs choose a public destination, never ownership or a different player's stock. */
export function travelRegion(search: URLSearchParams): "mainland" | "orchard-isle" {
  return search.get("region") === "orchard-isle" ? "orchard-isle" : "mainland";
}
export const ISLAND_PROPERTY = "lot.orchard";
export const ISLAND_ORCHARD_TREES = Object.freeze([
  { x: -8, z: 44 }, { x: 8, z: 44 }, { x: -14, z: 48 }, { x: 14, z: 48 },
  { x: -25, z: 34 }, { x: 30, z: 31 }, { x: -10, z: 54 }, { x: 10, z: 54 },
]);
export const ISLAND_PLACES = Object.freeze({
  ferry: { x: -6, z: 25, title: "Ferry to the Mainland" },
  market: { x: 0, z: 40, title: "Orchard Market" },
  farm: { x: 24, z: 39, title: "Orchard Homesteads" },
  residents: { x: 9, z: 31, title: "Island residents" },
});
export function islandPlaceInReach(point: { x: number; z: number }) {
  return (Object.entries(ISLAND_PLACES) as [keyof typeof ISLAND_PLACES, typeof ISLAND_PLACES[keyof typeof ISLAND_PLACES]][])
    .find(([, place]) => Math.hypot(point.x - place.x, point.z - place.z) < 2.8)?.[0] ?? null;
}
export function publicRegionUrl(place: "harbor" | "market", region: string, context = new URLSearchParams()): string {
  const query = new URLSearchParams(context);
  // Callers crossing the sea supply fresh context; local paths retain their visited property.
  query.delete("preview"); query.delete("area");
  query.set("region", findFarmRegion(region)?.id ?? "mainland");
  return `../${place}/index.html?${query}`;
}
