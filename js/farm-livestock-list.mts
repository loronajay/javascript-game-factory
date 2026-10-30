import { livestockGrade, livestockSummary, type LivestockAnimal } from "./farm-livestock.mjs";
import { goodsState, HUNGRY_AT } from "./farm-livestock-care.mjs";
import { breedingRefusal, freePlacesForYoung } from "./farm-livestock-breeding.mjs";
import type { LivestockHome } from "./farm-livestock-housing.mjs";

export type HerdQuery = Readonly<{
  search: string;
  species: string;
  gender: string;
  status: string;
  sort: string;
}>;

/** A view of the herd only: filtering and sorting never change the saved animal order. */
export function queryLivestock(herd: readonly LivestockAnimal[], homes: readonly LivestockHome[], clock: number, level: number, query: HerdQuery): LivestockAnimal[] {
  const text = query.search.trim().toLowerCase();
  const homeNames = new Map(homes.map((home) => [home.id, home.title]));
  const ready = (animal: LivestockAnimal): boolean => goodsState(animal, animal.care).some((good) => good.ready);
  const filtered = herd.filter((animal) => {
    if (query.species && animal.speciesId !== query.species) return false;
    if (query.gender && animal.gender !== query.gender) return false;
    const summary = livestockSummary(animal, clock);
    if (text && !`${animal.name} ${summary.kind} ${summary.coat} ${homeNames.get(animal.homeId ?? "") ?? "field"}`.toLowerCase().includes(text)) return false;
    if (query.status === "ready" && !ready(animal)) return false;
    if (query.status === "hungry" && animal.care.hunger > HUNGRY_AT) return false;
    if (query.status === "young" && summary.stage !== "young") return false;
    if (query.status === "expecting" && !animal.care.pregnancy) return false;
    if (query.status === "breed") {
      const context = { clock, level, freePlaces: freePlacesForYoung(homes, herd, animal.speciesId) };
      if (!herd.some((sire) => breedingRefusal(animal, sire, context) === null)) return false;
    }
    return true;
  });
  const byName = (a: LivestockAnimal, b: LivestockAnimal): number => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return filtered.sort((a, b) => {
    let order = 0;
    if (query.sort === "species") order = (livestockSummary(a, clock).kind).localeCompare(livestockSummary(b, clock).kind);
    if (query.sort === "home") order = (homeNames.get(a.homeId ?? "") ?? "Field").localeCompare(homeNames.get(b.homeId ?? "") ?? "Field");
    if (query.sort === "grade") order = livestockGrade(b.stats) - livestockGrade(a.stats);
    if (query.sort === "hunger") order = a.care.hunger - b.care.hunger;
    if (query.sort === "ready") order = Number(ready(b)) - Number(ready(a));
    return order || byName(a, b);
  });
}
