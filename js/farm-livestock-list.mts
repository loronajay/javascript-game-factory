import { livestockGrade, livestockSummary, type LivestockAnimal } from "./farm-livestock.mjs";
import { goodsState, HUNGRY_AT, FULL, SERVING } from "./farm-livestock-care.mjs";
import { breedingRefusal, freePlacesForYoung, pregnancyView } from "./farm-livestock-breeding.mjs";
import { LIVESTOCK_CATALOG, findLivestockSpecies } from "./farm-catalog/livestock.mjs";
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
    if (query.status === "needs_feed" && animal.care.hunger > FULL - SERVING) return false;
    if (query.status === "unhoused" && animal.homeId && homeNames.has(animal.homeId)) return false;
    if (query.status === "resting" && pregnancyView(animal, clock)?.stage !== "resting") return false;
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
    if (query.sort === "species") order = (findLivestockSpecies(a.speciesId)?.title ?? a.speciesId).localeCompare(findLivestockSpecies(b.speciesId)?.title ?? b.speciesId);
    if (query.sort === "home") order = (homeNames.get(a.homeId ?? "") ?? "Field").localeCompare(homeNames.get(b.homeId ?? "") ?? "Field");
    if (query.sort === "grade") order = livestockGrade(b.stats) - livestockGrade(a.stats);
    if (query.sort === "hunger") order = a.care.hunger - b.care.hunger;
    if (query.sort === "ready") order = Number(ready(b)) - Number(ready(a));
    return order || byName(a, b);
  });
}

/** Counts always describe the whole herd, independently of the roster's current page. */
export function livestockOverview(herd: readonly LivestockAnimal[], homes: readonly LivestockHome[], clock: number, level: number) {
  const ready = (animal: LivestockAnimal): number => goodsState(animal, animal.care).filter((good) => good.ready).length;
  const needsFeed = (animal: LivestockAnimal): boolean => animal.care.hunger <= FULL - SERVING;
  const query = { search: "", species: "", gender: "", sort: "species", status: "breed" };
  return {
    total: herd.length,
    readyAnimals: herd.filter((animal) => ready(animal) > 0).length,
    readyGoods: herd.reduce((sum, animal) => sum + ready(animal), 0),
    needsFeed: herd.filter(needsFeed).length,
    expecting: herd.filter((animal) => Boolean(animal.care.pregnancy)).length,
    breedReady: queryLivestock(herd, homes, clock, level, query).length,
    unhoused: herd.filter((animal) => !animal.homeId || !homes.some((home) => home.id === animal.homeId)).length,
    species: LIVESTOCK_CATALOG.map((species) => {
      const animals = herd.filter((animal) => animal.speciesId === species.id);
      return {
        id: species.id, title: species.title, total: animals.length,
        females: animals.filter((animal) => animal.gender === "female").length,
        males: animals.filter((animal) => animal.gender === "male").length,
        young: animals.filter((animal) => livestockSummary(animal, clock).stage === "young").length,
        ready: animals.filter((animal) => ready(animal) > 0).length,
        needsFeed: animals.filter(needsFeed).length,
      };
    }).filter((species) => species.total > 0),
  };
}

export function livestockPage<T>(animals: readonly T[], requested: number, size = 10) {
  const pageSize = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 10;
  const pages = Math.max(1, Math.ceil(animals.length / pageSize));
  const page = Math.max(0, Math.min(pages - 1, Number.isFinite(requested) ? Math.floor(requested) : 0));
  const start = page * pageSize;
  return { animals: animals.slice(start, start + pageSize), page, pages, start: animals.length ? start + 1 : 0, end: Math.min(start + pageSize, animals.length) };
}
