// Shared arithmetic mirrored by the API: four chickens use one pen place.
export type SpaceHome = Readonly<{ id: string; slots: number; species?: readonly string[] | null }>;
export type SpaceResident = Readonly<{ homeId: string | null; speciesId?: string; pregnant?: boolean }>;
export function livestockSpace(homeId: string, speciesId?: string): number {
  return homeId.endsWith("#pen") && speciesId === "livestock.chicken" ? 0.25 : 1;
}
export function occupiedSpace(homes: readonly SpaceHome[], herd: readonly SpaceResident[]): Map<string, number> {
  const counts = new Map(homes.map((home) => [home.id, 0]));
  for (const animal of herd) if (animal.homeId && counts.has(animal.homeId)) {
    counts.set(animal.homeId, counts.get(animal.homeId)! + livestockSpace(animal.homeId, animal.speciesId));
  }
  return counts;
}
export function freeYoungPlaces(homes: readonly SpaceHome[], herd: readonly SpaceResident[], speciesId?: string): number {
  const counts = occupiedSpace(homes, herd);
  const takes = (home: SpaceHome, species?: string): boolean => !species || !home.species || home.species.includes(species);
  // Large young need general housing. Reserve that first; chicks prefer their coop,
  // then space-efficient pens. A pregnancy must never reserve every species' space.
  const owed = herd.filter((animal) => animal.pregnant).sort((a,b) => Number(a.speciesId === "livestock.chicken") - Number(b.speciesId === "livestock.chicken"));
  for (const mother of owed) {
    const candidates = homes.filter((home) => takes(home, mother.speciesId)).slice().sort((a,b) => {
      if (mother.speciesId === "livestock.chicken") return Number(!a.species) - Number(!b.species) || livestockSpace(a.id, mother.speciesId) - livestockSpace(b.id, mother.speciesId);
      return 0;
    });
    const home = candidates.find((entry) => counts.get(entry.id)! + livestockSpace(entry.id, mother.speciesId) <= entry.slots);
    if (home) counts.set(home.id, counts.get(home.id)! + livestockSpace(home.id, mother.speciesId));
  }
  return homes.filter((home) => takes(home,speciesId)).reduce((sum,home) => sum + Math.max(0, Math.floor((home.slots - counts.get(home.id)!) / livestockSpace(home.id,speciesId))),0);
}
